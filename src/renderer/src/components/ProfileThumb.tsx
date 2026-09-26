// Mini workout profile (plan only, no axes) as SVG. Used in lists and on Home.
import type { Block, PowerUnit } from '../../../shared/types'
import { resolvePlan, workoutDurationS } from '../engine/plan'
import { useFtp } from '../ftp'

export function ProfileThumb({ blocks: raw, unit = 'watts', width = 240, height = 52 }: { blocks: Block[]; unit?: PowerUnit; width?: number; height?: number }) {
  const blocks = resolvePlan({ blocks: raw, unit }, useFtp())
  const total = workoutDurationS(blocks)
  const maxW = Math.max(1, ...blocks.map((b) => (b.type === 'steady' ? b.watts : Math.max(b.startWatts, b.endWatts))))
  const x = (t: number) => (total ? (t / total) * width : 0)
  const y = (w: number) => height - (w / maxW) * (height - 2)
  let t = 0
  const pts: string[] = [`0,${height}`]
  for (const b of blocks) {
    const [a, z] = b.type === 'steady' ? [b.watts, b.watts] : [b.startWatts, b.endWatts]
    pts.push(`${x(t)},${y(a)}`, `${x(t + b.durationS)},${y(z)}`)
    t += b.durationS
  }
  pts.push(`${width},${height}`)
  return (
    <span className="thumb">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <polygon points={pts.join(' ')} fill="rgba(109,91,240,.55)" stroke="var(--accent-line)" strokeWidth={1.25} strokeLinejoin="round" />
      </svg>
    </span>
  )
}
