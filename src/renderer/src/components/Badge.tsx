// Parametric badge artwork. Source of truth: docs/design-gamification.md 2.
import { useId, type ReactNode } from 'react'
import { HEX_FACE, HEX_OUTER, HEX_RING } from './badgePaths' // the three constants from 2.1

export type BadgeFamily = 'distance' | 'time' | 'rides' | 'pain' | 'record' | 'special'
type Paint = { rimTop: string; rimBottom: string; faceTop: string; faceBottom: string; ink: string; base: string; ring?: string }

export const TIER_PAINT: Paint[] = [
  { rimTop: '#7A4526', rimBottom: '#D99A6C', faceTop: '#E0A77B', faceBottom: '#9C5F37', ink: '#2B1608', base: '#C0804F' },
  { rimTop: '#6B7079', rimBottom: '#DADDE2', faceTop: '#EEF0F3', faceBottom: '#A3A8B0', ink: '#1D2026', base: '#B9BEC6' },
  { rimTop: '#8C6A1C', rimBottom: '#F0D78A', faceTop: '#F7E5A6', faceBottom: '#C39B3D', ink: '#3A2A05', base: '#DDBE68' },
  { rimTop: '#7F8C97', rimBottom: '#FFFFFF', faceTop: '#FFFFFF', faceBottom: '#C4CFD8', ink: '#16202B', base: '#E3E9EE', ring: '#8795A1' },
  { rimTop: '#3A2B9C', rimBottom: '#D3CBFF', faceTop: '#BCB0FF', faceBottom: '#5847D8', ink: '#FFFFFF', base: '#8E7DFF', ring: 'rgba(255,255,255,0.45)' }
]
const GRAPHITE: Paint = { rimTop: '#2D2D2A', rimBottom: '#5E5C56', faceTop: '#3A3935', faceBottom: '#232321', ink: '#A99CFF', base: '#8A877F' }

export const GLYPHS: Record<BadgeFamily, ReactNode> = {
  distance: <path d="M4.5 20.5L9.5 3.5M19.5 20.5L14.5 3.5M12 4.5v2M12 10.5v3M12 17.5v3" />,
  time: <><circle cx="12" cy="13.5" r="7" /><path d="M12 13.5V10M9.5 3.5h5M12 3.5v3M18 7.5l1.5-1.5" /></>,
  rides: <><circle cx="5.5" cy="15.5" r="3.75" /><circle cx="18.5" cy="15.5" r="3.75" /><path d="M5.5 15.5L9.5 8.5H16M9.5 8.5L12 15.5H5.5M12 15.5L16 8.5L18.5 15.5M7.5 6.5h3.5M16 8.5l-.6-2.2h2.2" /></>,
  pain: <path d="M12 3.5c1 3.5 5.5 5.5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-3 2-4.6 3-6.5.8 1.3 1.3 2.3 1.5 3.5.9-2.5 1-5 1-7.5z" />,
  record: <path d="M13.5 3L6 13.5h5.5L10.5 21 18 10.5h-5.5z" />,
  special: <path d="M12 4L14.29 9.44L20.18 9.94L15.71 13.81L17.05 19.56L12 16.5L6.95 19.56L8.29 13.81L3.82 9.94L9.71 9.44Z" />
}

export interface BadgeProps {
  family: BadgeFamily
  tier?: 1 | 2 | 3 | 4 | 5 // ignored for record / special
  locked?: boolean
  progress?: number // 0..1, locked only; 0 = no ring
  size?: number // px, square
  label: string // e.g. "Distance, Silver, 500 km, unlocked 26 Sep 2026" / "Distance, Gold, 505 of 1,000 km"
}

export function Badge({ family, tier = 1, locked = false, progress = 0, size = 48, label }: BadgeProps) {
  const id = useId().replace(/:/g, '')
  const tierless = family === 'record' || family === 'special'
  const p = tierless ? GRAPHITE : TIER_PAINT[tier - 1]
  const sw = size <= 32 ? 2.5 : size < 96 ? 2.2 : 2
  const glyph = (stroke: string) => (
    <g transform={`translate(18 ${tierless ? 18 : 16}) scale(1.1667)`} fill="none" stroke={stroke}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{GLYPHS[family]}</g>
  )
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={label} style={{ display: 'block', flex: 'none' }}>
      {locked ? (
        <>
          <path d={HEX_OUTER} fill="var(--input)" stroke="var(--border-strong)" strokeWidth={2} />
          {progress > 0 && (
            <path d={HEX_OUTER} pathLength={100} fill="none" stroke={p.base} strokeWidth={3} strokeLinecap="round"
              strokeDasharray={`${Math.max(1, Math.round(progress * 100))} 100`} />
          )}
          {glyph('var(--faint)')}
        </>
      ) : (
        <>
          <defs>
            <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={p.rimTop} /><stop offset="1" stopColor={p.rimBottom} /></linearGradient>
            <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={p.faceTop} /><stop offset="1" stopColor={p.faceBottom} /></linearGradient>
          </defs>
          <path d={HEX_OUTER} fill={`url(#${id}r)`} />
          <path d={HEX_FACE} fill={`url(#${id}f)`} stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
          {p.ring && <path d={HEX_RING} fill="none" stroke={p.ring} strokeWidth={1} />}
          {glyph(p.ink)}
          {!tierless && size >= 48 && Array.from({ length: tier }, (_, i) => (
            <circle key={i} cx={32 + (i - (tier - 1) / 2) * 4.5} cy={51} r={1.3} fill={p.ink} opacity={0.75} />
          ))}
        </>
      )}
    </svg>
  )
}
