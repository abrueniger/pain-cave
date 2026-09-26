import { useEffect, useState } from 'react'
import type { LevelState, RideSummary, Sample, Workout } from '../../../shared/types'
import { api } from '../api'
import { devices, type DeviceKind } from '../devices'
import { formatDuration } from '../format'
import type { Nav } from '../route'
import { n0 } from '../components/Earned'
import { LevelEmblem } from '../components/LevelEmblem'
import { ProfileThumb } from '../components/ProfileThumb'
import { XpBar } from '../components/XpBar'
import { RideChart } from '../components/RideChart'
import { IconChevronRight, IconController, IconHeart, IconPlay, IconTrainer } from '../components/icons'
import { workoutMeta } from './builder'
import './home.css'

const DEVICES = [
  { kind: 'trainer' as DeviceKind, label: 'Trainer', Icon: IconTrainer },
  { kind: 'controller' as DeviceKind, label: 'Controller', Icon: IconController },
  { kind: 'hr' as DeviceKind, label: 'Heart rate', Icon: IconHeart }
]
const STATE = { connected: 'Connected', searching: 'Searching…', none: 'Not paired' } as const

function rideDate(iso: string) {
  const d = new Date(iso)
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleString('en-GB', o)
  return `${f({ weekday: 'short' })} ${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })} · ${f({ hour: '2-digit', minute: '2-digit' })}`
}

const More = ({ onClick, children }: { onClick: () => void; children: string }) => (
  <button className="link more" onClick={onClick}>{children}<IconChevronRight /></button>
)

export function HomeScreen({ nav }: { nav: Nav }) {
  const [, rerender] = useState(0)
  const [workouts, setWorkouts] = useState<Workout[] | null>(null)
  const [last, setLast] = useState<{ ride: RideSummary; samples: Sample[] } | null>(null)
  const [lvl, setLvl] = useState<LevelState | null>(null)

  useEffect(() => devices.on('status', () => rerender((n) => n + 1)), [])
  useEffect(() => {
    api.workouts.list().then((ws) => setWorkouts([...ws].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3)))
    api.rides.list().then((rs) => rs[0] && api.rides.get(rs[0].id).then(setLast))
    api.achievements.overview().then(setLvl, () => {})
  }, [])

  const trainerOk = devices.status('trainer').status === 'connected'
  const newWorkout = () => nav({ name: 'builder', workoutId: null })

  return (
    <main className="page home">
      <LevelCard lvl={lvl} onClick={() => nav({ name: 'achievements' })} />

      <section className="card free">
        <div className="label accent">Free ride</div>
        <h1>Just ride</h1>
        <p>ERG starts at 100 W. Shift on the Zwift Ride to change the target — right paddles ±10 W, left paddles ±50 W.</p>
        <svg className="deco" viewBox="0 0 280 100" aria-hidden="true">
          <path d="M0 80h36V58h72V30h108V5h70" />
        </svg>
        <div className="free-start">
          <button className="primary xl" disabled={!trainerOk} onClick={() => nav({ name: 'ride', mode: 'free' })}>
            <IconPlay />Start free ride
          </button>
          {!trainerOk && <span className="small warn">Trainer not connected</span>}
        </div>
      </section>

      <section className="card workouts">
        <header>
          <h2>Workouts</h2>
          <More onClick={() => nav({ name: 'workouts' })}>All workouts</More>
        </header>
        {workouts?.length === 0 && (
          <div className="home-empty">
            <p className="muted">No workouts yet</p>
            <button className="primary" onClick={newWorkout}>New workout</button>
          </div>
        )}
        {workouts?.map((w) => (
          <div key={w.id} className="wrow">
            <ProfileThumb blocks={w.blocks} unit={w.unit} width={132} height={34} />
            <div className="grow">
              <div className="wname">{w.name}</div>
              <div className="small muted tnum">{workoutMeta(w.blocks, w.unit)}</div>
            </div>
            <button onClick={() => nav({ name: 'ride', mode: 'planned', workoutId: w.id })}>
              <IconPlay />Start
            </button>
          </div>
        ))}
      </section>

      {last && (
        <section className="card last">
          <header>
            <div>
              <div className="label">Last ride</div>
              <div className="rname">{last.ride.workoutName ?? 'Free ride'}</div>
              <div className="small muted">{rideDate(last.ride.startedAt)}</div>
            </div>
            <More onClick={() => nav({ name: 'rideDetail', rideId: last.ride.id })}>View ride</More>
          </header>
          <div className="well">
            <RideChart blocks={last.ride.blocks} samples={last.samples} height={120} compact />
          </div>
          <div className="stats">
            <Stat label="Duration" value={formatDuration(last.ride.durationS)} />
            <Stat label="Avg power" value={last.ride.avgPower} unit="W" />
            <Stat label="Avg HR" value={last.ride.avgHr} unit="bpm" />
            <Stat label="Energy" value={last.ride.kj} unit="kJ" />
          </div>
        </section>
      )}

      <section className="card devs">
        <header>
          <h2>Devices</h2>
          <More onClick={() => nav({ name: 'settings' })}>Manage</More>
        </header>
        {DEVICES.map(({ kind, label, Icon }) => {
          const s = devices.status(kind)
          return (
            <div key={kind} className="drow">
              <span className="well-icon"><Icon /></span>
              <div className="grow">
                <div className="dname">{label}</div>
                <div className="small muted">{s.name ?? 'No device paired'}</div>
              </div>
              <span className={`dstate ${s.status}`}><span className={`dot ${s.status}`} />{STATE[s.status]}</span>
            </div>
          )
        })}
        <p className="small muted foot">Paired devices reconnect automatically.</p>
      </section>
    </main>
  )
}

function LevelCard({ lvl, onClick }: { lvl: LevelState | null; onClick: () => void }) {
  if (!lvl) return <div className="card lvl-card" />
  const first = lvl.level === 1
  return (
    <button className="card lvl-card" onClick={onClick}
      aria-label={`Level ${lvl.level}, ${lvl.title}. ${n0(lvl.xp)} of ${n0(lvl.nextLevelXp)} XP. Open achievements`}>
      <LevelEmblem level={lvl.level} size={44} />
      <div className="lvl-name">
        <div className="label accent">Level {lvl.level}</div>
        <div className="lvl-title">{lvl.title}</div>
      </div>
      <div className="lvl-progress">
        <div className="lvl-row">
          <span>{first ? 'Your first ride unlocks Level 2' : `${n0(lvl.nextLevelXp - lvl.xp)} XP to Level ${lvl.level + 1}`}</span>
          {first ? <span>0 XP</span> : <span><b className="num">{n0(lvl.xp)}</b> / {n0(lvl.nextLevelXp)} XP</span>}
        </div>
        <XpBar {...lvl} height={8} />
      </div>
      <span className="lvl-div" />
      <span className="lvl-link">Achievements<IconChevronRight /></span>
    </button>
  )
}

function Stat({ label, value, unit }: { label: string; value: string | number | null; unit?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      {value == null ? <span className="stat-v num muted">—</span> : (
        <span className="stat-v num">{typeof value === 'number' ? Math.round(value) : value}{unit && <span className="unit">{unit}</span>}</span>
      )}
    </div>
  )
}
