import { describe, expect, it } from 'vitest'
import type { Block } from '../../../shared/types'
import { addRamp, addSteady, duplicateAt, move, parseWatts, removeAt, setType } from './builder'

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
    expect(move(bs, 0, 1).map((b) => (b as { watts: number }).watts)).toEqual([2, 1, 3])
    expect(move(bs, 0, -1)).toBe(bs)
    expect(move(bs, 2, 1)).toBe(bs)
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
})
