// Pure block-list edits for the workout builder. Every function returns a new array.
import { blockDurationS } from '../../../shared/blocks'
import { FREE_RIDE_START_WATTS, LIMITS, type Block, type PowerUnit } from '../../../shared/types'
import { workoutDurationS } from '../engine/plan'
import { formatDuration, parseDuration } from '../format'

/** Valid power range per unit (% = % of FTP). */
export const POWER_RANGE: Record<PowerUnit, [number, number]> = { watts: [LIMITS.minWatts, LIMITS.maxWatts], ftp: [30, 300] }
export const unitLabel = (unit: PowerUnit): string => (unit === 'ftp' ? '%' : 'W')

export const clampPower = (v: number, unit: PowerUnit): number => Math.min(POWER_RANGE[unit][1], Math.max(POWER_RANGE[unit][0], v))

/** Integer power within the unit's range ("88", "88 %" for % FTP), else null. */
export function parsePower(text: string, unit: PowerUnit): number | null {
  const t = unit === 'ftp' ? text.trim().replace(/\s*%$/, '') : text.trim()
  if (!/^\d+$/.test(t)) return null
  const v = Number(t)
  return v === clampPower(v, unit) ? v : null
}

/** Power text -> value, or an error message. */
export function checkPower(text: string, unit: PowerUnit): number | string {
  const [lo, hi] = POWER_RANGE[unit]
  return parsePower(text, unit) ?? (unit === 'ftp' ? `% FTP must be ${lo}–${hi}` : `Watts must be ${lo}–${hi}`)
}

export function checkRepeat(text: string): number | string {
  const n = Number(text.trim())
  return /^\d+$/.test(text.trim()) && n >= 1 && n <= 99 ? n : 'Repeat must be 1–99'
}

/** "m:ss", "h:mm:ss" or plain seconds -> seconds, or an error message. */
export function checkDuration(text: string): number | string {
  const s = parseDuration(text)
  if (s === null) return 'Use m:ss — e.g. 12:45'
  const parts = text.trim().split(':').map(Number)
  if (parts.length > 1 && parts[parts.length - 1] > 59) return 'Seconds must be 0–59 — e.g. 12:45'
  if (parts.length > 2 && parts[1] > 59) return 'Minutes must be 0–59'
  return s > 0 ? s : 'Duration must be at least 0:01'
}

/** Every power value of a block. */
const powers = (b: Block): number[] =>
  b.type === 'steady' ? [b.watts] : b.type === 'ramp' ? [b.startWatts, b.endWatts] : [b.onWatts, b.offWatts]

function mapPower(b: Block, f: (v: number) => number): Block {
  if (b.type === 'steady') return { ...b, watts: f(b.watts) }
  if (b.type === 'ramp') return { ...b, startWatts: f(b.startWatts), endWatts: f(b.endWatts) }
  return { ...b, onWatts: f(b.onWatts), offWatts: f(b.offWatts) }
}

/** One power value from `from` to `to` unit, rounded and clamped. */
export const convertPower = (v: number, from: PowerUnit, to: PowerUnit, ftp: number): number =>
  from === to ? v : clampPower(Math.round(to === 'ftp' ? (v * 100) / ftp : (v * ftp) / 100), to)

/** Switch a workout's unit keeping the profile (W <-> % of ftp). */
export const convertBlocks = (blocks: Block[], from: PowerUnit, to: PowerUnit, ftp: number): Block[] =>
  from === to ? blocks : blocks.map((b) => mapPower(b, (v) => convertPower(v, from, to, ftp)))

/** "25:30 · 5 blocks · 100–300 W" / "45:00 · 7 blocks · 55–120 % FTP" */
export function workoutMeta(blocks: Block[], unit: PowerUnit): string {
  const ps = blocks.flatMap(powers)
  const lo = Math.min(...ps), hi = Math.max(...ps)
  const u = unit === 'ftp' ? ' % FTP' : ' W'
  const range = !ps.length ? '' : lo === hi ? ` · ${lo}${u}` : ` · ${lo}–${hi}${u}`
  return `${formatDuration(workoutDurationS(blocks))} · ${blocks.length} block${blocks.length === 1 ? '' : 's'}${range}`
}

export const endPower = (b: Block): number => (b.type === 'steady' ? b.watts : b.type === 'ramp' ? b.endWatts : b.offWatts)

const rampStep = (unit: PowerUnit) => (unit === 'ftp' ? 25 : 50)

export const newSteady = (unit: PowerUnit, ftp: number): Extract<Block, { type: 'steady' }> => ({ type: 'steady', durationS: 300, watts: convertPower(150, 'watts', unit, ftp) })

export const newIntervals = (unit: PowerUnit, ftp: number): Extract<Block, { type: 'intervals' }> => ({
  type: 'intervals', repeat: 5, onS: 30, onWatts: convertPower(120, 'ftp', unit, ftp), offS: 30, offWatts: convertPower(50, 'ftp', unit, ftp)
})

export const addSteady = (blocks: Block[], unit: PowerUnit, ftp: number): Block[] => [...blocks, newSteady(unit, ftp)]

export const addIntervals = (blocks: Block[], unit: PowerUnit, ftp: number): Block[] => [...blocks, newIntervals(unit, ftp)]

export function addRamp(blocks: Block[], unit: PowerUnit, ftp: number): Block[] {
  const start = blocks.length ? endPower(blocks[blocks.length - 1]) : convertPower(FREE_RIDE_START_WATTS, 'watts', unit, ftp)
  return [...blocks, { type: 'ramp', durationS: 300, startWatts: start, endWatts: clampPower(start + rampStep(unit), unit) }]
}

/** Change a block's type, keeping its duration and (first) power where the new type has one. */
export function setType(b: Block, type: Block['type'], unit: PowerUnit, ftp: number): Block {
  if (b.type === type) return b
  if (type === 'intervals') return newIntervals(unit, ftp)
  const durationS = blockDurationS(b)
  const p = powers(b)[0]
  return type === 'steady'
    ? { type: 'steady', durationS, watts: p }
    : { type: 'ramp', durationS, startWatts: p, endWatts: clampPower(p + rampStep(unit), unit) }
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
