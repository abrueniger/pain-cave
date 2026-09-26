import { api } from '../api'
import type { StoredDevice } from '../../../shared/types'
import { createEmitter } from './emitter'
import { parseBikeData, parseHr, parseRide, pressedShifts } from './parsers'
import type { DeviceKind, DeviceManager } from './types'

const KINDS: DeviceKind[] = ['trainer', 'controller', 'hr']
const ride = (n: number) => `0000000${n}-19ca-4651-86e5-fa29dcdd09d1`
const OPTIONS: Record<DeviceKind, RequestDeviceOptions> = {
  trainer: { filters: [{ services: [0x1826] }] },
  controller: {
    // left controller only, it relays the right one's buttons
    filters: [
      { manufacturerData: [{ companyIdentifier: 0x094a, dataPrefix: new Uint8Array([0x08]) }] },
      { name: 'Zwift Ride' }
    ],
    optionalServices: [0xfc82, ride(1), 'battery_service']
  },
  hr: { filters: [{ services: ['heart_rate'] }] }
}
const SEARCH_TIMEOUT_MS = 15000
const RETRY_MS = 20000
const FIRMWARE_HINT =
  'Zwift Ride service not found. Controller firmware newer than 1.2.0 hides it – do not update the firmware.'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const value = (e: Event) => (e.target as BluetoothRemoteGATTCharacteristic).value!

/** requestDevice() run by main with a user gesture (no click needed). */
async function viaGesture(opts: RequestDeviceOptions) {
  let device: BluetoothDevice | undefined
  let error: unknown = new Error('requestDevice did not run')
  const w = window as unknown as { __paincaveGesture?: () => Promise<void> }
  w.__paincaveGesture = () =>
    navigator.bluetooth.requestDevice(opts).then(
      d => {
        device = d
      },
      e => {
        error = e
      }
    )
  await api.bluetooth.runWithGesture()
  if (!device) throw error
  return device
}

const isCancel = (e: unknown) => (e as Error)?.name === 'NotFoundError'

export function createBluetoothManager(): DeviceManager {
  const ev = createEmitter()
  const stored: Partial<Record<DeviceKind, StoredDevice>> = {}
  const devs: Partial<Record<DeviceKind, BluetoothDevice>> = {}
  const busy = new Set<DeviceKind>()
  let chosen: string | null = null
  let cancelSearch: (() => void) | null = null
  let searching = false
  let retryTimer: ReturnType<typeof setInterval> | undefined

  // only one requestDevice() may be pending
  let lock: Promise<unknown> = Promise.resolve()
  const exclusive = <T>(fn: () => Promise<T>) => {
    const p = lock.then(fn)
    lock = p.catch(() => {})
    return p
  }

  // --- trainer (FTMS)
  let cp: BluetoothRemoteGATTCharacteristic | null = null
  let cpChain = Promise.resolve()
  let ack: (() => void) | null = null
  let ackOp = -1
  let target: number | null = null
  let released = false
  let started = false

  // control point writes one at a time, each waits for its indication
  function control(bytes: number[]) {
    cpChain = cpChain
      .then(async () => {
        if (!cp) return
        const acked = new Promise<void>(res => {
          ack = res
          setTimeout(res, 3000)
        })
        ackOp = bytes[0]
        await cp.writeValueWithResponse(new Uint8Array(bytes))
        await acked
      })
      .catch(e => console.warn('FTMS control point', bytes, e))
    return cpChain
  }

  async function setTargetPower(watts: number) {
    target = watts
    released = false
    if (!cp) return // sent on (re)connect
    if (!started) {
      started = true
      await control([0x07])
    }
    const w = Math.round(watts)
    await control([0x05, w & 0xff, (w >> 8) & 0xff])
  }

  async function setupTrainer(server: BluetoothRemoteGATTServer) {
    const svc = await server.getPrimaryService(0x1826)
    const c = await svc.getCharacteristic(0x2ad9)
    const data = await svc.getCharacteristic(0x2ad2)
    c.oncharacteristicvaluechanged = e => {
      const v = value(e)
      if (v.getUint8(0) !== 0x80 || v.getUint8(1) !== ackOp) return
      if (v.getUint8(2) !== 1) console.warn('FTMS opcode', ackOp, 'result', v.getUint8(2))
      ack?.()
    }
    data.oncharacteristicvaluechanged = e => ev.emit('trainer', parseBikeData(value(e)))
    await c.startNotifications()
    await data.startNotifications()
    cp = c
    started = false
    await control([0x00])
    if (target !== null && !released) await setTargetPower(target)
  }

  // --- controller (Zwift Ride)
  let held = 0

  async function setupController(server: BluetoothRemoteGATTServer) {
    const svc = await server
      .getPrimaryService(0xfc82)
      .catch(() => server.getPrimaryService(ride(1)))
      .catch(() => {
        throw new Error(FIRMWARE_HINT)
      })
    const events = await svc.getCharacteristic(ride(2))
    const cmd = await svc.getCharacteristic(ride(3))
    const sync = await svc.getCharacteristic(ride(4))
    held = 0
    events.oncharacteristicvaluechanged = e => {
      const s = parseRide(value(e))
      if (s?.buttons == null) return
      for (const shift of pressedShifts(held, s.buttons)) ev.emit('shift', shift)
      held = s.buttons
    }
    await events.startNotifications()
    await sync.startNotifications()
    await cmd.writeValueWithoutResponse(new TextEncoder().encode('RideOn'))
  }

  // --- heart rate
  async function setupHr(server: BluetoothRemoteGATTServer) {
    const c = await (await server.getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement')
    c.oncharacteristicvaluechanged = e => ev.emit('hr', parseHr(value(e)))
    await c.startNotifications()
  }

  const setup = { trainer: setupTrainer, controller: setupController, hr: setupHr }

  // --- connection handling
  const name = (kind: DeviceKind) => devs[kind]?.name ?? stored[kind]?.name ?? null

  /** Connects a kept device, retrying with backoff (stale connections on Windows). */
  async function use(kind: DeviceKind, device: BluetoothDevice, attempts: number) {
    devs[kind] = device
    device.ongattserverdisconnected = () => {
      if (devs[kind] !== device || busy.has(kind)) return
      if (kind === 'trainer') cp = null
      if (kind === 'controller') held = 0
      use(kind, device, 6).catch(e => console.warn('reconnect', kind, e))
    }
    busy.add(kind)
    ev.setStatus(kind, 'searching', name(kind))
    try {
      for (let n = 1; devs[kind] === device; n++) {
        try {
          await setup[kind](await device.gatt!.connect())
          ev.setStatus(kind, 'connected', name(kind))
          return
        } catch (e) {
          device.gatt!.disconnect()
          if (n >= attempts) throw e
          await sleep(Math.min(1000 * 2 ** n, 16000))
        }
      }
    } catch (e) {
      if (devs[kind] === device) {
        devs[kind] = undefined // the background search takes over
        ev.setStatus(kind, 'none', name(kind))
      }
      throw e
    } finally {
      busy.delete(kind)
    }
  }

  /** Looks for a stored device via the chooser and auto-selects it. */
  async function find(kind: DeviceKind) {
    const want = stored[kind]
    if (!want || devs[kind]) return
    ev.setStatus(kind, 'searching', want.name)
    let done = false
    const pick = (id: string) => {
      if (done) return
      done = true
      api.bluetooth.select(id)
    }
    const off = api.bluetooth.onCandidates(list => {
      if (list.some(c => c.id === want.id)) pick(want.id)
    })
    const timer = setTimeout(() => pick(''), SEARCH_TIMEOUT_MS)
    cancelSearch = () => pick('')
    try {
      const device = await viaGesture(OPTIONS[kind])
      if (stored[kind] === want) await use(kind, device, 3)
    } catch (e) {
      if (!isCancel(e)) console.warn('connect', kind, e)
      if (stored[kind] === want && !devs[kind]) ev.setStatus(kind, 'none', want.name)
    } finally {
      off()
      clearTimeout(timer)
      cancelSearch = null
    }
  }

  async function searchStored() {
    if (searching) return
    searching = true
    try {
      for (const kind of KINDS) await exclusive(() => find(kind))
    } finally {
      searching = false
    }
  }

  async function readStored(kind: DeviceKind): Promise<StoredDevice | undefined> {
    try {
      return JSON.parse((await api.settings.get(`device.${kind}`)) || 'null') ?? undefined
    } catch {
      return undefined
    }
  }

  return {
    status: ev.status,
    on: ev.on,

    async pair(kind) {
      cancelSearch?.()
      chosen = null
      const opts = OPTIONS[kind]
      let device: BluetoothDevice
      try {
        device = await exclusive(() =>
          navigator.userActivation?.isActive ? navigator.bluetooth.requestDevice(opts) : viaGesture(opts)
        )
      } catch (e) {
        if (isCancel(e)) return
        throw e
      }
      const old = devs[kind]
      if (old && old !== device) {
        devs[kind] = undefined
        old.gatt?.disconnect()
      }
      stored[kind] = { id: chosen ?? device.id, name: device.name ?? kind }
      await api.settings.set(`device.${kind}`, JSON.stringify(stored[kind]))
      if (old === device && device.gatt?.connected) ev.setStatus(kind, 'connected', name(kind))
      else await use(kind, device, 3)
    },

    choose(candidateId) {
      chosen = candidateId || null
      api.bluetooth.select(candidateId)
    },

    async connectStored() {
      for (const kind of KINDS) {
        stored[kind] = await readStored(kind)
        if (!devs[kind]) ev.setStatus(kind, stored[kind] ? 'searching' : 'none', stored[kind]?.name ?? null)
      }
      void searchStored()
      retryTimer ??= setInterval(searchStored, RETRY_MS)
    },

    async forget(kind) {
      const d = devs[kind]
      stored[kind] = undefined
      devs[kind] = undefined
      if (kind === 'trainer') cp = null
      d?.gatt?.disconnect()
      ev.setStatus(kind, 'none', null)
      await api.settings.set(`device.${kind}`, '')
    },

    setTargetPower,

    async release() {
      released = true
      started = false
      await control([0x08, 0x02])
    }
  }
}
