import { describe, expect, it } from 'vitest'
import type { Block } from '../../../shared/types'
import { addRamp, addSteady, checkDuration, checkWatts, dragShift, dropIndex, duplicateAt, gapTop, moveTo, parseWatts, removeAt, setType, workoutMeta } from './builder'

const s = (watts: number): Block => ({ type: 'steady', durationS: 60, watts })

describe('builder', () => {
  it('adds default blocks', () => {
    expect(addSteady([])).toEqual([{ type: 'steady', durationS: 300, watts: 150 }])
    expect(addRamp([])).toEqual([{ type: 'ramp', durationS: 300, startWatts: 100, endWatts: 150 }])
    expect(addRamp([s(200)])[1]).toEqual({ type: 'ramp', durationS: 300, startWatts: 200, endWatts: 250 })
    expect(addRamp([{ type: 'ramp', durationS: 60, startWatts: 100, endWatts: 980 }])[1]).toMatchObject({ startWatts: 980, endWatts: 1000 })
  })

  it('moves, duplicates and removes', () => {
    const bs = [s(1), s(2), s(3)]
    const w = (xs: Block[]) => xs.map((b) => (b as { watts: number }).watts)
    expect(w(moveTo(bs, 0, 3))).toEqual([2, 3, 1])
    expect(w(moveTo(bs, 2, 0))).toEqual([3, 1, 2])
    expect(w(moveTo(bs, 0, 2))).toEqual([2, 1, 3])
    expect(moveTo(bs, 1, 1)).toBe(bs)
    expect(moveTo(bs, 1, 2)).toBe(bs)
    expect(w(moveTo(bs, 0, 3, true))).toEqual([1, 2, 3, 1])
    expect(duplicateAt(bs, 1).map((b) => (b as { watts: number }).watts)).toEqual([1, 2, 2, 3])
    expect(removeAt(bs, 1).map((b) => (b as { watts: number }).watts)).toEqual([1, 3])
  })

  it('switches type', () => {
    expect(setType(s(200), 'ramp')).toEqual({ type: 'ramp', durationS: 60, startWatts: 200, endWatts: 250 })
    expect(setType({ type: 'ramp', durationS: 60, startWatts: 120, endWatts: 180 }, 'steady')).toEqual(s(120))
  })

  it('parses watts', () => {
    expect(parseWatts('150')).toBe(150)
    expect(parseWatts('49')).toBeNull()
    expect(parseWatts('1001')).toBeNull()
    expect(parseWatts('15.5')).toBeNull()
    expect(parseWatts('')).toBeNull()
  })

  it('checks durations and watts', () => {
    expect(checkDuration('5:00')).toBe(300)
    expect(checkDuration('90')).toBe(90)
    expect(checkDuration('1:02:05')).toBe(3725)
    expect(checkDuration('12:75')).toBe('Seconds must be 0–59 — e.g. 12:45')
    expect(checkDuration('1:75:00')).toBe('Minutes must be 0–59')
    expect(checkDuration('0:00')).toBeTypeOf('string')
    expect(checkDuration('5:')).toBeTypeOf('string')
    expect(checkWatts('170')).toBe(170)
    expect(checkWatts('20')).toBe('Watts must be 50–1000')
  })

  it('describes a workout', () => {
    expect(workoutMeta([s(100), { type: 'ramp', durationS: 90, startWatts: 150, endWatts: 300 }])).toBe('2:30 · 2 blocks · 100–300 W')
    expect(workoutMeta([s(120)])).toBe('1:00 · 1 block · 120 W')
  })

  it('lays out a drag', () => {
    // rows 60 high, 10 apart -> pitch 70; centres at 30, 100, 170
    const slots = [0, 70, 140].map((top) => ({ top, height: 60 }))
    expect(dropIndex(slots, 100)).toBe(1) // not moved
    expect(dropIndex(slots, 20)).toBe(0)
    expect(dropIndex(slots, 200)).toBe(3)
    // move row 2 to the top: rows 0 and 1 open down, gap at the old row 0
    expect([0, 1].map((i) => dragShift(i, 2, 0, false))).toEqual([1, 1])
    expect(gapTop(slots, 2, 0, false, 70)).toBe(0)
    // move row 0 to the end: rows 1 and 2 collapse up, gap below them
    expect([1, 2].map((i) => dragShift(i, 0, 3, false))).toEqual([-1, -1])
    expect(gapTop(slots, 0, 3, false, 70)).toBe(140)
    // dropping in place: nothing moves, the gap is the source slot
    expect([0, 2].map((i) => dragShift(i, 1, 2, false))).toEqual([0, 0])
    expect(gapTop(slots, 1, 2, false, 70)).toBe(70)
    // copy row 0 behind row 1: the source stays, row 2 opens down
    expect([1, 2].map((i) => dragShift(i, 0, 2, true))).toEqual([0, 1])
    expect(gapTop(slots, 0, 2, true, 70)).toBe(140)
  })
})
