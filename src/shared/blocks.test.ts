import { describe, expect, it } from 'vitest'
import { blockDurationS, resolveBlocks } from './blocks'

describe('blocks', () => {
  it('resolves % FTP, expands intervals and clamps', () => {
    const r = resolveBlocks(
      [
        { type: 'ramp', durationS: 60, startWatts: 50, endWatts: 75 },
        { type: 'intervals', repeat: 2, onS: 30, onWatts: 120, offS: 30, offWatts: 10 }
      ],
      'ftp',
      200
    )
    expect(r).toEqual([
      { type: 'ramp', durationS: 60, startWatts: 100, endWatts: 150 },
      { type: 'steady', durationS: 30, watts: 240, label: 'Interval 1/2 · on' },
      { type: 'steady', durationS: 30, watts: 50, label: 'Interval 1/2 · off' }, // 20 W clamped to 50
      { type: 'steady', durationS: 30, watts: 240, label: 'Interval 2/2 · on' },
      { type: 'steady', durationS: 30, watts: 50, label: 'Interval 2/2 · off' }
    ])
    expect(resolveBlocks([{ type: 'steady', durationS: 10, watts: 180 }], 'watts', 999)).toEqual([{ type: 'steady', durationS: 10, watts: 180 }])
    expect(blockDurationS({ type: 'intervals', repeat: 5, onS: 30, onWatts: 1, offS: 15, offWatts: 1 })).toBe(225)
  })
})
