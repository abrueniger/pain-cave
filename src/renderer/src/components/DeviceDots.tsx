import { useEffect, useState } from 'react'
import { devices, type DeviceKind } from '../devices'

const KINDS: { kind: DeviceKind; label: string }[] = [
  { kind: 'trainer', label: 'Trainer' },
  { kind: 'controller', label: 'Ride' },
  { kind: 'hr', label: 'HR' }
]

/** One status dot per device: green connected, yellow searching, grey none. */
export function DeviceDots() {
  const [, rerender] = useState(0)
  useEffect(() => devices.on('status', () => rerender((n) => n + 1)), [])
  return (
    <span className="device-dots">
      {KINDS.map(({ kind, label }) => {
        const s = devices.status(kind)
        return (
          <span key={kind} className={`dot dot-${s.status}`} title={s.name ?? 'not connected'}>
            {label}
          </span>
        )
      })}
    </span>
  )
}
