/** 75 -> "1:15", 3725 -> "1:02:05" */
export function formatDuration(totalS: number): string {
  const s = Math.max(0, Math.round(totalS))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** "5:30" -> 330, "90" -> 90, "1:02:05" -> 3725; null if invalid. */
export function parseDuration(text: string): number | null {
  if (!/^\d+(:\d{1,2}){0,2}$/.test(text.trim())) return null
  return text.trim().split(':').reduce((acc, part) => acc * 60 + Number(part), 0)
}
