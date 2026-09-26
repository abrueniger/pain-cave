import { useEffect, useState } from 'react'
import { devices } from './devices'
import type { Route } from './route'
import { DeviceDots } from './components/DeviceDots'
import { DevicesScreen } from './screens/DevicesScreen'
import { WorkoutsScreen } from './screens/WorkoutsScreen'
import { BuilderScreen } from './screens/BuilderScreen'
import { RideScreen } from './screens/RideScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { RideDetailScreen } from './screens/RideDetailScreen'

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' })

  useEffect(() => {
    devices.connectStored().catch((e) => console.error('connectStored', e))
  }, [])

  switch (route.name) {
    case 'devices':
      return <DevicesScreen nav={setRoute} />
    case 'workouts':
      return <WorkoutsScreen nav={setRoute} />
    case 'builder':
      return <BuilderScreen nav={setRoute} workoutId={route.workoutId} />
    case 'ride':
      return <RideScreen nav={setRoute} mode={route.mode} workoutId={route.mode === 'planned' ? route.workoutId : null} />
    case 'history':
      return <HistoryScreen nav={setRoute} />
    case 'rideDetail':
      return <RideDetailScreen nav={setRoute} rideId={route.rideId} />
    case 'home':
      return (
        <main className="screen home">
          <header className="topbar">
            <h1>PainCave</h1>
            <DeviceDots />
          </header>
          <nav className="home-menu">
            <button className="primary" onClick={() => setRoute({ name: 'ride', mode: 'free' })}>Free ride</button>
            <button onClick={() => setRoute({ name: 'workouts' })}>Workouts</button>
            <button onClick={() => setRoute({ name: 'history' })}>History</button>
            <button onClick={() => setRoute({ name: 'devices' })}>Devices</button>
          </nav>
        </main>
      )
  }
}
