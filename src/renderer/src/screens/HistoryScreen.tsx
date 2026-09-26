import { useEffect, useState } from 'react'
import type { RideSummary } from '../../../shared/types'
import { api } from '../api'
import { formatDuration } from '../format'
import type { Nav } from '../route'
import './screens.css'

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function HistoryScreen({ nav }: { nav: Nav }) {
  const [rides, setRides] = useState<RideSummary[] | null>(null)
  useEffect(() => {
    api.rides.list().then(setRides)
  }, [])

  return (
    <main className="screen">
      <header className="topbar">
        <button onClick={() => nav({ name: 'home' })}>Back</button>
        <h1 className="grow">History</h1>
      </header>

      {rides?.length === 0 && (
        <div className="card empty">
          <p>No rides yet. Finished rides show up here.</p>
        </div>
      )}

      {!!rides?.length && (
        <table className="table clickable">
          <thead>
            <tr>
              <th>Date</th><th>Mode</th><th className="num">Duration</th>
              <th className="num">Avg power</th><th className="num">Avg HR</th><th className="num">kJ</th>
            </tr>
          </thead>
          <tbody>
            {rides.map((r) => (
              <tr key={r.id} onClick={() => nav({ name: 'rideDetail', rideId: r.id })}>
                <td>
                  {dateFmt.format(new Date(r.startedAt))}
                  {r.endedAt === null && <span className="badge">incomplete</span>}
                </td>
                <td>{r.mode === 'free' ? 'Free' : (r.workoutName ?? 'Workout')}</td>
                <td className="num">{formatDuration(r.durationS)}</td>
                <td className="num">{Math.round(r.avgPower)} W</td>
                <td className="num">{r.avgHr === null ? '–' : `${Math.round(r.avgHr)} bpm`}</td>
                <td className="num">{Math.round(r.kj)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
