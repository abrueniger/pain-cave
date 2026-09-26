import { createEmitter } from './emitter'
import type { DeviceKind, DeviceManager } from './types'

const NAMES: Record<DeviceKind, string> = { trainer: 'Fake KICKR', controller: 'Fake Zwift Ride', hr: 'Fake HR' }

/** Simulated devices (PAINCAVE_FAKE=1). F8 toggles pedaling. */
export function createFakeManager(): DeviceManager {
  const ev = createEmitter()
  const noise = (n: number) => (Math.random() * 2 - 1) * n
  let target = 0
  let released = false
  let pedaling = true
  let power = 0
  let hr = 60

  const connect = (kinds: DeviceKind[]) =>
    new Promise<void>(res =>
      setTimeout(() => {
        for (const k of kinds) ev.setStatus(k, 'connected', NAMES[k])
        res()
      }, 500)
    )

  window.addEventListener('keydown', e => {
    if (e.key === 'F8') pedaling = !pedaling
  })

  setInterval(() => {
    // Like the real trainer: released (no ERG) still reports cadence and a little power while pedaling
    const goal = released ? 30 : target
    power = pedaling ? power + (goal - power) * 0.3 : 0
    if (ev.status('trainer').status === 'connected') {
      const p = pedaling ? Math.max(0, Math.round(power + noise(5))) : 0
      ev.emit('trainer', {
        power: p,
        cadence: pedaling ? Math.round(88 + noise(3)) : 0,
        speedKmh: pedaling ? Math.round(36 * Math.cbrt(p / 0.25)) / 10 : 0
      })
    }
    hr += (60 + 0.4 * power - hr) * 0.05
    if (ev.status('hr').status === 'connected') ev.emit('hr', Math.round(hr + noise(1)))
  }, 1000)

  return {
    status: ev.status,
    on: ev.on,
    pair: kind => connect([kind]),
    choose() {},
    connectStored: () => connect(['trainer', 'controller', 'hr']),
    async forget(kind) {
      ev.setStatus(kind, 'none', null)
    },
    async setTargetPower(watts) {
      target = watts
      released = false
    },
    async release() {
      released = true
    }
  }
}
