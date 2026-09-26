// Static ride chart + summary. Used after a ride (with Save/Discard) and in history (with Delete).
import type { ReactNode } from 'react'
import './ride.css'
import type { RideSummary, Sample } from '../../../shared/types'
import { formatDuration } from '../format'
import { RideChart } from './RideChart'

export interface RideReportProps {
  ride: RideSummary
  samples: Sample[]
  actions: ReactNode // buttons rendered by the caller
}

export function RideReport({ ride, samples, actions }: RideReportProps) {
  const items: [string, string][] = [
    ['Date', new Date(ride.startedAt).toLocaleString()],
    ['Workout', ride.mode === 'planned' ? (ride.workoutName ?? 'Planned workout') : 'Free ride'],
    ['Duration', formatDuration(ride.durationS)],
    ['Avg / max power', `${Math.round(ride.avgPower)} / ${Math.round(ride.maxPower)} W`],
    ['Avg / max HR', ride.avgHr == null ? '–' : `${Math.round(ride.avgHr)} / ${Math.round(ride.maxHr ?? 0)} bpm`],
    ['Avg cadence', `${Math.round(ride.avgCadence)} rpm`],
    ['Energy', `${Math.round(ride.kj)} kJ`]
  ]
  return (
    <section className="ride-report">
      <RideChart blocks={ride.blocks} samples={samples} height={260} />
      <dl className="ride-report-grid card">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="ride-report-actions">{actions}</div>
    </section>
  )
}
