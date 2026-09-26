// Pure block-list edits for the workout builder. Every function returns a new array.
import { FREE_RIDE_START_WATTS, LIMITS, type Block } from '../../../shared/types'
import { workoutDurationS } from '../engine/plan'
import { formatDuration, parseDuration } from '../format'

export const clampWatts = (w: number): number => Math.min(LIMITS.maxWatts, Math.max(LIMITS.minWatts, w))

/** Integer watts within LIMITS, else null. */
export function parseWatts(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const w = Number(text)
  return w >= LIMITS.minWatts && w <= LIMITS.maxWatts ? w : null
}

/** Watts text -> watts, or an error message. */
export const checkWatts = (text: string): number | string => parseWatts(text) ?? `Watts must be ${LIMITS.minWatts}–${LIMITS.maxWatts}`

/** "m:ss", "h:mm:ss" or plain seconds -> seconds, or an error message. */
export function checkDuration(text: string): number | string {
  const s = parseDuration(text)
  if (s === null) return 'Use m:ss — e.g. 12:45'
  const parts = text.trim().split(':').map(Number)
  if (parts.length > 1 && parts[parts.length - 1] > 59) return 'Seconds must be 0–59 — e.g. 12:45'
  if (parts.length > 2 && parts[1] > 59) return 'Minutes must be 0–59'
  return s > 0 ? s : 'Duration must be at least 0:01'
}

/** "25:30 · 5 blocks · 100–300 W" */
export function workoutMeta(blocks: Block[]): string {
  const watts = blocks.flatMap((b) => (b.type === 'steady' ? [b.watts] : [b.startWatts, b.endWatts]))
  const lo = Math.min(...watts), hi = Math.max(...watts)
  const range = !watts.length ? '' : lo === hi ? ` · ${lo} W` : ` · ${lo}–${hi} W`
  return `${formatDuration(workoutDurationS(blocks))} · ${blocks.length} block${blocks.length === 1 ? '' : 's'}${range}`
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

/** A row's layout box inside the block list (px, measured when the drag starts). */
export type Slot = { top: number; height: number }

/** Gap (0..n) a block dragged so its centre is at y lands in. The source counts at its original place. */
export const dropIndex = (slots: Slot[], y: number): number => slots.filter((s) => s.top + s.height / 2 < y).length

/** Rows shift by -1/0/+1 pitches while block `from` hovers over gap `to`: the source slot collapses (move), the target opens. */
export const dragShift = (i: number, from: number, to: number, copy: boolean): number => (!copy && i > from ? -1 : 0) + (i >= to ? 1 : 0)

/** Top of the opened drop gap. pitch = dragged row height + row gap. */
export function gapTop(slots: Slot[], from: number, to: number, copy: boolean, pitch: number): number {
  let prev = to - 1
  if (!copy && prev === from) prev--
  if (prev < 0) return slots[0].top
  return slots[prev].top + slots[prev].height + (pitch - slots[from].height) + dragShift(prev, from, to, copy) * pitch
}
