// STUB – implemented by the ride-UI agent. Props are the contract.
// Static ride chart + summary. Used after a ride (with Save/Discard) and in history (with Delete).
import type { ReactNode } from 'react'
import type { RideSummary, Sample } from '../../../shared/types'

export interface RideReportProps {
  ride: RideSummary
  samples: Sample[]
  actions: ReactNode // buttons rendered by the caller
}

export function RideReport(_props: RideReportProps) {
  return <div className="stub">RideReport</div>
}
