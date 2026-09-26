import { describe, expect, it } from 'vitest'
import { overview, planAt, planFacts, prs, rideAgg, rollingBests } from './stats'
import type { Block, RideSummary, Sample } from './types'

const ride = (id: number, startedAt: string, extra: Partial<RideSummary> = {}): RideSummary => ({
  id, startedAt, endedAt: startedAt, mode: 'free', workoutId: null, workoutName: null, blocks: null, ftp: 200,
  durationS: 0, avgPower: 0, maxPower: 0, avgHr: null, maxHr: null, avgCadence: 0, kj: 0, ...extra
})
const samples = (power: (number | null)[], hr: number | null = null): Sample[] =>
  power.map((p, tS) => ({ tS, power: p, targetPower: 100, cadence: 90, hr, speed: 36 }))

describe('rollingBests', () => {
  it('finds the max rolling mean per window, null = 0, skips windows longer than the ride', () => {
    expect(rollingBests([100, 100, 400, 400, 400, 400, 0, 0])).toEqual([{ durationS: 5, watts: 340 }])
    expect(rollingBests([null, 500, 500, 500, 500, null])).toEqual([{ durationS: 5, watts: 400 }])
    expect(rollingBests([1, 2, 3])).toEqual([])
    const p = Array.from({ length: 1200 }, (_, i) => (i >= 600 && i < 660 ? 400 : 200))
    expect(rollingBests(p)).toEqual([
      { durationS: 5, watts: 400 }, { durationS: 60, watts: 400 }, { durationS: 300, watts: 240 }, { durationS: 1200, watts: 210 }
    ])
  })
})

describe('overview', () => {
  const now = new Date(2026, 8, 23, 12) // Wednesday
  it('buckets rides into 12 Monday-based weeks with zones and distance', () => {
    const aggs = [
      rideAgg(ride(1, new Date(2026, 8, 21, 0, 30).toISOString(), { durationS: 3, kj: 1.5 }), samples([100, 100, 100], 150), 200),
      rideAgg(ride(2, new Date(2026, 8, 20, 23).toISOString(), { durationS: 2, kj: 1 }), samples([100, 100]), 200),
      rideAgg(ride(3, new Date(2025, 0, 1).toISOString(), { durationS: 10, kj: 5 }), samples([100]), 200)
    ]
    const o = overview(aggs, now)
    expect(o.weeks.map(w => w.weekStart)).toEqual([
      '2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03', '2026-08-10',
      '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'
    ])
    expect(o.weeks[11]).toEqual({ weekStart: '2026-09-21', rides: 1, durationS: 3, kj: 1.5, distanceKm: 0.03, zoneS: [0, 0, 0, 3, 0, 0] })
    expect(o.weeks[10]).toMatchObject({ rides: 1, durationS: 2, zoneS: [2, 0, 0, 0, 0, 0] })
    expect(o.totals).toEqual({ rides: 3, durationS: 15, kj: 7.5, distanceKm: 0.06 })
  })

  it('bests: all time vs 90 days, ties go to the earliest ride, FTP estimate from 20 min', () => {
    const p = (w: number) => Array(1200).fill(w)
    const aggs = [
      rideAgg(ride(1, '2026-01-01T10:00:00Z'), samples(p(300)), 200),
      rideAgg(ride(2, '2026-09-01T10:00:00Z'), samples(p(250)), 200),
      rideAgg(ride(3, '2026-09-10T10:00:00Z'), samples(p(250)), 200)
    ]
    const o = overview(aggs, now)
    expect(o.bestsAllTime.map(b => b.rideId)).toEqual([1, 1, 1, 1])
    expect(o.bests90d.map(b => [b.rideId, b.watts])).toEqual([[2, 250], [2, 250], [2, 250], [2, 250]])
    expect(o.ftpEstimate).toBe(238)
    expect(prs(aggs, 1)).toEqual([5, 60, 300, 1200])
    expect(prs(aggs, 3)).toEqual([])
    expect(overview([], now)).toMatchObject({ bestsAllTime: [], ftpEstimate: null, workoutTrends: [] })
  })

  it('trends only use completed rides with HR, per workout with at least 2 of them', () => {
    const plan = [{ type: 'steady' as const, durationS: 60, watts: 200 }]
    const w = { mode: 'planned' as const, workoutId: 9, workoutName: 'SS', blocks: plan, durationS: 60, avgPower: 200, avgHr: 160 }
    const aggs = [
      ride(1, '2026-09-01T10:00:00Z', w),
      ride(2, '2026-09-02T10:00:00Z', { ...w, durationS: 59 }), // aborted
      ride(3, '2026-09-03T10:00:00Z', { ...w, avgHr: null }), // no HR
      ride(4, '2026-09-04T10:00:00Z', { ...w, endedAt: null }), // crashed
      ride(5, '2026-09-05T10:00:00Z', { ...w, avgPower: 220, workoutName: 'SS new' }),
      ride(6, '2026-09-05T10:00:00Z', { ...w, workoutId: 10 })
    ].map(r => rideAgg(r, [], 200))
    expect(overview(aggs, now).workoutTrends).toEqual([{
      workoutId: 9, name: 'SS new', points: [
        { rideId: 1, date: '2026-09-01T10:00:00Z', avgPower: 200, avgHr: 160, efficiency: 1.25 },
        { rideId: 5, date: '2026-09-05T10:00:00Z', avgPower: 220, avgHr: 160, efficiency: 1.375 }
      ]
    }])
  })
})

describe('plan facts', () => {
  const blocks: Block[] = [{ type: 'ramp', durationS: 3, startWatts: 100, endWatts: 105 }, { type: 'steady', durationS: 2, watts: 200 }]
  const at = (targets: number[]): Sample[] => targets.map((t, tS) => ({ tS, power: null, targetPower: t, cadence: null, hr: null, speed: null }))

  it('planAt: ramps linear and rounded like the engine, null after the plan', () => {
    expect([0, 1, 2, 3, 4, 5].map(t => planAt(blocks, t))).toEqual([100, 102, 103, 200, 200, null])
  })

  it('min offset and seconds at +10 W over the plan, seconds at or above the ride FTP', () => {
    expect(planFacts({ blocks, ftp: 200 }, at([100, 112, 102, 215, 220, 250]))).toEqual({ minOffset: -1, plus10S: 3, atFtpS: 3 })
    expect(planFacts({ blocks: null, ftp: 200 }, at([200, 150]))).toEqual({ minOffset: null, plus10S: 0, atFtpS: 1 })
    expect(rideAgg(ride(1, '2026-09-01T10:00:00Z'), [], 175).plan).toEqual({ minOffset: null, plus10S: 0, atFtpS: 0 })
  })
})
