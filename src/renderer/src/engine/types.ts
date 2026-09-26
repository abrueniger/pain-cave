// Contract between the ride engine and the UI.
import type { Block, RideMode, RideStats, Sample } from '../../../shared/types'

export type RideState = 'ready' | 'running' | 'paused' | 'autoPaused' | 'finished'
export type HrZone = 0 | 1 | 2 | 3 | 4 | 5 // 0 = no data or below Z1

export interface BlockPosition {
  index: number
  count: number
  block: Block
  remainingS: number
  next: Block | null
}

/** Snapshot for the UI. A new object is emitted ~1 Hz and on every state/target change. */
export interface RideView {
  state: RideState
  mode: RideMode
  workoutName: string | null
  blocks: Block[] | null
  elapsedS: number // moving time
  target: number // effective ERG target (plan + offset, clamped) in W
  planTarget: number | null // planned: plan watts now without offset; free: null
  offset: number // planned: shift offset in W; free: always 0
  power3s: number | null
  cadence: number | null
  hr: number | null
  hrZone: HrZone
  block: BlockPosition | null // planned only
  totalRemainingS: number | null // planned only
  samples: Sample[] // everything recorded so far, for the chart
  stats: RideStats
  rideId: number | null
}

export interface RideController {
  view(): RideView
  subscribe(cb: (v: RideView) => void): () => void
  start(): Promise<void> // creates the DB ride, sends the first target
  pause(): void // manual pause; only resume() ends it
  resume(): void
  end(): Promise<void> // stops, flushes samples, writes stats (ride is saved)
  discard(): Promise<void> // after end(): deletes the ride again
  /** Change target by deltaW (free: target; planned: offset). Clamped to LIMITS. */
  shift(deltaW: number): void
  dispose(): void
}
