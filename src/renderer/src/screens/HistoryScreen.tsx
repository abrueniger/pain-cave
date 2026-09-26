import { Fragment, useEffect, useState } from 'react'
import type { RideSummary } from '../../../shared/types'
import { api } from '../api'
import { formatDuration } from '../format'
import type { Nav } from '../route'
import { dayLabel, isIncomplete, monthLabel, timeLabel } from '../components/RideReport'
import { IconChevronRight, IconStep } from '../components/icons'
import './history.css'

const Num = ({ v, unit }: { v: number | string | null; unit?: string }) => (
  <span className="h-num">
    {v == null ? <span className="muted">—</span> : <><b>{typeof v === 'number' ? Math.round(v) : v}</b>{unit && <span className="u">{unit}</span>}</>}
  </span>
)

export function HistoryScreen({ nav }: { nav: Nav }) {
  const [rides, setRides] = useState<RideSummary[] | null>(null)
  useEffect(() => {
    api.rides.list().then(setRides)
  }, [])
  if (!rides) return <main className="page" />

  // newest first (api order), grouped by month
  const groups: [string, RideSummary[]][] = []
  for (const r of rides) {
    const m = monthLabel(new Date(r.startedAt))
    if (groups[groups.length - 1]?.[0] !== m) groups.push([m, []])
    groups[groups.length - 1][1].push(r)
  }

  return (
    <main className="page history">
      <header>
        <h1>History</h1>
        <p className="history-count">{rides.length} ride{rides.length === 1 ? '' : 's'}</p>
      </header>

      {rides.length === 0
        ? (
            <div className="history-empty">
              <svg viewBox="0 0 160 64" width={160} height={64} aria-hidden="true">
                <path d="M2 62V44h36V26h40V10h36v24h44v28z" fill="var(--accent-soft)" stroke="var(--accent-line)" strokeWidth={1.5} strokeLinejoin="round" />
              </svg>
              <h2>No rides yet</h2>
              <p>Finished rides show up here with their power and heart rate.</p>
              <button className="primary lg" onClick={() => nav({ name: 'ride', mode: 'free' })}>Start free ride</button>
            </div>
          )
        : (
            <div className="card history-table">
              <div className="h-row h-head label">
                <span>Date</span><span>Workout</span>
                <span className="r">Duration</span><span className="r">Avg power</span><span className="r">Avg HR</span><span className="r">Energy</span>
                <span />
              </div>
              {groups.map(([month, list]) => (
                <Fragment key={month}>
                  <div className="h-month label">{month}</div>
                  {list.map((r) => {
                    const d = new Date(r.startedAt)
                    return (
                      <button key={r.id} className="h-row" onClick={() => nav({ name: 'rideDetail', rideId: r.id })}>
                        <span className="h-date"><b>{dayLabel(d)}</b><span>{timeLabel(d)}</span></span>
                        {r.mode === 'free'
                          ? <span className="h-work free"><IconStep />Free ride</span>
                          : (
                              <span className="h-work">
                                <b>{r.workoutName ?? 'Workout'}</b>
                                {isIncomplete(r) && <span className="badge warn">Incomplete</span>}
                              </span>
                            )}
                        <Num v={formatDuration(r.durationS)} />
                        <Num v={r.avgPower} unit="W" />
                        <Num v={r.avgHr} unit="bpm" />
                        <Num v={r.kj} unit="kJ" />
                        <span className="h-chev"><IconChevronRight /></span>
                      </button>
                    )
                  })}
                </Fragment>
              ))}
            </div>
          )}
    </main>
  )
}
