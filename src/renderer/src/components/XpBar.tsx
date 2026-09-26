// XP progress within the current level (docs/design-gamification.md 3.1).
// gainedXp: second segment in --accent-hi right after the old fill; if it crosses the level start, the whole fill is gained.
export function XpBar({ levelStartXp, nextLevelXp, xp, gainedXp = 0, height }: {
  levelStartXp: number
  nextLevelXp: number
  xp: number
  gainedXp?: number
  height: number
}) {
  const span = nextLevelXp - levelStartXp
  const pct = (v: number) => (span > 0 ? Math.min(100, Math.max(0, ((v - levelStartXp) / span) * 100)) : 0)
  const now = pct(xp)
  const before = pct(xp - gainedXp)
  const seg = (left: number, width: number, background: string) => (
    <span style={{ position: 'absolute', top: 0, bottom: 0, left: `${left}%`, width: `${width}%`, background }} />
  )
  return (
    <div role="progressbar" aria-label="XP in this level" aria-valuemin={0} aria-valuemax={Math.max(0, span)}
      aria-valuenow={Math.min(Math.max(0, span), Math.max(0, xp - levelStartXp))}
      style={{ position: 'relative', height, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden', flex: 'none' }}>
      {seg(0, before, 'var(--accent)')}
      {now > before && seg(before, now - before, 'var(--accent-hi)')}
    </div>
  )
}
