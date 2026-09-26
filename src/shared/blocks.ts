import { LIMITS, type Block, type PowerUnit } from './types'

/** Duration of one block in seconds (intervals: repeat × (on + off)). */
export function blockDurationS(b: Block): number {
  return b.type === 'intervals' ? b.repeat * (b.onS + b.offS) : b.durationS
}

/**
 * What a ride (and every chart/thumbnail) actually uses: absolute watts, intervals expanded into
 * labelled steady blocks ("Interval 3/5 · on"), % FTP converted with `ftp`, rounded and clamped to LIMITS.
 */
export function resolveBlocks(blocks: Block[], unit: PowerUnit, ftp: number): Block[] {
  const w = (v: number) => Math.min(LIMITS.maxWatts, Math.max(LIMITS.minWatts, Math.round(unit === 'ftp' ? (v * ftp) / 100 : v)))
  return blocks.flatMap((b): Block[] => {
    if (b.type === 'steady') return [{ ...b, watts: w(b.watts) }]
    if (b.type === 'ramp') return [{ ...b, startWatts: w(b.startWatts), endWatts: w(b.endWatts) }]
    return Array.from({ length: b.repeat }, (_, i): Block[] => [
      { type: 'steady', durationS: b.onS, watts: w(b.onWatts), label: `Interval ${i + 1}/${b.repeat} · on` },
      { type: 'steady', durationS: b.offS, watts: w(b.offWatts), label: `Interval ${i + 1}/${b.repeat} · off` }
    ]).flat()
  })
}
