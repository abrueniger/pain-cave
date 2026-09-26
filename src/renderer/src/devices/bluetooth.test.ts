import { describe, expect, it, vi } from 'vitest'

const hex = (s: string) => new DataView(new Uint8Array(s.match(/../g)!.map(x => parseInt(x, 16))).buffer)

vi.mock('../api', () => ({
  api: {
    settings: { get: async () => null, set: async () => {} },
    bluetooth: {
      onCandidates: () => () => {},
      select: () => {},
      runWithGesture: async () => (window as unknown as { __paincaveGesture: () => Promise<void> }).__paincaveGesture()
    }
  }
}))

// Minimal fake GATT: every characteristic records writes; the FTMS control point acks each write.
function fakeDevice() {
  const writes: string[] = []
  const chars = new Map<string, { oncharacteristicvaluechanged?: (e: unknown) => void; startNotifications: unknown }>()
  const push = (uuid: string, v: DataView) => chars.get(String(uuid))!.oncharacteristicvaluechanged!({ target: { value: v } })
  const char = (uuid: string) => {
    const c = {
      startNotifications: async () => c,
      async writeValueWithResponse(b: Uint8Array) {
        writes.push(Buffer.from(b).toString('hex'))
        setTimeout(() => push(uuid, new DataView(new Uint8Array([0x80, b[0], 1]).buffer)))
      },
      async writeValueWithoutResponse(b: Uint8Array) {
        writes.push(Buffer.from(b).toString())
      }
    }
    chars.set(String(uuid), c)
    return c
  }
  const device = {
    name: 'KICKR CORE 1234',
    id: 'dev1',
    ongattserverdisconnected: null as null | (() => void),
    gatt: {
      connected: false,
      async connect() {
        device.gatt.connected = true
        return { getPrimaryService: async () => ({ getCharacteristic: async (u: string) => char(u) }) }
      },
      disconnect() {
        device.gatt.connected = false
      }
    }
  }
  return { device, writes, push }
}

describe('bluetooth manager', () => {
  it('drives the FTMS control point and reconnects', async () => {
    const { device, writes, push } = fakeDevice()
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { bluetooth: { requestDevice: async () => device } })
    const { createBluetoothManager } = await import('./bluetooth')
    const m = createBluetoothManager()
    const data: unknown[] = []
    m.on('trainer', d => data.push(d))

    await m.pair('trainer')
    expect(m.status('trainer')).toEqual({ status: 'connected', name: 'KICKR CORE 1234' })
    await m.setTargetPower(150)
    await m.release()
    await m.setTargetPower(260)
    expect(writes).toEqual(['00', '07', '059600', '0802', '07', '050401'])

    push(String(0x2ad2), hex('4400ea0bb400ac00'))
    expect(data).toEqual([{ speedKmh: 30.5, cadence: 90, power: 172 }])

    writes.length = 0
    device.gatt.connected = false
    device.ongattserverdisconnected!()
    await vi.waitFor(() => expect(writes).toEqual(['00', '07', '050401']))
    expect(m.status('trainer').status).toBe('connected')
  })

  it('handshakes with the Zwift Ride and emits shift edges', async () => {
    const { device, writes, push } = fakeDevice()
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { bluetooth: { requestDevice: async () => device } })
    const { createBluetoothManager } = await import('./bluetooth')
    const m = createBluetoothManager()
    const shifts: string[] = []
    m.on('shift', s => shifts.push(s))

    await m.pair('controller')
    expect(writes).toEqual(['RideOn'])
    const events = '00000002-19ca-4651-86e5-fa29dcdd09d1'
    push(events, hex('2308ffdfffff0f1a04080010001a0408011017')) // right up
    push(events, hex('2308ffdfffff0f')) // repeat
    push(events, hex('2308ffffffff0f')) // released
    push(events, hex('2308ffdfffff0f')) // right up again
    expect(shifts).toEqual(['rightUp', 'rightUp'])
  })
})
