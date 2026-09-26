import { useEffect, useMemo, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import './ride.css'
import { LIMITS, type Block, type Sample } from '../../../shared/types'
import { planTargetAt, workoutDurationS } from '../engine'
import { formatDuration } from '../format'

export interface RideChartProps {
  blocks: Block[] | null // planned: whole profile in the background; null = free ride
  samples: Sample[] // actual power, HR and (free ride) target step line
  positionS?: number // live: "now" marker with time chip; omit for static charts
  offset?: number // planned live: dashed plan+offset line from positionS on
  paused?: boolean // live: now marker in --text-2
  endS?: number // static: ride ended early here -> unridden remainder + "Ended" marker
  height?: number | 'fill' // px (default 220) or fill the parent's height (flex child)
  compact?: boolean // no axes, no legend, no padding (Home 'Last ride' card)
}

// live = ride screen, report = summary/detail/home, preview = builder (plan only)
type Kind = 'live' | 'report' | 'preview'
type Col = (number | null)[]

const W_MAX = 350
const clamp = (w: number) => Math.min(LIMITS.maxWatts, Math.max(LIMITS.minWatts, w))
const xStep = (span: number) => (span <= 300 ? 60 : span < 1200 ? 120 : span < 2700 ? 300 : 600)
const steps = (from: number, to: number, step: number) => {
  const out: number[] = []
  for (let v = from; v <= to; v += step) out.push(v)
  return out
}

/** Columns: x, plan A (before split), plan B (after split), plan+offset, free target, power, hr. */
function buildData(kind: Kind, blocks: Block[] | null, samples: Sample[], positionS = 0, offset = 0, endS?: number) {
  const lastS = samples.length ? Math.round(samples[samples.length - 1].tS) : 0
  if (!blocks) {
    const xs = samples.map((s) => Math.round(s.tS))
    const col = (f: (s: Sample) => number | null): Col => samples.map(f)
    const cols: Col[] = [col(() => null), col(() => null), col(() => null), col((s) => s.targetPower), col((s) => s.power), col((s) => s.hr)]
    const xMax = kind === 'live' ? (Math.floor(positionS / 300) + 1) * 300 : Math.max(60, lastS)
    for (const x of [0, xMax]) {
      if (xs.length && xs[xs.length - 1] >= x) continue
      xs.push(x)
      cols.forEach((c) => c.push(null))
    }
    return { data: [xs, ...cols] as uPlot.AlignedData, xMax }
  }
  const dur = workoutDurationS(blocks)
  const n = Math.max(dur, lastS, 1)
  const split = kind === 'live' ? Math.floor(positionS) : kind === 'preview' ? -1 : (endS ?? Infinity)
  const xs: number[] = []
  const a: Col = [], b: Col = [], shifted: Col = [], power: Col = [], hr: Col = []
  const push = (t: number, plan: number | null) => {
    xs.push(t)
    a.push(t <= split ? plan : null)
    b.push(t >= split ? plan : null)
    shifted.push(kind === 'live' && offset && t >= split && plan != null ? clamp(plan + offset) : null)
    power.push(null)
    hr.push(null)
  }
  // an extra point just before each block edge keeps the steps vertical
  const edges = new Set(blocks.map((_, i) => workoutDurationS(blocks.slice(0, i + 1))))
  const EPS = 1e-3
  const at: number[] = [] // second -> column index
  for (let t = 0; t <= n; t++) {
    if (edges.has(t) && t < dur) push(t - EPS, planTargetAt(blocks, t - EPS))
    at[t] = xs.length
    // planTargetAt is null at t === dur; use the last block's end value there
    push(t, t < dur ? planTargetAt(blocks, t) : t === dur && dur > 0 ? planTargetAt(blocks, dur - EPS) : null)
  }
  for (const s of samples) {
    const i = at[Math.round(s.tS)]
    if (i == null) continue
    power[i] = s.power
    hr[i] = s.hr
    if (xs[i - 1] % 1) {
      // edge point: continue the lines through it
      power[i - 1] = s.power
      hr[i - 1] = s.hr
    }
  }
  return { data: [xs, a, b, shifted, xs.map(() => null), power, hr] as uPlot.AlignedData, xMax: n }
}

type Swatch = 'power' | 'hr' | 'dash' | 'target' | 'plan' | 'done' | 'ridden'
function legendItems(kind: Kind, planned: boolean): [Swatch, string][] {
  if (kind === 'preview') return []
  const base: [Swatch, string][] = [['power', 'Power'], ['hr', 'Heart rate']]
  if (!planned) return [...base, ['target', 'Target']]
  if (kind === 'report') return [...base, ['done', 'Plan']]
  return [...base, ['dash', 'Target (plan + offset)'], ['plan', 'Plan'], ['ridden', 'Ridden']]
}

export function RideChart({ blocks, samples, positionS, offset = 0, paused, endS, height = 220, compact }: RideChartProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const kind: Kind = positionS != null ? 'live' : samples.length ? 'report' : 'preview'
  const fill = height === 'fill'

  const { data, xMax } = useMemo(
    () => buildData(kind, blocks, samples, positionS, offset, endS),
    [kind, blocks, samples, positionS, offset, endS]
  )
  // read by uPlot hooks / range fns, which live as long as the instance
  const live = useRef({ data, xMax, positionS, paused, endS })
  live.current = { data, xMax, positionS, paused, endS }

  useEffect(() => {
    const box = boxRef.current!
    const css = getComputedStyle(document.documentElement)
    const c = (name: string) => css.getPropertyValue(name).trim()
    const font = getComputedStyle(document.body).fontFamily
    const pr = uPlot.pxRatio
    const dash = (d: number[]) => d.map((v) => v * pr)
    const hasHr = kind !== 'preview'
    const axisBase = { font: `12px ${font}`, stroke: c('--muted'), ticks: { show: false }, gap: 10 }
    const grid = (stroke: string) => ({ stroke, width: 1 })

    const planA = kind === 'live'
      ? { fill: c('--chart-ridden'), stroke: 'transparent', width: 0 }
      : { fill: c('--chart-plan-done'), stroke: 'rgba(142, 125, 255, 0.7)', width: 1.25 }
    const planB = kind === 'report'
      ? { fill: c('--chart-unridden'), stroke: c('--faint'), width: 1.25, dash: dash([4, 4]) }
      : { fill: kind === 'preview' ? 'rgba(109, 91, 240, 0.32)' : c('--chart-plan'), stroke: c('--accent-line'), width: 1.5 }

    const opts: uPlot.Options = {
      width: box.clientWidth,
      height: fill ? box.clientHeight || 200 : (height as number),
      padding: compact ? [0, 0, 0, 0] : [kind === 'live' ? 30 : 12, hasHr ? 0 : 16, 0, 0],
      legend: { show: false },
      cursor: { show: false },
      scales: {
        x: { time: false, range: () => [0, live.current.xMax] },
        w: { range: (_u, _min, max) => [0, (max ?? 0) > W_MAX ? Math.ceil(((max ?? 0) + 50) / 50) * 50 : W_MAX] },
        hr: { range: (_u, _min, max) => [60, Math.max(180, max ?? 0)] }
      },
      axes: compact
        ? [{ show: false }, { scale: 'w', show: false }, { scale: 'hr', show: false }]
        : [
            {
              ...axisBase, size: 28, gap: 6, grid: grid('rgba(244, 242, 236, 0.05)'),
              splits: (_u, _i, _min, max) => steps(0, max, xStep(max)),
              values: (_u, splits) => splits.map(formatDuration)
            },
            {
              ...axisBase, scale: 'w', size: 56, grid: grid(c('--chart-grid')),
              splits: (_u, _i, _min, max) => steps(0, max, 100),
              values: (_u, splits) => splits.map((v) => `${v} W`)
            },
            {
              ...axisBase, scale: 'hr', side: 1, size: 48, show: hasHr, grid: { show: false }, stroke: 'rgba(255, 111, 145, 0.8)',
              // step 20; 40 when the plot is too short for the labels
              splits: (u, _i, _min, max) => steps(60, max, (u.bbox.height / pr) * 20 / (max - 60) < 18 ? 40 : 20),
              values: (_u, splits) => splits.map((v) => (v === 60 ? '' : String(v)))
            }
          ],
      series: [
        {},
        { scale: 'w', ...planA, fillTo: 0 },
        { scale: 'w', ...planB, fillTo: 0 },
        { scale: 'w', stroke: c('--accent-hi'), width: 2, dash: dash([7, 5]) },
        { scale: 'w', stroke: c('--accent-hi'), width: 2, paths: uPlot.paths.stepped!({ align: 1 }) },
        { scale: 'w', stroke: c('--text'), width: compact ? 1.5 : 2 },
        { scale: 'hr', stroke: c('--hr-line'), width: compact ? 1.25 : 1.75 }
      ].map((s, i) => (i ? { ...s, points: { show: false } } : s)),
      hooks: {
        drawAxes: [
          (u) => {
            if (compact) return
            const y = Math.round(u.valToPos(0, 'w', true)) + 0.5
            const ctx = u.ctx
            ctx.save()
            ctx.strokeStyle = 'rgba(244, 242, 236, 0.18)'
            ctx.lineWidth = pr
            ctx.beginPath()
            ctx.moveTo(u.bbox.left, y)
            ctx.lineTo(u.bbox.left + u.bbox.width, y)
            ctx.stroke()
            ctx.restore()
          }
        ],
        draw: [
          (u) => {
            const { positionS: pos, paused: isPaused, endS: end } = live.current
            const ctx = u.ctx
            const top = u.bbox.top
            const bottom = top + u.bbox.height
            ctx.save()
            if (pos != null) {
              const color = c(isPaused ? '--text-2' : '--text')
              const x = Math.round(u.valToPos(pos, 'x', true))
              ctx.strokeStyle = color
              ctx.lineWidth = 2 * pr
              ctx.beginPath()
              ctx.moveTo(x, compact ? top : top - 6 * pr)
              ctx.lineTo(x, bottom)
              ctx.stroke()
              if (!compact) {
                const label = formatDuration(pos)
                ctx.font = `700 ${13 * pr}px ${font}`
                const w = Math.max(54 * pr, ctx.measureText(label).width + 16 * pr)
                const h = 22 * pr
                const cx = Math.min(Math.max(x, w / 2), ctx.canvas.width - w / 2)
                ctx.fillStyle = color
                ctx.beginPath()
                ctx.roundRect(cx - w / 2, top - 28 * pr, w, h, 6 * pr)
                ctx.fill()
                ctx.fillStyle = c('--bg')
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText(label, cx, top - 28 * pr + h / 2 + pr)
              }
            }
            if (end != null) {
              const x = Math.round(u.valToPos(end, 'x', true)) + 0.5
              const warn = c('--warn')
              ctx.strokeStyle = warn
              ctx.lineWidth = 1.5 * pr
              ctx.setLineDash(dash([4, 4]))
              ctx.beginPath()
              ctx.moveTo(x, top)
              ctx.lineTo(x, bottom)
              ctx.stroke()
              if (!compact) {
                ctx.fillStyle = warn
                ctx.font = `500 ${12 * pr}px ${font}`
                ctx.textBaseline = 'middle'
                ctx.fillText(`Ended ${formatDuration(end)}`, x + 8 * pr, top + 10 * pr)
              }
            }
            ctx.restore()
          }
        ]
      }
    }
    const u = new uPlot(opts, live.current.data, box)
    plotRef.current = u
    const ro = new ResizeObserver(() => u.setSize({ width: box.clientWidth, height: fill ? box.clientHeight : (height as number) }))
    ro.observe(box)
    return () => {
      ro.disconnect()
      u.destroy()
      plotRef.current = null
    }
  }, [kind, compact, fill, height])

  useEffect(() => {
    plotRef.current?.setData(data)
  }, [data])

  // paused / end changes don't change the data, but the markers must repaint
  useEffect(() => {
    plotRef.current?.redraw(false)
  }, [paused, endS])

  const legend = compact ? [] : legendItems(kind, !!blocks)
  return (
    <div className={`ride-chart${fill ? ' fill' : ''}${compact ? ' compact' : ''}`}>
      {legend.length > 0 && (
        <div className="chart-legend">
          {legend.map(([sw, label]) => (
            <span key={label}><i className={`sw ${sw}`} />{label}</span>
          ))}
        </div>
      )}
      <div ref={boxRef} className="chart-plot" style={fill ? undefined : { height: height as number }} />
    </div>
  )
}
