// Ride summary / ride detail page body: header, stats row, full-ride chart.
import { useState, type ReactNode } from 'react'
import './ride.css'
import type { RideSummary, Sample } from '../../../shared/types'
import { workoutDurationS } from '../engine'
import { formatDuration } from '../format'
import { RideChart } from './RideChart'
import { IconTrash } from './icons'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const pad = (n: number) => String(n).padStart(2, '0')
/** "Sat 26 Sep" */
export const dayLabel = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`
/** "09:30" */
export const timeLabel = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
/** "September 2026" */
export const monthLabel = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`

/** Crashed (never finished) or ended before the last block. */
export const isIncomplete = (r: RideSummary) =>
  r.endedAt == null || (r.blocks != null && r.durationS < workoutDurationS(r.blocks))

export const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

/** Danger button that asks inline before acting (no modal). */
export function ConfirmButton({ label, question, confirmLabel, onConfirm }: {
  label: string
  question: string
  confirmLabel: string
  onConfirm: () => void
}) {
  const [asking, setAsking] = useState(false)
  if (!asking) return <button className="danger lg" onClick={() => setAsking(true)}><IconTrash />{label}</button>
  return (
    <span className="confirm-inline">
      <span>{question}</span>
      <button className="ghost lg" onClick={() => setAsking(false)}>Cancel</button>
      <button className="danger-solid lg" onClick={onConfirm}>{confirmLabel}</button>
    </span>
  )
}

const Stat = ({ label, value, unit }: { label: string; value: number | string | null; unit?: string }) => (
  <div>
    <span className="label">{label}</span>
    {value == null
      ? <span className="num muted">—</span>
      : <span><span className="num">{typeof value === 'number' ? Math.round(value) : value}</span>{unit && <span className="unit">{unit}</span>}</span>}
  </div>
)

export interface RideReportProps {
  ride: RideSummary
  samples: Sample[]
  eyebrow: ReactNode // "RIDE SUMMARY" label or "‹ History" link
  actions: ReactNode // buttons rendered by the caller
}

export function RideReport({ ride, samples, eyebrow, actions }: RideReportProps) {
  const incomplete = isIncomplete(ride)
  const start = new Date(ride.startedAt)
  const end = ride.endedAt ? new Date(ride.endedAt) : new Date(start.getTime() + ride.durationS * 1000)
  const kind = !ride.blocks ? 'free ride' : incomplete ? `planned ${formatDuration(workoutDurationS(ride.blocks))}` : 'planned workout'
  return (
    <main className="page report">
      <header className="report-head">
        <div>
          {eyebrow}
          <div className="report-title">
            <h1>{ride.mode === 'planned' ? (ride.workoutName ?? 'Planned workout') : 'Free ride'}</h1>
            <span className={`badge ${incomplete ? 'warn' : 'ok'}`}>{incomplete ? 'Incomplete' : 'Completed'}</span>
          </div>
          <div className="report-meta">
            {dayLabel(start)} {start.getFullYear()} · {timeLabel(start)}–{timeLabel(end)} · {kind}
          </div>
        </div>
        <div className="report-actions">{actions}</div>
      </header>
      <section className="card report-stats">
        <Stat label="Duration" value={formatDuration(ride.durationS)} />
        <Stat label="Avg power" value={ride.avgPower} unit="W" />
        <Stat label="Max power" value={ride.maxPower} unit="W" />
        <Stat label="Avg HR" value={ride.avgHr} unit="bpm" />
        <Stat label="Max HR" value={ride.maxHr} unit="bpm" />
        <Stat label="Avg cadence" value={ride.avgCadence} unit="rpm" />
        <Stat label="Energy" value={ride.kj} unit="kJ" />
      </section>
      <section className="card chart-card">
        <RideChart
          blocks={ride.blocks}
          samples={samples}
          height="fill"
          endS={incomplete && ride.blocks ? ride.durationS : undefined}
        />
      </section>
    </main>
  )
}
