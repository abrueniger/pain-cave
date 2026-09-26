import { useEffect, useState } from 'react'
import { BEST_DURATIONS, type Best, type StatsOverview, type WorkoutTrendPoint } from '../../../shared/types'
import { api } from '../api'
import { bestLabel, dayLabel } from '../components/RideReport'
import { setFtp, useFtp } from '../ftp'
import type { Nav } from '../route'
import './progress.css'

const localDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
/** "26 Sep" */
const shortDate = (d: Date) => dayLabel(d).slice(4)
/** 8100 -> "2:15" (h:mm) */
const hm = (s: number) => {
  const m = Math.round(s / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/** Suggestion to adopt the FTP estimate; shared with the Devices screen. */
export function FtpSuggestion({ estimate }: { estimate: number | null | undefined }) {
  const ftp = useFtp()
  if (estimate === undefined) return null
  if (estimate == null) return <p className="small muted ftp-why">No 20 min effort in the last 90 days — ride one hard to get an estimate.</p>
  return (
    <div className="ftp-suggest">
      <div>
        <span className="label">Estimate</span>
        <div><span className="num ftp-num">{estimate}</span><span className="unit">W</span></div>
        <p className="small muted ftp-why">95 % of your best 20 min in the last 90 days.</p>
      </div>
      {estimate !== ftp && <button className="primary" onClick={() => setFtp(estimate)}>Use {estimate} W</button>}
    </div>
  )
}

export function ProgressScreen({ nav }: { nav: Nav }) {
  const [o, setO] = useState<StatsOverview | null>(null)
  useEffect(() => {
    api.stats.overview().then(setO)
  }, [])

  return (
    <main className="page progress-page">
      <header>
        <h1>Progress</h1>
        {o && <p className="sub">{o.totals.rides} ride{o.totals.rides === 1 ? '' : 's'} · {hm(o.totals.durationS)} h · {Math.round(o.totals.kj)} kJ</p>}
      </header>
      {o && (o.totals.rides === 0
        ? (
            <div className="progress-empty">
              <svg viewBox="0 0 160 64" width={160} height={64} aria-hidden="true">
                <path d="M4 60h24V40h24V48h24V26h24V34h24V8h28" fill="none" stroke="var(--accent-line)" strokeWidth={3} strokeLinejoin="round" />
              </svg>
              <h2>No rides yet</h2>
              <p>Your weekly volume, heart-rate zones, best efforts and fitness trends show up here after your first ride.</p>
              <button className="primary lg" onClick={() => nav({ name: 'ride', mode: 'free' })}>Start free ride</button>
            </div>
          )
        : (
            <div className="progress-grid">
              <Volume weeks={o.weeks} />
              <FtpCard estimate={o.ftpEstimate} />
              <Zones weeks={o.weeks} />
              <Bests allTime={o.bestsAllTime} last90={o.bests90d} nav={nav} />
              <Trends trends={o.workoutTrends} />
            </div>
          ))}
    </main>
  )
}

function Volume({ weeks }: { weeks: StatsOverview['weeks'] }) {
  const [metric, setMetric] = useState<'time' | 'kj'>('time')
  const now = weeks[weeks.length - 1]
  const val = (w: (typeof weeks)[number]) => (metric === 'time' ? w.durationS : w.kj)
  const max = Math.max(1, ...weeks.map(val))
  return (
    <section className="card volume">
      <header>
        <h2>This week</h2>
        <div className="segmented" role="radiogroup" aria-label="Weekly volume metric">
          {(['time', 'kj'] as const).map((m) => (
            <button key={m} role="radio" aria-checked={metric === m} onClick={() => setMetric(m)}>{m === 'time' ? 'Duration' : 'Energy'}</button>
          ))}
        </div>
      </header>
      <div className="week-stats">
        <div><span className="label">Rides</span><span className="num">{now.rides}</span></div>
        <div><span className="label">Time</span><span><span className="num">{hm(now.durationS)}</span><span className="unit">h</span></span></div>
        <div><span className="label">Energy</span><span><span className="num">{Math.round(now.kj)}</span><span className="unit">kJ</span></span></div>
        <div><span className="label">Distance</span><span><span className="num">{now.distanceKm.toFixed(1)}</span><span className="unit">km</span></span></div>
      </div>
      <div className="bars" aria-label="Last 12 weeks">
        {weeks.map((w) => {
          const v = val(w)
          return (
            <div key={w.weekStart} className={w === now ? 'bar-col now' : 'bar-col'} title={`Week of ${shortDate(localDate(w.weekStart))}`}>
              <span className="bar-val">{v ? (metric === 'time' ? hm(v) : Math.round(v)) : ''}</span>
              <span className="bar" style={{ height: `${(v / max) * 100}%` }} />
              <span className="bar-x">{shortDate(localDate(w.weekStart))}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function FtpCard({ estimate }: { estimate: number | null }) {
  const ftp = useFtp()
  return (
    <section className="card ftp-card">
      <h2>FTP</h2>
      <div>
        <span className="label">Current</span>
        <div><span className="num ftp-num">{ftp}</span><span className="unit">W</span></div>
        <p className="small muted ftp-why">Workouts in % FTP use this value. Change it on the Devices screen.</p>
      </div>
      <FtpSuggestion estimate={estimate} />
    </section>
  )
}

function Zones({ weeks }: { weeks: StatsOverview['weeks'] }) {
  const zone = (w: (typeof weeks)[number]) => w.zoneS.slice(1)
  const totals = [1, 2, 3, 4, 5].map((z) => weeks.reduce((s, w) => s + w.zoneS[z], 0))
  const sum = totals.reduce((a, b) => a + b, 0)
  const max = Math.max(1, ...weeks.map((w) => zone(w).reduce((a, b) => a + b, 0)))
  return (
    <section className="card zones">
      <header><h2>Time in heart-rate zones</h2><span className="small muted">Last 12 weeks</span></header>
      {sum === 0
        ? <p className="muted empty-line">No heart-rate data yet. Pair a strap on the Devices screen.</p>
        : (
            <>
              <div className="bars stacked">
                {weeks.map((w) => (
                  <div key={w.weekStart} className="bar-col" title={`Week of ${shortDate(localDate(w.weekStart))}`}>
                    <span className="bar-stack">
                      {zone(w).map((s, i) => s > 0 && <i key={i} style={{ height: `${(s / max) * 100}%`, background: `var(--z${i + 1})` }} />)}
                    </span>
                    <span className="bar-x">{shortDate(localDate(w.weekStart))}</span>
                  </div>
                ))}
              </div>
              <div className="zone-totals">
                {totals.map((s, i) => (
                  <div key={i}>
                    <span className="zsw" style={{ background: `var(--z${i + 1})` }} />
                    <b>Z{i + 1}</b>
                    <span className="tnum">{Math.round(s / 60)}<span className="muted"> min</span></span>
                    <span className="small muted tnum">{Math.round((s / sum) * 100)} %</span>
                  </div>
                ))}
              </div>
            </>
          )}
    </section>
  )
}

function Bests({ allTime, last90, nav }: { allTime: Best[]; last90: Best[]; nav: Nav }) {
  const cell = (b: Best | undefined) =>
    b
      ? (
          <div className="best">
            <span><span className="num">{Math.round(b.watts)}</span><span className="unit">W</span></span>
            <button className="link small" onClick={() => nav({ name: 'rideDetail', rideId: b.rideId })}>{shortDate(new Date(b.date))} {new Date(b.date).getFullYear()}</button>
          </div>
        )
      : <span className="num muted">—</span>
  return (
    <section className="card bests">
      <h2>Best efforts</h2>
      <div className="best-grid">
        <span /><span className="label">All time</span><span className="label">Last 90 days</span>
        {BEST_DURATIONS.map((d) => (
          <div key={d} className="best-row">
            <b>{bestLabel(d)}</b>
            {cell(allTime.find((b) => b.durationS === d))}
            {cell(last90.find((b) => b.durationS === d))}
          </div>
        ))}
      </div>
    </section>
  )
}

/** HR change at the first ride's power, from first to last efficiency. */
function verdict(points: WorkoutTrendPoint[]): [string, boolean] {
  if (points.length < 2) return ['Not enough rides yet', false]
  const first = points[0]
  const last = points[points.length - 1]
  const delta = Math.round(first.avgPower / last.efficiency - first.avgHr)
  const since = shortDate(new Date(first.date))
  if (delta === 0) return [`Same heart rate at the same power since ${since}`, false]
  return [`${delta > 0 ? '+' : '−'}${Math.abs(delta)} bpm at the same power since ${since}`, delta < 0]
}

function Spark({ values, cls }: { values: number[]; cls: string }) {
  const lo = Math.min(...values)
  const span = Math.max(...values) - lo || 1
  const pts = values.map((v, i) => `${values.length > 1 ? (i / (values.length - 1)) * 100 : 50},${36 - ((v - lo) / span) * 32}`).join(' ')
  return <polyline className={cls} points={pts} vectorEffect="non-scaling-stroke" />
}

function Trends({ trends }: { trends: StatsOverview['workoutTrends'] }) {
  return (
    <section className="card trends">
      <header>
        <h2>Fitness per workout</h2>
        <span className="legend small"><span className="sw power" />Efficiency (W/bpm)<span className="sw hr" />Avg HR</span>
      </header>
      <p className="small muted">ERG holds the power fixed, so heart rate is the fitness signal: fewer beats for the same watts means you got fitter.</p>
      {trends.length === 0
        ? <p className="muted empty-line">Not enough rides yet — ride the same workout twice with a heart-rate strap.</p>
        : (
            <div className="trend-grid">
              {trends.map((t) => {
                const last = t.points[t.points.length - 1]
                const [text, fitter] = verdict(t.points)
                return (
                  <div key={t.workoutId} className="trend">
                    <div className="trend-head">
                      <span className="trend-name">{t.name}</span>
                      <span className="small muted tnum">{t.points.length} rides</span>
                    </div>
                    <div className="trend-plot">
                      <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
                        <Spark values={t.points.map((p) => p.efficiency)} cls="eff" />
                        <Spark values={t.points.map((p) => p.avgHr)} cls="hr" />
                      </svg>
                    </div>
                    <div className="trend-foot small">
                      <span className="tnum">{last.efficiency.toFixed(2)} W/bpm · {Math.round(last.avgHr)} bpm</span>
                      <span className={fitter ? 'verdict ok' : 'verdict'}>{text}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
    </section>
  )
}
