import { useEffect, useState } from 'react'
import '../components/ride.css'
import { api } from '../api'
import { devices } from '../devices'
import { createRideController, type RideController, type RideView } from '../engine'
import { DEFAULT_MAX_HR, type Block, type RideSummary, type Sample } from '../../../shared/types'
import type { Nav } from '../route'
import { formatDuration } from '../format'
import { DeviceDots } from '../components/DeviceDots'
import { RideChart } from '../components/RideChart'
import { RideReport } from '../components/RideReport'

const watts = (b: Block) => (b.type === 'steady' ? `${b.watts} W` : `${b.startWatts}→${b.endWatts} W`)
const dur = (s: number) => (s < 60 ? `${s} s` : formatDuration(s))
const num = (v: number | null) => (v == null ? '–' : String(Math.round(v)))

function blockInfo(v: RideView): string {
  if (!v.block) return v.mode === 'free' ? 'Free ride' : (v.workoutName ?? '')
  const { index, count, block, next } = v.block
  const parts = [`Block ${index + 1}/${count}`, `${block.type === 'steady' ? 'Steady' : 'Ramp'} ${watts(block)}`]
  if (next) parts.push(`next: ${dur(next.durationS)} @ ${watts(next)}`)
  return parts.join(' · ')
}

export function RideScreen({ nav, mode, workoutId }: { nav: Nav; mode: 'free' | 'planned'; workoutId: number | null }) {
  const [ctrl, setCtrl] = useState<RideController | null>(null)
  const [view, setView] = useState<RideView | null>(null)
  const [report, setReport] = useState<{ ride: RideSummary; samples: Sample[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, bump] = useState(0)
  const back = () => nav(mode === 'planned' ? { name: 'workouts' } : { name: 'home' })

  useEffect(() => devices.on('status', () => bump((n) => n + 1)), [])

  useEffect(() => {
    let c: RideController | null = null
    let unsub: (() => void) | null = null
    let cancelled = false
    async function load() {
      const maxHr = Number(await api.settings.get('maxHr')) || DEFAULT_MAX_HR
      const workout = mode === 'planned' && workoutId != null ? await api.workouts.get(workoutId) : null
      if (mode === 'planned' && !workout) throw new Error('Workout not found')
      if (cancelled) return
      c = createRideController({ devices, api, mode, workout, maxHr })
      setCtrl(c)
      setView(c.view())
      unsub = c.subscribe(setView)
    }
    load().catch((e) => setError(String(e)))
    return () => {
      cancelled = true
      unsub?.()
      c?.dispose()
    }
  }, [mode, workoutId])

  const finished = view?.state === 'finished'
  const rideId = view?.rideId ?? null
  useEffect(() => {
    if (!finished) return
    if (rideId == null) return back()
    api.rides.get(rideId).then((r) => (r ? setReport(r) : back())).catch((e) => setError(String(e)))
  }, [finished, rideId])

  useEffect(() => {
    if (!ctrl) return
    const onKey = (e: KeyboardEvent) => {
      const state = ctrl.view().state
      if (state === 'finished') return
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        ctrl.shift((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 50 : 10))
      } else if (e.key === ' ') {
        e.preventDefault()
        if (state === 'running' || state === 'autoPaused') ctrl.pause()
        else if (state === 'paused') ctrl.resume()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ctrl])

  if (error) {
    return (
      <main className="screen">
        <header className="topbar"><button onClick={back}>Back</button></header>
        <div className="card">{error}</div>
      </main>
    )
  }
  if (!ctrl || !view) return <main className="screen"><div className="muted">Loading…</div></main>

  if (finished) {
    if (!report) return <main className="screen"><div className="muted">Saving…</div></main>
    const discard = async () => {
      await ctrl.discard()
      nav({ name: 'home' })
    }
    return (
      <main className="screen">
        <header className="topbar"><h1>Ride summary</h1><DeviceDots /></header>
        <RideReport
          ride={report.ride}
          samples={report.samples}
          actions={<>
            <button className="primary" onClick={() => nav({ name: 'home' })}>Save</button>
            <button className="danger" onClick={discard}>Discard</button>
          </>}
        />
      </main>
    )
  }

  const { state, stats } = view
  const active = state === 'running' || state === 'paused' || state === 'autoPaused'
  const trainerOk = devices.status('trainer').status === 'connected'
  const planned = view.mode === 'planned'
  const end = () => ctrl.end().catch((e) => setError(String(e)))
  const leave = async () => {
    if (active) {
      if (!confirm('End ride?')) return
      await ctrl.end()
    }
    back()
  }

  return (
    <main className="screen ride">
      <header className="topbar ride-status">
        <button onClick={leave}>Back</button>
        <DeviceDots />
        <span className="ride-block">{blockInfo(view)}</span>
        {active && (
          <span className="ride-buttons">
            {state === 'paused'
              ? <button onClick={() => ctrl.resume()}>Resume</button>
              : <button onClick={() => ctrl.pause()}>Pause</button>}
            <button className="danger" onClick={end}>End</button>
          </span>
        )}
      </header>

      {state === 'ready' && (
        <div className="ride-banner">
          <button className="primary ride-start" disabled={!trainerOk} onClick={() => ctrl.start().catch((e) => setError(String(e)))}>
            Start
          </button>
          {!trainerOk && <span className="muted">Connect the trainer first (Devices)</span>}
        </div>
      )}
      {state === 'autoPaused' && <div className="ride-banner">Paused – start pedaling to resume</div>}
      {state === 'paused' && (
        <div className="ride-banner">
          Paused <button className="primary" onClick={() => ctrl.resume()}>Resume</button>
        </div>
      )}

      <div className="ride-tiles large">
        <div className="tile">
          <span className="tile-label">Power (3 s)</span>
          <span className="tile-value">{num(view.power3s)}<small> W</small></span>
        </div>
        <div className="tile target">
          <span className="tile-label">Target</span>
          <span className="tile-value">{num(view.target)}<small> W</small></span>
          {planned && view.offset !== 0 && view.planTarget != null && (
            <span className="tile-sub">plan {Math.round(view.planTarget)} {view.offset > 0 ? '+' : '−'} {Math.abs(view.offset)}</span>
          )}
        </div>
      </div>

      <div className="ride-tiles medium">
        <div className={`tile z${view.hrZone}`}>
          <span className="tile-label">Heart rate{view.hrZone ? ` · Z${view.hrZone}` : ''}</span>
          <span className="tile-value">{num(view.hr)}<small> bpm</small></span>
        </div>
        <div className="tile">
          <span className="tile-label">Cadence</span>
          <span className="tile-value">{num(view.cadence)}<small> rpm</small></span>
        </div>
        <div className="tile">
          <span className="tile-label">{planned ? 'Block left' : 'Time'}</span>
          <span className="tile-value">{planned ? (view.block ? formatDuration(view.block.remainingS) : '–') : formatDuration(view.elapsedS)}</span>
          {planned && view.totalRemainingS != null && <span className="tile-sub">total left {formatDuration(view.totalRemainingS)}</span>}
        </div>
      </div>

      <RideChart blocks={view.blocks} samples={view.samples} positionS={view.elapsedS} offset={view.offset} height={260} />

      <footer className="ride-footer">
        <span>Avg power <b>{num(stats.avgPower)} W</b></span>
        <span>Avg HR <b>{num(stats.avgHr)} bpm</b></span>
        <span><b>{num(stats.kj)}</b> kJ</span>
        <span>Elapsed <b>{formatDuration(view.elapsedS)}</b></span>
      </footer>
    </main>
  )
}
