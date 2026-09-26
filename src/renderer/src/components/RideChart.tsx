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
  positionS?: number // vertical "now" line; omit for static charts
  offset?: number // planned: dashed plan+offset line from positionS on
  height?: number // px, default 220
  compact?: boolean // no axes, no legend (Home 'Last ride' card)
}

const FREE_MIN_S = 600
type Col = (number | null)[]

const clamp = (w: number) => Math.min(LIMITS.maxWatts, Math.max(LIMITS.minWatts, w))

/** Columns: x, plan ridden, plan ahead, plan+offset, free target, power, hr */
function buildData(blocks: Block[] | null, samples: Sample[], positionS?: number, offset = 0): uPlot.AlignedData {
  const lastS = samples.length ? Math.round(samples[samples.length - 1].tS) : 0
  if (!blocks) {
    const xs = samples.map((s) => Math.round(s.tS))
    const col = (f: (s: Sample) => number | null): Col => samples.map(f)
    const cols: Col[] = [col(() => null), col(() => null), col(() => null), col((s) => s.targetPower), col((s) => s.power), col((s) => s.hr)]
    if (lastS < FREE_MIN_S) {
      xs.push(FREE_MIN_S)
      cols.forEach((c) => c.push(null))
    }
    return [xs, ...cols]
  }
  const dur = workoutDurationS(blocks)
  const n = Math.max(dur, lastS)
  const p = positionS == null ? null : Math.floor(positionS)
  const xs: number[] = []
  const done: Col = [], ahead: Col = [], shifted: Col = [], power: Col = [], hr: Col = []
  for (let t = 0; t <= n; t++) {
    // planTargetAt is null at t === dur; use the last block's end value there
    const plan = t < dur ? planTargetAt(blocks, t) : t === dur && dur > 0 ? planTargetAt(blocks, dur - 1e-6) : null
    xs.push(t)
    done.push(p != null && t <= p ? plan : null)
    ahead.push(p == null || t >= p ? plan : null)
    shifted.push(p != null && offset && t >= p && plan != null ? clamp(plan + offset) : null)
    power.push(null)
    hr.push(null)
  }
  for (const s of samples) {
    const i = Math.round(s.tS)
    if (i >= 0 && i <= n) {
      power[i] = s.power
      hr[i] = s.hr
    }
  }
  return [xs, done, ahead, shifted, xs.map(() => null), power, hr]
}

function axisTime(s: number): string {
  if (s < 3600) return formatDuration(s)
  const m = Math.floor(s / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

export function RideChart({ blocks, samples, positionS, offset = 0, height = 220 }: RideChartProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const posRef = useRef<number | null>(null)
  posRef.current = blocks && positionS != null ? positionS : null

  const data = useMemo(() => buildData(blocks, samples, positionS, offset), [blocks, samples, positionS, offset])
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    const box = boxRef.current!
    const css = getComputedStyle(document.documentElement)
    const c = (name: string) => css.getPropertyValue(name).trim()
    const plan = c('--plan-fill')
    const axis = { stroke: c('--text-2'), grid: { stroke: c('--border'), width: 1 }, ticks: { show: false } }
    const opts: uPlot.Options = {
      width: box.clientWidth,
      height,
      legend: { show: false },
      cursor: { show: false },
      scales: {
        x: { time: false, range: (_u, min, max) => [min, max] },
        w: { range: (_u, _min, max) => [0, Math.max(200, (max ?? 0) * 1.1)] },
        bpm: { range: (_u, min, max) => [Math.min(60, min ?? 60), Math.max(180, (max ?? 0) + 5)] }
      },
      axes: [
        { ...axis, incrs: [10, 15, 30, 60, 120, 300, 600, 900, 1200, 1800, 3600, 7200], values: (_u, splits) => splits.map(axisTime) },
        { ...axis, scale: 'w', values: (_u, splits) => splits.map((v) => `${v} W`), size: 60 },
        { ...axis, scale: 'bpm', side: 1, grid: { show: false }, stroke: c('--hr'), size: 45 }
      ],
      series: [
        {},
        { scale: 'w', stroke: plan + '66', fill: plan + '33', width: 1 },
        { scale: 'w', stroke: plan, fill: plan + '80', width: 1 },
        { scale: 'w', stroke: c('--target'), width: 2, dash: [6, 4] },
        { scale: 'w', stroke: c('--target'), width: 2, paths: uPlot.paths.stepped!({ align: 1 }) },
        { scale: 'w', stroke: c('--power'), width: 2 },
        { scale: 'bpm', stroke: c('--hr'), width: 1.5 }
      ].map((sr, i) => (i ? { ...sr, points: { show: false } } : sr)),
      hooks: {
        draw: [
          (u) => {
            const pos = posRef.current
            if (pos == null) return
            const x = Math.round(u.valToPos(pos, 'x', true))
            const ctx = u.ctx
            ctx.save()
            ctx.strokeStyle = c('--text')
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(x, u.bbox.top)
            ctx.lineTo(x, u.bbox.top + u.bbox.height)
            ctx.stroke()
            ctx.restore()
          }
        ]
      }
    }
    const u = new uPlot(opts, dataRef.current, box)
    plotRef.current = u
    const ro = new ResizeObserver(() => u.setSize({ width: box.clientWidth, height }))
    ro.observe(box)
    return () => {
      ro.disconnect()
      u.destroy()
      plotRef.current = null
    }
  }, [height])

  useEffect(() => {
    plotRef.current?.setData(data)
  }, [data])

  return <div ref={boxRef} className="ride-chart" />
}
