// Pure block-list edits for the workout builder. Every function returns a new array.
import { FREE_RIDE_START_WATTS, LIMITS, type Block } from '../../../shared/types'

export const clampWatts = (w: number): number => Math.min(LIMITS.maxWatts, Math.max(LIMITS.minWatts, w))

/** Integer watts within LIMITS, else null. */
export function parseWatts(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const w = Number(text)
  return w >= LIMITS.minWatts && w <= LIMITS.maxWatts ? w : null
}

export const endWatts = (b: Block): number => (b.type === 'steady' ? b.watts : b.endWatts)

export const addSteady = (blocks: Block[]): Block[] => [...blocks, { type: 'steady', durationS: 300, watts: 150 }]

export function addRamp(blocks: Block[]): Block[] {
  const start = blocks.length ? endWatts(blocks[blocks.length - 1]) : FREE_RIDE_START_WATTS
  return [...blocks, { type: 'ramp', durationS: 300, startWatts: start, endWatts: clampWatts(start + 50) }]
}

export function setType(b: Block, type: Block['type']): Block {
  if (b.type === type) return b
  return b.type === 'steady'
    ? { type: 'ramp', durationS: b.durationS, startWatts: b.watts, endWatts: clampWatts(b.watts + 50) }
    : { type: 'steady', durationS: b.durationS, watts: b.startWatts }
}

export const replaceAt = (blocks: Block[], i: number, b: Block): Block[] => blocks.map((x, j) => (j === i ? b : x))

export const removeAt = (blocks: Block[], i: number): Block[] => blocks.filter((_, j) => j !== i)

export const duplicateAt = (blocks: Block[], i: number): Block[] => [...blocks.slice(0, i + 1), { ...blocks[i] }, ...blocks.slice(i + 1)]

/**
 * Drag & drop: put block `from` at gap `to` (0 = before the first block, length = after the last).
 * copy = insert a duplicate and keep the original.
 */
export function moveTo(blocks: Block[], from: number, to: number, copy = false): Block[] {
  const out = [...blocks]
  if (copy) {
    out.splice(to, 0, { ...blocks[from] })
    return out
  }
  if (to === from || to === from + 1) return blocks
  const [b] = out.splice(from, 1)
  out.splice(to > from ? to - 1 : to, 0, b)
  return out
}
