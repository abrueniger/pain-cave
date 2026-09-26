import { blockDurationS, resolveBlocks } from '../../../shared/blocks'
import type { Block, Workout } from '../../../shared/types'
import type { BlockPosition, ResolvedBlock } from './types'

/** A workout's blocks as a ride uses them (absolute watts, intervals expanded). */
export const resolvePlan = (w: Pick<Workout, 'blocks' | 'unit'>, ftp: number) => resolveBlocks(w.blocks, w.unit, ftp) as ResolvedBlock[]

export function workoutDurationS(blocks: Block[]): number {
  return blocks.reduce((s, b) => s + blockDurationS(b), 0)
}

/** Planned watts at moving time tS (ramps linear). null once the workout is over. */
export function planTargetAt(blocks: ResolvedBlock[], tS: number): number | null {
  const pos = blockAt(blocks, tS)
  if (!pos) return null
  const b = pos.block
  if (b.type === 'steady') return b.watts
  const f = (b.durationS - pos.remainingS) / b.durationS
  return Math.round(b.startWatts + (b.endWatts - b.startWatts) * f)
}

/** Current block at tS. null once the workout is over. */
export function blockAt(blocks: ResolvedBlock[], tS: number): BlockPosition | null {
  let start = 0
  for (let i = 0; i < blocks.length; i++) {
    const end = start + blocks[i].durationS
    if (tS < end) {
      return { index: i, count: blocks.length, block: blocks[i], remainingS: end - tS, next: blocks[i + 1] ?? null }
    }
    start = end
  }
  return null
}
