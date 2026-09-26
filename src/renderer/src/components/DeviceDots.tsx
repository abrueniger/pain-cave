import { useEffect, useState } from 'react'
import { devices, type DeviceKind } from '../devices'

const KINDS: { kind: DeviceKind; label: string }[] = [
  { kind: 'trainer', label: 'Trainer' },
  { kind: 'controller', label: 'Ride' },
  { kind: 'hr', label: 'HR' }
]
const STATE = { connected: 'Connected', searching: 'Searching', none: 'Not connected' } as const

/** Status dot + label per device. Re-renders on status changes. */
export function DeviceDots({ className = 'device-pill' }: { className?: string }) {
  const [, rerender] = useState(0)
  useEffect(() => devices.on('status', () => rerender((n) => n + 1)), [])
  return (
    <span className={className}>
      {KINDS.map(({ kind, label }) => {
        const s = devices.status(kind)
        return (
          <span key={kind} title={`${label}: ${STATE[s.status]}${s.name ? ` (${s.name})` : ''}`}>
            <span className={`dot ${s.status}`} />
            {label}
          </span>
        )
      })}
    </span>
  )
}
