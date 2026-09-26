import { describe, expect, it } from 'vitest'
import { parseBikeData, parseHr, parseRide, pressedShifts } from './parsers'

const hex = (s: string) => new DataView(new Uint8Array(s.match(/../g)!.map(x => parseInt(x, 16))).buffer)

describe('parsers', () => {
  it('parses FTMS Indoor Bike Data (KICKR flags 0x0044)', () => {
    // speed 3050 (30.5 km/h), cadence 180 (90 rpm), power 172
    expect(parseBikeData(hex('4400ea0bb400ac00'))).toEqual({ speedKmh: 30.5, cadence: 90, power: 172 })
  })

  it('parses HR in uint8 and uint16 format', () => {
    expect(parseHr(hex('008e'))).toBe(142)
    expect(parseHr(hex('018e00'))).toBe(142)
  })

  it('parses Zwift Ride 0x23 frames', () => {
    expect(parseRide(hex('2308ffdfffff0f1a04080010001a0408011017'))).toEqual({ buttons: 0x1000, analog: { 0: 0, 1: -12 } })
    expect(parseRide(hex('2308ffffffff0f'))).toEqual({ buttons: 0, analog: {} })
    // older firmware: analog entries nested in field 2
    expect(parseRide(hex('2308fffdffff0f120c0a04080010000a0408011017'))).toEqual({
      buttons: 0x0100,
      analog: { 0: 0, 1: -12 }
    })
    expect(parseRide(hex('1508'))).toBeNull()
  })

  it('reports newly pressed shift buttons only', () => {
    expect(pressedShifts(0, 0x1000)).toEqual(['rightUp'])
    expect(pressedShifts(0x1000, 0x1000)).toEqual([])
    expect(pressedShifts(0x1000, 0x1100)).toEqual(['leftUp'])
    expect(pressedShifts(0, 0x2201)).toEqual(['leftDown', 'rightDown'])
  })
})
