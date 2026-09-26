import { useEffect, useState } from 'react'
import type { RideSummary, Sample } from '../../../shared/types'
import { api } from '../api'
import { ConfirmButton, RideReport } from '../components/RideReport'
import { IconChevronLeft } from '../components/icons'
import type { Nav } from '../route'

export function RideDetailScreen({ nav, rideId }: { nav: Nav; rideId: number }) {
  const [data, setData] = useState<{ ride: RideSummary; samples: Sample[] } | null | undefined>(undefined)
  useEffect(() => {
    api.rides.get(rideId).then(setData)
  }, [rideId])

  const back = () => nav({ name: 'history' })
  const backLink = <button className="link back-link" onClick={back}><IconChevronLeft />History</button>

  if (!data) {
    return (
      <main className="page">
        {backLink}
        {data === null && <p className="muted">Ride not found.</p>}
      </main>
    )
  }

  const remove = async () => {
    await api.rides.delete(rideId)
    back()
  }

  return (
    <RideReport
      ride={data.ride}
      samples={data.samples}
      eyebrow={backLink}
      actions={<ConfirmButton label="Delete ride" question="Delete this ride?" confirmLabel="Delete" onConfirm={remove} />}
    />
  )
}
