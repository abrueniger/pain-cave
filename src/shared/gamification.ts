// Gamification (docs/design-gamification.md §1): everything is replayed from the saved rides.
import { blockDurationS } from './blocks'
import { byStart, type RideAgg } from './stats'
import type {
  Achievements, FtpRecordEntry, LevelState, MilestoneFamily, MilestoneState, RecordEntry, RideGains, RideSummary,
  SpecialId, SpecialState, Tier, Unlock, Workout
} from './types'

export const TITLES = ['Rookie', 'Spinner', 'Grinder', 'Cave Dweller', 'Pain Seeker', 'Watt Machine', 'Legend'] as const
/** Cumulative XP to reach level n. */
export const xpFor = (n: number) => (n <= 2 ? 0 : Math.round(400 * (n - 1) ** 1.5))
export const titleFor = (level: number) => TITLES[Math.min(6, Math.floor(level / 5))]
export function levelFor(xp: number, rides: number) {
  if (rides === 0) return 1
  let n = 2
  while (xpFor(n + 1) <= xp) n++
  return n
}
export const xpOf = (ride: Pick<RideSummary, 'kj'>) => Math.round(ride.kj)

export function levelState(xp: number, rides: number): LevelState {
  const level = levelFor(xp, rides)
  return { xp, level, title: titleFor(level), levelStartXp: xpFor(level), nextLevelXp: xpFor(level + 1) }
}

/** Thresholds in display units; `value` per ride in base units, `unit` base units per display unit. */
export const MILESTONES: { family: MilestoneFamily; thresholds: number[]; unit: number; value: (a: RideAgg) => number }[] = [
  { family: 'distance', thresholds: [100, 500, 1000, 2500, 5000], unit: 1, value: a => a.distanceKm },
  { family: 'time', thresholds: [10, 50, 100, 250, 500], unit: 3600, value: a => a.ride.durationS },
  { family: 'rides', thresholds: [10, 50, 100, 250, 500], unit: 1, value: a => (a.ride.durationS >= 300 ? 1 : 0) },
  { family: 'pain', thresholds: [60, 300, 750, 1500, 3000], unit: 60, value: a => a.zoneS[4] + a.zoneS[5] }
]

export const SPECIALS: SpecialId[] = ['firstRide', 'firstPlanned', 'asPlanned', 'harderThanPlanned', 'rampTest']

/** Crashed (never finished) or ended before the last block. Same as RideReport. */
export const isIncomplete = (r: RideSummary) =>
  r.endedAt == null || (r.blocks != null && r.durationS < r.blocks.reduce((s, b) => s + blockDurationS(b), 0))

type WorkoutRef = Pick<Workout, 'id' | 'name' | 'category'>

const isRampTest = (r: RideSummary, workouts: WorkoutRef[]) => {
  const w = r.workoutId == null ? undefined : workouts.find(x => x.id === r.workoutId)
  return w ? w.category === 'Test' && w.name === 'Ramp test' : r.workoutName === 'Ramp test'
}

function special(id: SpecialId, { ride, plan }: RideAgg, workouts: WorkoutRef[]) {
  const done = ride.mode === 'planned' && ride.blocks != null && !isIncomplete(ride)
  const never = plan.minOffset != null && plan.minOffset >= -1 // −1 W absorbs rounding
  switch (id) {
    case 'firstRide': return true
    case 'firstPlanned': return done
    case 'asPlanned': return done && never
    case 'harderThanPlanned': return done && never && plan.plus10S >= 600
    case 'rampTest': return isRampTest(ride, workouts) && plan.atFtpS >= 60
  }
}

/** Level, milestones, records and specials from all saved rides (+ the stored FTP raises). */
export function achievements(aggs: RideAgg[], ftpRecords: FtpRecordEntry[] = [], workouts: WorkoutRef[] = []): Achievements {
  const sums = MILESTONES.map(() => 0)
  const milestones: MilestoneState[] = MILESTONES.map(m => ({
    family: m.family, total: 0, tiers: m.thresholds.map(threshold => ({ threshold, unlockedAt: null, rideId: null }))
  }))
  const specials: SpecialState[] = SPECIALS.map(id => ({ id, unlockedAt: null, rideId: null }))
  const records: RecordEntry[] = ftpRecords.map(r => ({ kind: 'ftp', ...r }))
  const bests = new Map<number, number>()
  let xp = 0
  for (const a of byStart(aggs)) {
    const { id: rideId, startedAt: date } = a.ride
    xp += xpOf(a.ride)
    MILESTONES.forEach((m, i) => {
      sums[i] += m.value(a)
      for (const t of milestones[i].tiers) {
        if (t.rideId == null && sums[i] >= t.threshold * m.unit) Object.assign(t, { unlockedAt: date, rideId })
      }
    })
    for (const { durationS, watts } of a.bests) {
      const prev = bests.get(durationS)
      if (prev != null && watts > prev) records.push({ kind: 'best', durationS, watts, prevWatts: prev, rideId, date })
      if (prev == null || watts > prev) bests.set(durationS, watts)
    }
    for (const s of specials) if (s.rideId == null && special(s.id, a, workouts)) Object.assign(s, { unlockedAt: date, rideId })
  }
  MILESTONES.forEach((m, i) => (milestones[i].total = sums[i] / m.unit))
  records.sort((x, y) => y.date.localeCompare(x.date)) // stable: same ride keeps 5 s → 20 min
  return { ...levelState(xp, aggs.length), milestones, records, specials }
}

/** What one ride added: XP, level without vs. with it, and what the replay attributes to it. */
export function gains(aggs: RideAgg[], rideId: number, workouts: WorkoutRef[] = []): RideGains {
  const all = achievements(aggs, [], workouts)
  const ride = aggs.find(a => a.ride.id === rideId)
  const xp = ride ? xpOf(ride.ride) : 0
  const milestones = all.milestones.flatMap(m => m.tiers.map((t, i) => ({ m, t, tier: (i + 1) as Tier })))
  const unlocked: Unlock[] = [
    ...all.records.filter(r => r.kind === 'best' && r.rideId === rideId).map((record): Unlock => ({ kind: 'record', record })),
    ...milestones.filter(x => x.t.rideId === rideId).sort((a, b) => b.tier - a.tier)
      .map(({ m, t, tier }): Unlock => ({ kind: 'milestone', family: m.family, tier, threshold: t.threshold })),
    ...all.specials.filter(s => s.rideId === rideId).map(({ id }): Unlock => ({ kind: 'special', id }))
  ]
  let nextUp: RideGains['nextUp'] = null
  for (const m of all.milestones) {
    const i = m.tiers.findIndex(t => t.rideId == null)
    if (i < 0) continue
    const { threshold } = m.tiers[i]
    if (!nextUp || m.total / threshold > nextUp.total / nextUp.threshold) {
      nextUp = { family: m.family, tier: (i + 1) as Tier, total: m.total, threshold }
    }
  }
  return {
    xp,
    before: levelState(all.xp - xp, aggs.length - (ride ? 1 : 0)),
    after: levelState(all.xp, aggs.length),
    unlocked,
    nextUp
  }
}

/** The entry to append when the FTP is set to `watts`, or null if it doesn't beat every earlier FTP. */
export function ftpRecord(records: FtpRecordEntry[], earlier: number[], watts: number, date: string): FtpRecordEntry | null {
  const prevWatts = Math.max(...earlier, ...records.map(r => r.watts))
  return watts > prevWatts ? { date, watts, prevWatts } : null
}
