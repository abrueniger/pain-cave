import { useEffect, useMemo, useState } from 'react'
import '@fontsource-variable/archivo/wdth.css'
import { devices } from './devices'
import { guardNav, type Route } from './route'
import { TopBar } from './components/TopBar'
import { HomeScreen } from './screens/HomeScreen'
import { DevicesScreen } from './screens/DevicesScreen'
import { WorkoutsScreen } from './screens/WorkoutsScreen'
import { BuilderScreen } from './screens/BuilderScreen'
import { RideScreen } from './screens/RideScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { RideDetailScreen } from './screens/RideDetailScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { AchievementsScreen } from './screens/AchievementsScreen'

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const nav = useMemo(() => guardNav(setRoute), [])

  useEffect(() => {
    devices.connectStored().catch((e) => console.error('connectStored', e))
  }, [])

  // The ride screen owns the whole window (and renders its own slim bar for the summary)
  if (route.name === 'ride') {
    return <RideScreen nav={nav} mode={route.mode} workoutId={route.mode === 'planned' ? route.workoutId : null} />
  }

  const screen = (() => {
    switch (route.name) {
      case 'devices': return <DevicesScreen nav={nav} />
      case 'workouts': return <WorkoutsScreen nav={nav} />
      case 'builder': return <BuilderScreen nav={nav} workoutId={route.workoutId} />
      case 'history': return <HistoryScreen nav={nav} />
      case 'rideDetail': return <RideDetailScreen nav={nav} rideId={route.rideId} />
      case 'progress': return <ProgressScreen nav={nav} />
      case 'achievements': return <AchievementsScreen nav={nav} />
      case 'home': return <HomeScreen nav={nav} />
    }
  })()

  return (
    <>
      <TopBar route={route} nav={nav} />
      {screen}
    </>
  )
}
