import { describe, expect, it } from 'vitest'
import { achievements, ftpRecord, gains, levelFor, levelState, titleFor, xpFor } from './gamification'
import type { PlanFacts, RideAgg, RideBest } from './stats'
import type { Block, RideSummary } from './types'

const day = (d: number) => new Date(Date.UTC(2026, 8, d, 10)).toISOString()
const agg = (id: number, d: number, o: {
  ride?: Partial<RideSummary>; km?: number; zoneS?: number[]; bests?: RideBest[]; plan?: Partial<PlanFacts>
} = {}): RideAgg => ({
  ride: {
    id, startedAt: day(d), endedAt: day(d), mode: 'free', workoutId: null, workoutName: null, blocks: null, ftp: 200,
    durationS: 3600, avgPower: 0, maxPower: 0, avgHr: null, maxHr: null, avgCadence: 0, kj: 500, ...o.ride
  },
  distanceKm: o.km ?? 30,
  zoneS: o.zoneS ?? [0, 0, 0, 0, 0, 0],
  bests: o.bests ?? [],
  plan: { minOffset: null, plus10S: 0, atFtpS: 0, ...o.plan }
})
const plan: Block[] = [{ type: 'steady', durationS: 3600, watts: 200 }]
const planned = (o: Partial<RideSummary> = {}): Partial<RideSummary> => ({ mode: 'planned', workoutId: 1, workoutName: 'SS', blocks: plan, ...o })

describe('levels', () => {
  it('xpFor, levelFor and titleFor match the spec table', () => {
    expect([2, 3, 4, 5, 8, 9, 10, 11, 15, 20, 25, 30].map(xpFor))
      .toEqual([0, 1131, 2078, 3200, 7408, 9051, 10800, 12649, 20953, 33128, 47030, 62468])
    expect(xpFor(1)).toBe(0)
    expect(levelFor(0, 0)).toBe(1)
    expect(levelFor(5000, 0)).toBe(1)
    expect(levelFor(0, 1)).toBe(2)
    expect(levelFor(1130, 3)).toBe(2)
    expect(levelFor(1131, 3)).toBe(3)
    expect(levelFor(9050, 9)).toBe(8)
    expect(levelFor(9051, 9)).toBe(9)
    expect(levelFor(62467, 99)).toBe(29)
    expect(levelFor(62468, 99)).toBe(30)
    expect(levelFor(1e6, 99)).toBeGreaterThan(30)
    expect([1, 4, 5, 9, 10, 29, 30, 120].map(titleFor))
      .toEqual(['Rookie', 'Rookie', 'Spinner', 'Spinner', 'Grinder', 'Watt Machine', 'Legend', 'Legend'])
    expect(levelState(8634, 20)).toEqual({ xp: 8634, level: 8, title: 'Spinner', levelStartXp: 7408, nextLevelXp: 9051 })
  })

  it('XP = sum of rounded kJ; no rides = level 1, the first ride always gives level 2', () => {
    expect(achievements([])).toMatchObject({ xp: 0, level: 1, title: 'Rookie', levelStartXp: 0, nextLevelXp: 0, records: [] })
    expect(achievements([agg(1, 1, { ride: { kj: 0.4 } })])).toMatchObject({ xp: 0, level: 2 })
    expect(achievements([agg(1, 1, { ride: { kj: 600.5 } }), agg(2, 2, { ride: { kj: 530.4 } })])).toMatchObject({ xp: 1131, level: 3 })
  })
})

describe('milestones', () => {
  it('unlock on the ride whose total first reaches the threshold, replayed by startedAt then id', () => {
    const aggs = [
      agg(3, 5, { km: 40, zoneS: [0, 0, 0, 0, 1800, 1800] }), // same start as 2, higher id → later
      agg(2, 5, { km: 40, ride: { durationS: 299 } }),
      agg(1, 1, { km: 30, zoneS: [0, 0, 0, 0, 0, 1800] })
    ]
    const [distance, time, rides, pain] = achievements(aggs).milestones
    expect(distance.family).toBe('distance')
    expect(distance.total).toBe(110)
    expect(distance.tiers[0]).toEqual({ threshold: 100, unlockedAt: day(5), rideId: 3 })
    expect(distance.tiers.slice(1).every(t => t.rideId == null && t.unlockedAt == null)).toBe(true)
    expect(time.total).toBeCloseTo(7499 / 3600)
    expect(rides.total).toBe(2) // 299 s doesn't count
    expect(pain).toMatchObject({ total: 90, tiers: [{ threshold: 60, rideId: 3 }, { threshold: 300, rideId: null }, {}, {}, {}] })
  })

  it('counts time in hours, rides of 5 min or more, several tiers from one ride', () => {
    const aggs = Array.from({ length: 10 }, (_, i) => agg(i + 1, i + 1, { km: i === 9 ? 5000 : 0, ride: { durationS: 3600 } }))
    const [distance, time, rides] = achievements(aggs).milestones
    expect(distance.tiers.map(t => t.rideId)).toEqual([10, 10, 10, 10, 10])
    expect(time.tiers[0]).toMatchObject({ threshold: 10, rideId: 10 })
    expect(rides.tiers[0]).toMatchObject({ threshold: 10, rideId: 10 })
    expect(achievements(aggs.slice(0, 9)).milestones[1].tiers[0].rideId).toBeNull()
  })
})

describe('records', () => {
  const b = (watts: number, durationS = 300) => ({ durationS, watts })
  it('first value is the baseline, strictly higher creates a record, newest first, FTP raises merged by date', () => {
    const aggs = [
      agg(1, 1, { bests: [b(264, 5), b(250)] }),
      agg(2, 2, { bests: [b(250)] }), // equal → nothing
      agg(3, 3, { bests: [b(270, 5), b(268), b(230, 1200)] }), // 20 min baseline here
      agg(4, 4, { bests: [b(260)] }),
      agg(5, 5, { bests: [b(240, 1200)] })
    ]
    const ftp = { date: new Date(Date.UTC(2026, 8, 3, 12)).toISOString(), watts: 214, prevWatts: 205 }
    expect(achievements(aggs, [ftp]).records).toEqual([
      { kind: 'best', durationS: 1200, watts: 240, prevWatts: 230, rideId: 5, date: day(5) },
      { kind: 'ftp', ...ftp },
      { kind: 'best', durationS: 5, watts: 270, prevWatts: 264, rideId: 3, date: day(3) },
      { kind: 'best', durationS: 300, watts: 268, prevWatts: 250, rideId: 3, date: day(3) }
    ])
  })

  it('ftpRecord: only when above every earlier FTP and record', () => {
    const date = day(9)
    expect(ftpRecord([], [200, 0], 214, date)).toEqual({ date, watts: 214, prevWatts: 200 })
    expect(ftpRecord([], [200, 0], 200, date)).toBeNull()
    expect(ftpRecord([{ date, watts: 230, prevWatts: 214 }], [200, 210], 225, date)).toBeNull() // below an earlier raise
    expect(ftpRecord([{ date, watts: 230, prevWatts: 214 }], [200, 210], 231, date)).toEqual({ date, watts: 231, prevWatts: 230 })
    expect(ftpRecord([], [180, 250], 240, date)).toBeNull() // current setting counts as earlier FTP
  })
})

describe('specials', () => {
  const unlocked = (aggs: RideAgg[], workouts = [] as { id: number; name: string; category: null | 'Test' }[]) =>
    Object.fromEntries(achievements(aggs, [], workouts).specials.map(s => [s.id, s.rideId]))

  it('first ride, first planned, as planned, harder than planned', () => {
    expect(unlocked([])).toEqual({ firstRide: null, firstPlanned: null, asPlanned: null, harderThanPlanned: null, rampTest: null })
    expect(unlocked([
      agg(1, 1, { plan: { minOffset: null } }), // free ride
      agg(2, 2, { ride: planned({ durationS: 3599 }), plan: { minOffset: 0, plus10S: 3000 } }), // incomplete
      agg(3, 3, { ride: planned({ endedAt: null }), plan: { minOffset: 0 } }), // crashed
      agg(4, 4, { ride: planned(), plan: { minOffset: -2, plus10S: 900 } }), // shifted below
      agg(5, 5, { ride: planned(), plan: { minOffset: -1, plus10S: 599 } }), // −1 tolerated, 599 s too short
      agg(6, 6, { ride: planned(), plan: { minOffset: 10, plus10S: 600 } })
    ])).toEqual({ firstRide: 1, firstPlanned: 4, asPlanned: 5, harderThanPlanned: 6, rampTest: null })
    expect(unlocked([agg(1, 1, { ride: planned(), plan: { minOffset: 0, plus10S: 1200 } })]))
      .toMatchObject({ firstPlanned: 1, asPlanned: 1, harderThanPlanned: 1 })
  })

  it('ramp test: Test workout named "Ramp test" (else ride name), ≥ 60 s at FTP, completion not required', () => {
    const ramp = (o: Partial<RideSummary>, atFtpS = 60) => [agg(1, 1, { ride: planned({ durationS: 900, ...o }), plan: { atFtpS } })]
    const lib = [{ id: 1, name: 'Ramp test', category: 'Test' as const }]
    expect(unlocked(ramp({ workoutName: 'Ramp test' }), lib).rampTest).toBe(1)
    expect(unlocked(ramp({ workoutName: 'Ramp test' }, 59), lib).rampTest).toBeNull()
    expect(unlocked(ramp({ workoutName: 'Ramp test' }), [{ id: 1, name: 'Ramp test', category: null }]).rampTest).toBeNull()
    expect(unlocked(ramp({ workoutName: 'Old name' }), lib).rampTest).toBe(1) // workout still exists
    expect(unlocked(ramp({ workoutName: 'Ramp test' })).rampTest).toBe(1) // workout deleted → name fallback
    expect(unlocked(ramp({ workoutName: 'Ramp' })).rampTest).toBeNull()
  })
})

describe('gains', () => {
  it('level up with unlocks in order records, milestones (higher tier first), specials', () => {
    const aggs = [
      agg(1, 1, { ride: { kj: 1000 }, km: 90, bests: [{ durationS: 5, watts: 500 }] }),
      agg(2, 2, { ride: { kj: 200 }, km: 450, bests: [{ durationS: 5, watts: 510 }] })
    ]
    const g = gains(aggs, 2)
    expect(g.xp).toBe(200)
    expect(g.before).toMatchObject({ xp: 1000, level: 2 })
    expect(g.after).toMatchObject({ xp: 1200, level: 3, title: 'Rookie' })
    expect(g.unlocked).toEqual([
      { kind: 'record', record: { kind: 'best', durationS: 5, watts: 510, prevWatts: 500, rideId: 2, date: day(2) } },
      { kind: 'milestone', family: 'distance', tier: 2, threshold: 500 },
      { kind: 'milestone', family: 'distance', tier: 1, threshold: 100 }
    ])
    expect(gains(aggs, 1).unlocked).toEqual([{ kind: 'special', id: 'firstRide' }])
    expect(gains(aggs, 1).before).toMatchObject({ xp: 200, level: 2 })
    expect(gains([aggs[0]], 1).before).toMatchObject({ xp: 0, level: 1 })
  })

  it('nothing unlocked: nextUp is the locked tier with the highest progress', () => {
    const aggs = [agg(1, 1, { km: 50, ride: { kj: 100 } }), agg(2, 2, { km: 20, zoneS: [0, 0, 0, 0, 3000, 0], ride: { kj: 100 } })]
    const g = gains(aggs, 2)
    expect(g.unlocked).toEqual([])
    expect(g.before.level).toBe(g.after.level)
    expect(g.nextUp).toEqual({ family: 'pain', tier: 1, total: 50, threshold: 60 }) // 83 % beats 70 km / 100 km
    expect(gains(aggs, 99)).toMatchObject({ xp: 0, unlocked: [], before: { xp: 200 }, after: { xp: 200 } })
  })
})
