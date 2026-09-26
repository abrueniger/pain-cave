// Analytics shared by main (SQLite) and the renderer's mockApi.
import { blockDurationS } from './blocks'
import { BEST_DURATIONS, type Best, type RideSummary, type Sample, type StatsOverview, type WeekStats } from './types'

export type RideBest = { durationS: number; watts: number }

/** Everything overview() needs per ride; main builds it with SQL, the mock via rideAgg(). */
export interface RideAgg {
  ride: RideSummary
  distanceKm: number
  zoneS: number[] // length 6, see WeekStats.zoneS
  bests: RideBest[]
}

const DAY_MS = 864e5
const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits

/** Same zones as the ride screen: 0 = no HR or < 50 % max HR, 1..5 = Z1..Z5. */
export const hrZone = (hr: number | null, maxHr: number) =>
  hr == null ? 0 : [50, 60, 70, 80, 90].filter(pct => hr * 100 >= maxHr * pct).length

/** Max rolling mean power per BEST_DURATIONS window (1 Hz samples, null = 0); windows longer than the ride are skipped. */
export function rollingBests(power: (number | null)[]): RideBest[] {
  const prefix = [0]
  for (const p of power) prefix.push(prefix[prefix.length - 1] + (p ?? 0))
  return BEST_DURATIONS.filter(d => d <= power.length).map(d => {
    let max = 0
    for (let i = d; i < prefix.length; i++) max = Math.max(max, prefix[i] - prefix[i - d])
    return { durationS: d, watts: Math.round(max / d) }
  })
}

export function rideAgg(ride: RideSummary, samples: Sample[], maxHr: number): RideAgg {
  const zoneS = [0, 0, 0, 0, 0, 0]
  let speed = 0
  for (const s of samples) {
    zoneS[hrZone(s.hr, maxHr)]++
    speed += s.speed ?? 0
  }
  return { ride, distanceKm: speed / 3600, zoneS, bests: rollingBests(samples.map(s => s.power)) }
}

const byStart = (aggs: RideAgg[]) =>
  aggs.slice().sort((a, b) => a.ride.startedAt.localeCompare(b.ride.startedAt) || a.ride.id - b.ride.id)

/** Best per duration; ties go to the earliest ride. */
function topBests(aggs: RideAgg[]): Best[] {
  const sorted = byStart(aggs)
  return BEST_DURATIONS.flatMap(d => {
    let best: Best | null = null
    for (const { ride, bests } of sorted) {
      const b = bests.find(x => x.durationS === d)
      if (b && (!best || b.watts > best.watts)) best = { durationS: d, watts: b.watts, rideId: ride.id, date: ride.startedAt }
    }
    return best ? [best] : []
  })
}

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const mondayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))

export function overview(aggs: RideAgg[], now = new Date()): StatsOverview {
  const monday = mondayOf(now)
  const weeks: WeekStats[] = Array.from({ length: 12 }, (_, i) => ({
    weekStart: dateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * (11 - i))),
    rides: 0, durationS: 0, kj: 0, distanceKm: 0, zoneS: [0, 0, 0, 0, 0, 0]
  }))
  const totals = { rides: 0, durationS: 0, kj: 0, distanceKm: 0 }
  for (const a of aggs) {
    const w = weeks.find(x => x.weekStart === dateKey(mondayOf(new Date(a.ride.startedAt))))
    for (const t of w ? [w, totals] : [totals]) {
      t.rides++
      t.durationS += a.ride.durationS
      t.kj += a.ride.kj
      t.distanceKm += a.distanceKm
    }
    if (w) a.zoneS.forEach((s, z) => (w.zoneS[z] += s))
  }
  for (const t of [...weeks, totals]) {
    t.kj = round(t.kj, 1)
    t.distanceKm = round(t.distanceKm, 2)
  }

  const bests90d = topBests(aggs.filter(a => Date.parse(a.ride.startedAt) >= now.getTime() - 90 * DAY_MS))
  const best20 = bests90d.find(b => b.durationS === 1200)

  const groups = new Map<number, RideSummary[]>()
  for (const { ride: r } of byStart(aggs)) {
    const planS = r.blocks?.reduce((s, b) => s + blockDurationS(b), 0)
    if (r.workoutId == null || !r.endedAt || !r.avgHr || planS == null || r.durationS < planS) continue
    groups.set(r.workoutId, [...(groups.get(r.workoutId) ?? []), r])
  }
  const workoutTrends = [...groups]
    .filter(([, rs]) => rs.length >= 2)
    .map(([workoutId, rs]) => ({
      workoutId,
      name: rs[rs.length - 1].workoutName ?? '',
      points: rs.map(r => ({ rideId: r.id, date: r.startedAt, avgPower: r.avgPower, avgHr: r.avgHr!, efficiency: round(r.avgPower / r.avgHr!, 3) }))
    }))

  return {
    weeks,
    bestsAllTime: topBests(aggs),
    bests90d,
    ftpEstimate: best20 ? Math.round(0.95 * best20.watts) : null,
    workoutTrends,
    totals
  }
}

/** Durations where this ride holds the all-time best. */
export const prs = (aggs: RideAgg[], rideId: number) =>
  topBests(aggs).filter(b => b.rideId === rideId).map(b => b.durationS)
