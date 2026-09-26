import type { Nav, Route } from '../route'
import { DeviceDots } from './DeviceDots'
import { IconStep } from './icons'

const TABS: { label: string; route: Route; match: Route['name'][] }[] = [
  { label: 'Home', route: { name: 'home' }, match: ['home'] },
  { label: 'Workouts', route: { name: 'workouts' }, match: ['workouts', 'builder'] },
  { label: 'History', route: { name: 'history' }, match: ['history', 'rideDetail'] },
  { label: 'Progress', route: { name: 'progress' }, match: ['progress'] },
  { label: 'Achievements', route: { name: 'achievements' }, match: ['achievements'] },
  { label: 'Devices', route: { name: 'devices' }, match: ['devices'] }
]

/** App frame: logo, tabs, device status. tabs=false for the post-ride summary (forces Save/Discard). */
export function TopBar({ route, nav, tabs = true }: { route: Route; nav: Nav; tabs?: boolean }) {
  return (
    <header className="appbar">
      <span className="logo">
        <span className="logo-mark"><IconStep /></span>
        PainCave
      </span>
      {tabs && (
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.label}
              className="tab"
              aria-current={t.match.includes(route.name) ? 'page' : undefined}
              onClick={() => nav(t.route)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}
      <DeviceDots />
    </header>
  )
}
