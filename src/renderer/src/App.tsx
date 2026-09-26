import { useEffect, useState } from 'react'
import '@fontsource-variable/archivo/wdth.css'
import { devices } from './devices'
import type { Route } from './route'
import { TopBar } from './components/TopBar'
import { HomeScreen } from './screens/HomeScreen'
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

  // The ride screen owns the whole window (and renders its own slim bar for the summary)
  if (route.name === 'ride') {
    return <RideScreen nav={setRoute} mode={route.mode} workoutId={route.mode === 'planned' ? route.workoutId : null} />
  }

  const screen = (() => {
    switch (route.name) {
      case 'devices': return <DevicesScreen nav={setRoute} />
      case 'workouts': return <WorkoutsScreen nav={setRoute} />
      case 'builder': return <BuilderScreen nav={setRoute} workoutId={route.workoutId} />
      case 'history': return <HistoryScreen nav={setRoute} />
      case 'rideDetail': return <RideDetailScreen nav={setRoute} rideId={route.rideId} />
      case 'home': return <HomeScreen nav={setRoute} />
    }
  })()

  return (
    <>
      <TopBar route={route} nav={setRoute} />
      {screen}
    </>
  )
}
