import { useEffect, useRef, useState, type ReactNode } from 'react'
import '../components/ride.css'
import { api } from '../api'
import { devices, type DeviceKind } from '../devices'
import { createRideController, hrZone, workoutDurationS, type ResolvedBlock, type RideController, type RideView } from '../engine'
import { DEFAULT_MAX_HR, LIMITS, type RideSummary, type Sample } from '../../../shared/types'
import { loadFtp } from '../ftp'
import type { Nav } from '../route'
import { formatDuration } from '../format'
import { DeviceDots } from '../components/DeviceDots'
import { RideChart } from '../components/RideChart'
import { ConfirmButton, IconCheck, RideReport } from '../components/RideReport'
import { TopBar } from '../components/TopBar'
import { IconAlert, IconPause, IconPlay, IconStop } from '../components/icons'
import { beep } from '../components/beep'

const NONE = '—'
const watts = (b: ResolvedBlock) => (b.type === 'steady' ? `${b.watts} W` : `${b.startWatts}→${b.endWatts} W`)
const title = (b: ResolvedBlock) => (b.type === 'ramp' ? 'Ramp' : b.label ?? 'Steady')
const num = (v: number | null | undefined) => (v == null ? NONE : String(Math.round(v)))
const signed = (w: number) => `${w < 0 ? '−' : '+'} ${Math.abs(w)}`
const SHIFT_HINT = 'Shift right ±10 W · left ±50 W'
const COUNTDOWN_S = 5
const clampW = (w: number) => Math.min(LIMITS.maxWatts, Math.max(LIMITS.minWatts, w))
const startWatts = (b: ResolvedBlock) => (b.type === 'steady' ? b.watts : b.startWatts)

function Value({ v, unit }: { v: string; unit?: string }) {
  return (
    <div className="tile-value">
      <span>
        <span className={`num v${v === NONE ? ' none' : ''}`}>{v}</span>
        {unit && <span className="unit">{unit}</span>}
      </span>
    </div>
  )
}

function Tile({ label, right, className = '', children }: { label: string; right?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={`tile rtile ${className}`}>
      <div className="tile-top"><span className="tile-label">{label}</span>{right}</div>
      {children}
    </div>
  )
}

function Centre({ view }: { view: RideView }) {
  const planned = view.mode === 'planned'
  if (view.state === 'ready') {
    const n = view.blocks?.length ?? 0
    return (
      <>
        <strong className="rb-title">{view.workoutName ?? 'Free ride'}</strong>
        <span className="rb-sub">
          {planned ? `${formatDuration(workoutDurationS(view.blocks ?? []))} · ${n} block${n === 1 ? '' : 's'}` : SHIFT_HINT}
        </span>
      </>
    )
  }
  if (!planned || !view.block) return <><span className="rb-chip">Free ride</span><span className="rb-sub">{SHIFT_HINT}</span></>
  const { index, count, block, next } = view.block
  return (
    <>
      <span className="rb-chip">Block {index + 1}/{count}</span>
      <strong className="rb-title">{title(block)} {watts(block)}</strong>
      {next && (
        <>
          <span className="rb-div" />
          <span className="rb-sub">next <b>{next.type === 'steady' && next.label ? `${next.label} · ` : ''}{formatDuration(next.durationS)} @ {watts(next)}</b></span>
        </>
      )}
    </>
  )
}

export function RideScreen({ nav, mode, workoutId }: { nav: Nav; mode: 'free' | 'planned'; workoutId: number | null }) {
  const [ctrl, setCtrl] = useState<RideController | null>(null)
  const [view, setView] = useState<RideView | null>(null)
  const [maxHr, setMaxHr] = useState(DEFAULT_MAX_HR)
  const [report, setReport] = useState<{ ride: RideSummary; samples: Sample[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [, bump] = useState(0)
  const back = () => nav(mode === 'planned' ? { name: 'workouts' } : { name: 'home' })

  useEffect(() => devices.on('status', () => bump((n) => n + 1)), [])

  useEffect(() => {
    let c: RideController | null = null
    let unsub: (() => void) | null = null
    let cancelled = false
    async function load() {
      const hrMax = Number(await api.settings.get('maxHr')) || DEFAULT_MAX_HR
      const ftp = await loadFtp()
      const workout = mode === 'planned' && workoutId != null ? await api.workouts.get(workoutId) : null
      if (mode === 'planned' && !workout) throw new Error('Workout not found')
      if (cancelled) return
      c = createRideController({ devices, api, mode, workout, maxHr: hrMax, ftp })
      setMaxHr(hrMax)
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

  // Keep the display awake while riding (laptop would dim/lock without input)
  const riding = view != null && view.state !== 'ready' && view.state !== 'finished'
  useEffect(() => {
    if (!riding) return
    let lock: WakeLockSentinel | null = null
    const take = () => navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch((e) => console.warn('wake lock', e))
    const onVisible = () => document.visibilityState === 'visible' && take()
    take()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [riding])

  // Block-change cue: short beeps 3-2-1 before the next block, a high beep when it starts
  const cue = useRef({ key: '', index: -1 })
  useEffect(() => {
    const b = view?.state === 'running' ? view.block : null
    if (!b) return
    if (cue.current.index !== -1 && b.index !== cue.current.index) beep(1320, 260)
    cue.current.index = b.index
    const key = `${b.index}:${b.remainingS}`
    if (b.next && b.remainingS <= 3 && cue.current.key !== key) beep(880, 120)
    cue.current.key = key
  }, [view])

  // last known values, shown dimmed while a device reconnects mid-ride
  const last = useRef<{ power: number | null; cadence: number | null; hr: number | null }>({ power: null, cadence: null, hr: null })

  if (error) {
    return (
      <main className="page">
        <p className="error-text">{error}</p>
        <div><button onClick={back}>Back</button></div>
      </main>
    )
  }
  if (!ctrl || !view) return <main className="page" />

  if (finished) {
    const discard = async () => {
      await ctrl.discard()
      nav({ name: 'home' })
    }
    return (
      <>
        <TopBar route={{ name: 'ride', mode: 'free' }} nav={nav} tabs={false} />
        {report
          ? (
              <RideReport
                ride={report.ride}
                samples={report.samples}
                eyebrow={<span className="label report-eyebrow">Ride summary</span>}
                summary
                actions={<>
                  <ConfirmButton label="Discard" question="Discard this ride?" confirmLabel="Discard" onConfirm={discard} />
                  <button className="primary lg save-ride" onClick={() => nav({ name: 'home' })}><IconCheck />Save ride</button>
                </>}
              />
            )
          : <main className="page" />}
      </>
    )
  }

  const { state, stats } = view
  const active = state !== 'ready'
  const pausedState = state === 'paused' || state === 'autoPaused'
  const planned = view.mode === 'planned'
  const trainerOk = devices.status('trainer').status === 'connected'
  const start = () => ctrl.start().catch((e) => setError(String(e)))
  const end = () => ctrl.end().catch((e) => setError(String(e)))

  // connection lost mid-ride: keep the last value, dimmed, with a note
  const lost = (k: DeviceKind) => active && devices.status(k).status === 'searching'
  const note = <span className="reconnecting">Reconnecting…</span>
  if (view.power3s != null) last.current.power = view.power3s
  if (view.cadence != null) last.current.cadence = view.cadence
  if (view.hr != null) last.current.hr = view.hr
  const trainerLost = lost('trainer')
  const hrLost = lost('hr')
  const power = trainerLost ? last.current.power : view.power3s
  const cadence = trainerLost ? last.current.cadence : view.cadence
  const hr = hrLost ? last.current.hr : view.hr
  const zone = hr == null ? 0 : Math.max(1, hrZone(hr, maxHr)) // below 50 % renders as Z1
  const dim = pausedState ? ' dim' : ''

  const latest = view.samples[view.samples.length - 1]
  const speed = trainerLost || !latest ? null : latest.speed
  const distanceKm = view.samples.reduce((d, s) => d + (s.speed ?? 0) / 3600, 0)
  const next = state === 'running' && view.block?.next && view.block.remainingS <= COUNTDOWN_S ? view.block : null

  const progress = view.block ? (1 - view.block.remainingS / view.block.block.durationS) * 100 : 0
  const pausedBadge = pausedState ? <span className="badge">Paused</span> : null

  return (
    <main className="ride">
      <header className="ride-bar">
        <DeviceDots className="ride-dots" />
        <div className="ride-centre"><Centre view={view} /></div>
        <div className="ride-actions">
          {state === 'ready' && (
            <>
              <button className="ghost lg" onClick={back}>Back</button>
              <button className="primary lg" disabled={!trainerOk} onClick={start}><IconPlay />Start</button>
            </>
          )}
          {active && confirmEnd && (
            <>
              <button className="ghost lg" onClick={() => setConfirmEnd(false)}>Cancel</button>
              <button className="danger-solid lg" onClick={end}><IconStop />End ride</button>
            </>
          )}
          {active && !confirmEnd && (
            <>
              {pausedState
                ? <button className="primary lg" onClick={() => ctrl.resume()}><IconPlay />Resume</button>
                : <button className="lg" onClick={() => ctrl.pause()}><IconPause />Pause</button>}
              <button className="danger lg" onClick={() => setConfirmEnd(true)}><IconStop />End</button>
            </>
          )}
        </div>
      </header>

      <div className="ride-body">
        {pausedState && (
          <div className="paused-banner">
            <span className="pb-icon"><IconPause /></span>
            <div className="pb-text">
              <strong>{state === 'autoPaused' ? 'Paused – start pedaling to resume' : 'Paused'}</strong>
              <span>
                {state === 'autoPaused' ? 'Auto-paused after 3 s without cadence' : 'Press Resume or Space to continue'}
                {' · clock stopped · trainer at minimum'}
              </span>
            </div>
            {state === 'autoPaused' && <button className="primary lg" onClick={() => ctrl.resume()}><IconPlay />Resume</button>}
          </div>
        )}

        <div className="ride-row big">
          <Tile label="Power · 3 s" right={trainerLost && note} className={dim || (trainerLost ? ' dim' : '')}>
            <Value v={state === 'ready' ? NONE : num(power)} unit="W" />
          </Tile>
          <Tile label="Target" right={<span className="erg">ERG</span>} className={`target${dim}${next ? ' soon' : ''}`}>
            <Value v={num(view.target)} unit="W" />
            <div className="tile-bottom">
              {planned
                ? (
                    <span className="plan-line">
                      plan {num(view.planTarget)}
                      <span className={`offset-chip${view.offset ? '' : ' zero'}`}>{signed(view.offset)}</span>
                    </span>
                  )
                : <span className="small muted">ERG · {LIMITS.minWatts}–{LIMITS.maxWatts} W</span>}
              {next
                ? <span className="next-up">next {clampW(startWatts(next.next!) + view.offset)} W in {next.remainingS}</span>
                : <span className="small muted">Shift to adjust</span>}
            </div>
          </Tile>
        </div>

        <div className="ride-row mid">
          <Tile
            label="Heart rate"
            right={hrLost ? note : zone > 0 && <span className="zone-chip">Z{zone} · {Math.round((hr! * 100) / maxHr)} %</span>}
            className={`hr-tile${zone ? ` zone z${zone}` : ''}${hrLost ? ' dim' : ''}`}
          >
            <Value v={num(hr)} unit="bpm" />
            {zone > 0 && (
              <div className="zone-scale">
                {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i === zone ? 'on' : i < zone ? 'below' : ''} />)}
              </div>
            )}
          </Tile>
          <div className={`tile rtile trio${dim || (trainerLost ? ' dim' : '')}`}>
            {([
              ['Cadence', num(cadence), 'rpm'],
              ['Speed', speed == null ? NONE : speed.toFixed(1), 'km/h'],
              ['Distance', active ? distanceKm.toFixed(distanceKm < 10 ? 2 : 1) : NONE, 'km']
            ] as const).map(([label, v, unit], i) => (
              <div key={label} className="trio-item">
                <div className="tile-top"><span className="tile-label">{label}</span>{i === 0 && trainerLost && note}</div>
                <Value v={v} unit={unit} />
              </div>
            ))}
          </div>
          {planned
            ? (
                <Tile label="Block left" right={pausedBadge}>
                  <div className="bl-row">
                    <Value v={view.block ? formatDuration(view.block.remainingS) : NONE} />
                    <span className="total-left">
                      <span className="label">Total left</span>
                      <span className="num">{formatDuration(view.totalRemainingS ?? 0)}</span>
                    </span>
                  </div>
                  <div className="progress"><i style={{ width: `${progress}%` }} /></div>
                </Tile>
              )
            : (
                <Tile label="Elapsed" right={pausedBadge}>
                  <Value v={formatDuration(view.elapsedS)} />
                </Tile>
              )}
        </div>

        <section className="card chart-card">
          <RideChart
            blocks={view.blocks}
            samples={view.samples}
            positionS={view.elapsedS}
            offset={view.offset}
            paused={pausedState}
            height="fill"
          />
          {state === 'ready' && (
            <div className="start-overlay">
              <div className="start-card">
                {trainerOk
                  ? (
                      <>
                        <h3>Ready when you are</h3>
                        <p>Recording starts when you press Start. The trainer will hold {view.target} W.</p>
                      </>
                    )
                  : (
                      <>
                        <span className="warn-well"><IconAlert /></span>
                        <h3>Trainer not connected</h3>
                        <p>Pedal once to wake the KICKR — it reconnects by itself. Start unlocks as soon as it’s back.</p>
                      </>
                    )}
                <button className="primary xl start-btn" disabled={!trainerOk} onClick={start}><IconPlay />Start</button>
                {!trainerOk && <button className="link" onClick={() => nav({ name: 'settings' })}>Open Settings</button>}
              </div>
            </div>
          )}
        </section>

        <footer className="ride-foot">
          {([
            ['Avg power', view.samples.length ? num(stats.avgPower) : NONE, 'W'],
            ['Avg HR', num(stats.avgHr), 'bpm'],
            ['Energy', num(stats.kj), 'kJ'],
            ['Elapsed', formatDuration(view.elapsedS), '']
          ] as const).map(([label, v, unit]) => (
            <span key={label} className="foot-item">
              <span className="label">{label}</span>
              <span><span className="num">{v}</span>{unit && v !== NONE && <span className="unit">{unit}</span>}</span>
            </span>
          ))}
        </footer>
      </div>
    </main>
  )
}
