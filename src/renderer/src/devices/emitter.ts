import type { DeviceEvents, DeviceKind, DeviceStatus } from './types'

type Cb = (...a: unknown[]) => void

/** Event subscriptions + per-device status, shared by the Bluetooth and fake managers. */
export function createEmitter() {
  const subs = new Map<keyof DeviceEvents, Set<Cb>>()
  const statuses: Record<DeviceKind, { status: DeviceStatus; name: string | null }> = {
    trainer: { status: 'none', name: null },
    controller: { status: 'none', name: null },
    hr: { status: 'none', name: null }
  }
  const emit = <E extends keyof DeviceEvents>(e: E, ...args: Parameters<DeviceEvents[E]>) => {
    for (const cb of subs.get(e) ?? []) cb(...args)
  }
  return {
    emit,
    status: (kind: DeviceKind) => ({ ...statuses[kind] }),
    setStatus(kind: DeviceKind, status: DeviceStatus, name: string | null) {
      const s = statuses[kind]
      if (s.status === status && s.name === name) return
      statuses[kind] = { status, name }
      emit('status', kind, status, name)
    },
    on<E extends keyof DeviceEvents>(e: E, cb: DeviceEvents[E]) {
      if (!subs.has(e)) subs.set(e, new Set())
      subs.get(e)!.add(cb as Cb)
      return () => {
        subs.get(e)!.delete(cb as Cb)
      }
    }
  }
}
