// Level number on the violet hexagon (docs/design-gamification.md 2.5).
import { useId } from 'react'
import { HEX_OUTER } from './badgePaths'

export function LevelEmblem({ level, size = 44, glow = false }: { level: number; size?: number; glow?: boolean }) {
  const id = useId().replace(/:/g, '')
  const digits = String(level).length
  const fs = digits >= 3 ? 24 : digits === 2 ? 27 : 30
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={`Level ${level}`} style={{ display: 'block', flex: 'none', overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7C6BFF" /><stop offset="1" stopColor="#5040D0" /></linearGradient>
      </defs>
      {glow && <path d={HEX_OUTER} fill="none" stroke="rgba(169,156,255,.35)" strokeWidth={8} />}
      <path d={HEX_OUTER} fill={`url(#${id})`} stroke="var(--accent-hi)" strokeWidth={1.5} />
      <text x={32} y={32 + 0.36 * fs} textAnchor="middle" fill="#fff" fontSize={fs} fontWeight={700}
        style={{ fontStretch: '75%', fontVariantNumeric: 'tabular-nums' }}>{level}</text>
    </svg>
  )
}
