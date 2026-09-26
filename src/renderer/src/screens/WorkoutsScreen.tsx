import { useEffect, useState } from 'react'
import type { Workout, WorkoutCategory } from '../../../shared/types'
import { api } from '../api'
import { IconAlert, IconCopy, IconEdit, IconInfo, IconPlay, IconPlus, IconTrash, IconX } from '../components/icons'
import { ProfileThumb } from '../components/ProfileThumb'
import type { Nav } from '../route'
import { workoutMeta } from './builder'
import './workouts.css'

const CATEGORIES: WorkoutCategory[] = ['Recovery', 'Endurance', 'Tempo', 'Sweet spot', 'Threshold', 'VO2max', 'Anaerobic', 'Test']
type Filter = 'all' | 'mine' | WorkoutCategory
type ImportResult = { imported: number; errors: { file: string; message: string }[] }

export function WorkoutsScreen({ nav }: { nav: Nav }) {
  const [workouts, setWorkouts] = useState<Workout[] | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [result, setResult] = useState<ImportResult | null>(null)
  const reload = () => api.workouts.list().then(setWorkouts)
  useEffect(() => {
    reload()
  }, [])

  const duplicate = async (w: Workout) => {
    await api.workouts.save({ name: `${w.name} copy`, unit: w.unit, category: w.category, blocks: w.blocks })
    reload()
  }

  const remove = async (id: number) => {
    await api.workouts.delete(id)
    setConfirmId(null)
    reload()
  }

  const importZwo = async () => {
    try {
      const r = await api.workouts.importZwo()
      setResult(r.imported.length || r.errors.length ? { imported: r.imported.length, errors: r.errors } : null)
      if (r.imported.length) setFilter('all')
    } catch (e) {
      setResult({ imported: 0, errors: [{ file: 'Import', message: e instanceof Error ? e.message : String(e) }] })
    }
    reload()
  }

  const create = () => nav({ name: 'builder', workoutId: null })
  const all = workouts ?? []
  const n = all.length
  const groupOf = (w: Workout): Filter => w.category ?? 'mine'
  const chips = (['mine', ...CATEGORIES] as Filter[])
    .map((f) => [f, all.filter((w) => groupOf(w) === f).length] as const)
    .filter(([, c]) => c)
  const active = chips.some(([f]) => f === filter) ? filter : 'all'
  const shown = active === 'all' ? all : all.filter((w) => groupOf(w) === active)

  return (
    <main className="page">
      <header className="wo-head">
        <div>
          <h1>Workouts</h1>
          {workouts && <div className="wo-sub">{n ? `${n} saved workout${n === 1 ? '' : 's'}` : 'No saved workouts'}</div>}
        </div>
        <div className="wo-head-actions">
          <button className="lg" onClick={importZwo}>Import .zwo</button>
          <button className="primary lg" onClick={create}><IconPlus />New workout</button>
        </div>
      </header>

      {result && (
        <div className={`banner wo-banner${result.errors.length ? ' bad' : ''}`} role="status">
          {result.errors.length ? <IconAlert /> : <IconInfo />}
          <div className="wo-banner-text">
            <strong>
              {result.imported ? `Imported ${result.imported} workout${result.imported === 1 ? '' : 's'}` : 'Nothing imported'}
              {!!result.errors.length && ` · ${result.errors.length} file${result.errors.length === 1 ? '' : 's'} failed`}
            </strong>
            {result.errors.map((e, i) => <div key={i}>{e.file}: {e.message}</div>)}
          </div>
          <button className="ghost icon sm" aria-label="Dismiss" onClick={() => setResult(null)}><IconX /></button>
        </div>
      )}

      {workouts?.length === 0 && (
        <div className="wo-empty">
          <svg width="160" height="64" viewBox="0 0 160 64" aria-hidden="true">
            <path d="M2 62V44h36V28h40V12h22v16h18l40 18v16z" fill="var(--accent-soft)" stroke="var(--accent-line)" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <h2>No workouts yet</h2>
          <p>Build one from steady blocks, ramps and intervals — or import .zwo files. It shows up here, ready to start.</p>
          <button className="primary lg" onClick={create}><IconPlus />New workout</button>
          <button className="link" onClick={() => nav({ name: 'ride', mode: 'free' })}>Or start a free ride</button>
        </div>
      )}

      {chips.length > 1 && (
        <div className="wo-chips" role="group" aria-label="Filter by category">
          {[['all', n] as const, ...chips].map(([f, c]) => (
            <button key={f} className="wo-chip" aria-pressed={active === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'mine' ? 'My workouts' : f}<span>{c}</span>
            </button>
          ))}
        </div>
      )}

      {!!n && (
        <ul className="card wo-list">
          {shown.map((w) => (
            <li key={w.id} className={confirmId === w.id ? 'confirm' : undefined}>
              <ProfileThumb blocks={w.blocks} unit={w.unit} />
              <div className="wo-info">
                <div className="wo-title">
                  <span className="wo-name">{w.name}</span>
                  {w.category && <span className="badge">{w.category}</span>}
                </div>
                <div className="wo-meta">{workoutMeta(w.blocks, w.unit)}</div>
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
