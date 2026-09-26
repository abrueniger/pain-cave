import { useEffect, useState } from 'react'
import type { RideSummary, Sample } from '../../../shared/types'
import { api } from '../api'
import { RideReport } from '../components/RideReport'
import type { Nav } from '../route'
import './screens.css'

export function RideDetailScreen({ nav, rideId }: { nav: Nav; rideId: number }) {
  const [data, setData] = useState<{ ride: RideSummary; samples: Sample[] } | null | undefined>(undefined)
  useEffect(() => {
    api.rides.get(rideId).then(setData)
  }, [rideId])

  const back = () => nav({ name: 'history' })

  const remove = async () => {
    if (!confirm('Delete this ride?')) return
    await api.rides.delete(rideId)
    back()
  }

  if (!data) {
    return (
      <main className="screen">
        <header className="topbar">
          <button onClick={back}>Back</button>
        </header>
        {data === null && <div className="card empty">Ride not found.</div>}
      </main>
    )
  }

  return (
    <main className="screen">
      <RideReport
        ride={data.ride}
        samples={data.samples}
        actions={
          <>
            <button onClick={back}>Back</button>
            <button className="danger" onClick={remove}>Delete</button>
          </>
        }
      />
    </main>
  )
}
