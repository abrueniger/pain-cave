import type { Shift, TrainerData } from './types'

/** FTMS Indoor Bike Data (0x2AD2), field order per FTMS spec 4.9. Missing fields are 0. */
export function parseBikeData(v: DataView): TrainerData {
  const flags = v.getUint16(0, true)
  const out: TrainerData = { power: 0, cadence: 0, speedKmh: 0 }
  let i = 2
  if (!(flags & 0x0001)) {
    out.speedKmh = v.getUint16(i, true) / 100
    i += 2
  }
  if (flags & 0x0002) i += 2 // avg speed
  if (flags & 0x0004) {
    out.cadence = v.getUint16(i, true) / 2
    i += 2
  }
  if (flags & 0x0008) i += 2 // avg cadence
  if (flags & 0x0010) i += 3 // total distance
  if (flags & 0x0020) i += 2 // resistance level
  if (flags & 0x0040) out.power = v.getInt16(i, true)
  return out
}

/** Heart Rate Measurement (0x2A37). */
export function parseHr(v: DataView): number {
  return v.getUint8(0) & 0x01 ? v.getUint16(1, true) : v.getUint8(1)
}

function varint(b: Uint8Array, i: number): [number, number] {
  let v = 0
  for (let s = 1; i < b.length; s *= 128) {
    const x = b[i++]
    v += (x & 0x7f) * s
    if (x < 0x80) break
  }
  return [v, i]
}

function fields(b: Uint8Array, cb: (field: number, value: number | Uint8Array) => void) {
  let i = 0
  while (i < b.length) {
    const [key, j] = varint(b, i)
    const wt = key & 7
    if (wt === 0) {
      const [v, k] = varint(b, j)
      cb(key >> 3, v)
      i = k
    } else if (wt === 2) {
      const [n, k] = varint(b, j)
      cb(key >> 3, b.subarray(k, k + n))
      i = k + n
    } else return
  }
}

export interface RideState {
  buttons: number | null // pressed bits (wire format is active-low, inverted here)
  analog: Record<number, number> // channel -> -100..100
}

/**
 * Zwift Ride 0x23 event: protobuf, field 1 = button bitmap, field 3 (repeated) = analog
 * {1: channel, 2: zigzag}. Older firmware nests the analog entries as field 2 {1: entry}.
 * Returns null for other message types.
 */
export function parseRide(v: DataView): RideState | null {
  const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
  if (b[0] !== 0x23) return null
  const out: RideState = { buttons: null, analog: {} }
  const analog = (m: Uint8Array) => {
    let ch = 0
    let zz = 0
    fields(m, (f, x) => {
      if (f === 1 && typeof x === 'number') ch = x
      if (f === 2 && typeof x === 'number') zz = x
    })
    out.analog[ch] = (zz >>> 1) ^ -(zz & 1)
  }
  fields(b.subarray(1), (f, x) => {
    if (f === 1 && typeof x === 'number') out.buttons = ~x >>> 0
    else if (f === 3 && typeof x !== 'number') analog(x)
    else if (f === 2 && typeof x !== 'number') fields(x, (g, y) => g === 1 && typeof y !== 'number' && analog(y))
  })
  return out
}

const SHIFTS: [number, Shift][] = [
  [0x0100, 'leftUp'],
  [0x0200, 'leftDown'],
  [0x1000, 'rightUp'],
  [0x2000, 'rightDown']
]

/** Shift buttons pressed in `now` that were not held in `prev`. */
export function pressedShifts(prev: number, now: number): Shift[] {
  return SHIFTS.filter(([bit]) => now & bit && !(prev & bit)).map(([, s]) => s)
}
