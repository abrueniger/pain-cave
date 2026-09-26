import { useEffect, useState } from 'react'
import type { Workout } from '../../../shared/types'
import { api } from '../api'
import { IconCopy, IconEdit, IconPlay, IconPlus, IconTrash } from '../components/icons'
import { ProfileThumb } from '../components/ProfileThumb'
import type { Nav } from '../route'
import { workoutMeta } from './builder'
import './workouts.css'

export function WorkoutsScreen({ nav }: { nav: Nav }) {
  const [workouts, setWorkouts] = useState<Workout[] | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const reload = () => api.workouts.list().then(setWorkouts)
  useEffect(() => {
    reload()
  }, [])

  const duplicate = async (w: Workout) => {
    await api.workouts.save({ name: `${w.name} copy`, blocks: w.blocks })
    reload()
  }

  const remove = async (id: number) => {
    await api.workouts.delete(id)
    setConfirmId(null)
    reload()
  }

  const create = () => nav({ name: 'builder', workoutId: null })
  const n = workouts?.length ?? 0

  return (
    <main className="page">
      <header className="wo-head">
        <div>
          <h1>Workouts</h1>
          {workouts && <div className="wo-sub">{n ? `${n} saved workout${n === 1 ? '' : 's'}` : 'No saved workouts'}</div>}
        </div>
        <button className="primary lg" onClick={create}><IconPlus />New workout</button>
      </header>

      {workouts?.length === 0 && (
        <div className="wo-empty">
          <svg width="160" height="64" viewBox="0 0 160 64" aria-hidden="true">
            <path d="M2 62V44h36V28h40V12h22v16h18l40 18v16z" fill="var(--accent-soft)" stroke="var(--accent-line)" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <h2>No workouts yet</h2>
          <p>Build one from steady blocks and ramps. It shows up here, ready to start.</p>
          <button className="primary lg" onClick={create}><IconPlus />New workout</button>
          <button className="link" onClick={() => nav({ name: 'ride', mode: 'free' })}>Or start a free ride</button>
        </div>
      )}

      {!!n && (
        <ul className="card wo-list">
          {workouts!.map((w) => (
            <li key={w.id} className={confirmId === w.id ? 'confirm' : undefined}>
              <ProfileThumb blocks={w.blocks} />
              <div className="wo-info">
                <div className="wo-name">{w.name}</div>
                <div className="wo-meta">{workoutMeta(w.blocks)}</div>
              </div>
              {confirmId === w.id ? (
                <div className="wo-actions">
                  <span className="wo-ask">Delete this workout?</span>
                  <button className="ghost" onClick={() => setConfirmId(null)}>Cancel</button>
                  <button className="danger-solid" onClick={() => remove(w.id)}><IconTrash />Delete</button>
                </div>
              ) : (
                <div className="wo-actions">
                  <button className="primary" onClick={() => nav({ name: 'ride', mode: 'planned', workoutId: w.id })}><IconPlay />Start</button>
                  <button onClick={() => nav({ name: 'builder', workoutId: w.id })}><IconEdit />Edit</button>
                  <button className="ghost" onClick={() => duplicate(w)}><IconCopy />Duplicate</button>
                  <button className="ghost icon wo-trash" aria-label={`Delete ${w.name}`} title="Delete" onClick={() => setConfirmId(w.id)}><IconTrash /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
