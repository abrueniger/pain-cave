// STUB – implemented by the engine agent. Signatures are the contract.
import type { Block } from '../../../shared/types'
import type { BlockPosition } from './types'

export function workoutDurationS(blocks: Block[]): number {
  return blocks.reduce((s, b) => s + b.durationS, 0)
}

/** Planned watts at moving time tS (ramps linear). null once the workout is over. */
export function planTargetAt(_blocks: Block[], _tS: number): number | null {
  throw new Error('not implemented')
}

/** Current block at tS. null once the workout is over. */
export function blockAt(_blocks: Block[], _tS: number): BlockPosition | null {
  throw new Error('not implemented')
}
