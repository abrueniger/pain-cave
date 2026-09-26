import { useEffect, useState } from 'react'
import type { Workout } from '../../../shared/types'
import { api } from '../api'
import { workoutDurationS } from '../engine/plan'
import { formatDuration } from '../format'
import type { Nav } from '../route'
import './screens.css'

export function WorkoutsScreen({ nav }: { nav: Nav }) {
  const [workouts, setWorkouts] = useState<Workout[] | null>(null)
  const reload = () => api.workouts.list().then(setWorkouts)
  useEffect(() => {
    reload()
  }, [])

  const duplicate = async (w: Workout) => {
    await api.workouts.save({ name: `${w.name} copy`, blocks: w.blocks })
    reload()
  }

  const remove = async (w: Workout) => {
    if (!confirm(`Delete "${w.name}"?`)) return
    await api.workouts.delete(w.id)
    reload()
  }

  return (
    <main className="screen">
      <header className="topbar">
        <button onClick={() => nav({ name: 'home' })}>Back</button>
        <h1 className="grow">Workouts</h1>
        <button className="primary" onClick={() => nav({ name: 'builder', workoutId: null })}>New workout</button>
      </header>

      {workouts?.length === 0 && (
        <div className="card empty">
          <p>No workouts yet.</p>
          <button className="primary" onClick={() => nav({ name: 'builder', workoutId: null })}>Create your first workout</button>
        </div>
      )}

      {!!workouts?.length && (
        <table className="table">
          <thead>
            <tr><th>Name</th><th className="num">Duration</th><th /></tr>
          </thead>
          <tbody>
            {workouts.map((w) => (
              <tr key={w.id}>
                <td>{w.name}</td>
                <td className="num">{formatDuration(workoutDurationS(w.blocks))}</td>
                <td className="actions">
                  <button className="primary" onClick={() => nav({ name: 'ride', mode: 'planned', workoutId: w.id })}>Start</button>
                  <button onClick={() => nav({ name: 'builder', workoutId: w.id })}>Edit</button>
                  <button onClick={() => duplicate(w)}>Duplicate</button>
                  <button className="danger" onClick={() => remove(w)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
