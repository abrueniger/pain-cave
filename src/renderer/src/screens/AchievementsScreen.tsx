import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { Achievements, MilestoneFamily, MilestoneState, RecordEntry, SpecialId, SpecialState } from '../../../shared/types'
import { TITLES, xpFor } from '../../../shared/gamification'
import { api } from '../api'
import { Badge, TIER_PAINT } from '../components/Badge'
import { HEX_OUTER } from '../components/badgePaths'
import { LevelEmblem } from '../components/LevelEmblem'
import { XpBar } from '../components/XpBar'
import { IconChevronRight, IconInfo } from '../components/icons'
import { bestLabel, dayLabel } from '../components/RideReport'
import type { Nav } from '../route'
import './achievements.css'

const n0 = (v: number) => Math.round(v).toLocaleString('en-US')
const TIER_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Violet']
const TITLE_LEVELS = TITLES.map((_, i) => (i === 0 ? 1 : i * 5))

/** "26 Sep" (current year) or "26 Sep 2025"; always with year when `year` is set. */
const dateLabel = (iso: string, year = false) => {
  const d = new Date(iso)
  return year || d.getFullYear() !== new Date().getFullYear() ? `${dayLabel(d).slice(4)} ${d.getFullYear()}` : dayLabel(d).slice(4)
}

const FAMILY: Record<MilestoneFamily, { name: string; unit: string; note: string; total: (v: number) => string; th: (v: number) => string }> = {
  distance: { name: 'Distance', unit: 'km', note: 'Virtual distance from trainer speed', total: n0, th: (v) => `${n0(v)} km` },
  time: { name: 'Time on the trainer', unit: 'h', note: 'Moving time, pauses excluded', total: (v) => (v < 100 ? v.toFixed(1) : n0(v)), th: (v) => `${n0(v)} h` },
  rides: { name: 'Rides', unit: '', note: 'Saved rides of 5 min or more', total: n0, th: (v) => `${n0(v)} rides` },
  pain: { name: 'Pain', unit: 'min', note: 'Minutes in heart-rate zones 4 + 5', total: n0, th: (v) => `${n0(v)} min` }
}

const SPECIALS: Record<SpecialId, { name: string; hint: string }> = {
  firstRide: { name: 'First ride', hint: 'Save your first ride' },
  firstPlanned: { name: 'First planned workout', hint: 'Finish a ride from a workout' },
  asPlanned: { name: 'As planned', hint: 'Complete a workout without shifting below the plan' },
  harderThanPlanned: { name: 'Harder than planned', hint: 'Complete a workout at +10 W or more for 10 min, never below the plan' },
  rampTest: { name: 'Ramp test', hint: 'Ride the Ramp test past 100 % FTP' }
}

const recordText = (r: RecordEntry) => r.kind === 'best'
  ? { title: `New best ${bestLabel(r.durationS)}: ${r.watts} W`, sub: `+${r.watts - r.prevWatts} W over ${r.prevWatts} W` }
  : { title: `FTP raised to ${r.watts} W`, sub: `from ${r.prevWatts} W` }

/** A button when it leads to a ride, a plain div otherwise. */
function Row({ className, rideId, nav, children }: { className: string; rideId: number | null; nav: Nav; children: ReactNode }) {
  return rideId == null
    ? <div className={className}>{children}</div>
    : <button type="button" className={`${className} ach-link`} onClick={() => nav({ name: 'rideDetail', rideId })}>{children}</button>
}

export function AchievementsScreen({ nav }: { nav: Nav }) {
  const [a, setA] = useState<Achievements | null>(null)
  const [lastRideId, setLastRideId] = useState<number | null>(null)
  const [allRecords, setAllRecords] = useState(false)

  useEffect(() => {
    api.achievements.overview().then(setA)
    api.rides.list().then((rs) => setLastRideId(rs[0]?.id ?? null))
  }, [])

  if (!a) return <main className="page ach-page" />

  const unlockedMs = a.milestones.reduce((n, m) => n + m.tiers.filter((t) => t.unlockedAt).length, 0)
  const unlockedSp = a.specials.filter((s) => s.unlockedAt).length
  const records = allRecords ? a.records : a.records.slice(0, 7)

  return (
    <main className="page ach-page">
      <header>
        <h1>Achievements</h1>
        <p className="sub">Level {a.level} · {unlockedMs + unlockedSp} of 25 badges · {a.records.length} record{a.records.length === 1 ? '' : 's'}</p>
      </header>

      <LevelCard a={a} />

      <section className="card ach-ms">
        <header><h2>Milestones</h2><span className="meta">{unlockedMs} of 20 · totals over all saved rides</span></header>
        {a.milestones.map((m) => <MilestoneRow key={m.family} m={m} lastRideId={lastRideId} nav={nav} />)}
      </section>

      <div className="ach-grid">
        <section className="card ach-list ach-records">
          <header><h2>Records</h2><span className="meta">{a.records.length ? `${a.records.length} record${a.records.length === 1 ? '' : 's'} · newest first` : ''}</span></header>
          {a.records.length === 0 && <p className="ach-empty">Records start with your second ride — beat any 5 s, 1 min, 5 min or 20 min best.</p>}
          {records.map((r, i) => {
            const { title, sub } = recordText(r)
            return (
              <Row key={i} className="ach-row rec" rideId={r.kind === 'best' ? r.rideId : null} nav={nav}>
                <Badge family="record" size={32} label={r.kind === 'best' ? `Record, new best ${bestLabel(r.durationS)}, ${r.watts} W` : `Record, ${title}`} />
                <div className="grow"><b>{title}</b><span>{sub}</span></div>
                <span className="date">{dateLabel(r.date, true)}</span>
              </Row>
            )
          })}
          {!allRecords && a.records.length > 7 && (
            <footer><button type="button" className="link" onClick={() => setAllRecords(true)}>Show all {a.records.length}<IconChevronRight /></button></footer>
          )}
        </section>

        <section className="card ach-list ach-specials">
          <header><h2>Specials</h2><span className="meta">{unlockedSp} of 5</span></header>
          {a.specials.map((s) => <SpecialRow key={s.id} s={s} isNew={s.rideId != null && s.rideId === lastRideId} nav={nav} />)}
        </section>
      </div>
    </main>
  )
}

function LevelCard({ a }: { a: Achievements }) {
  const cur = Math.min(TITLES.length - 1, Math.floor(a.level / 5))
  const next = TITLE_LEVELS[cur + 1]
  const segFrac = next == null ? 0 : Math.min(1, (a.xp - xpFor(TITLE_LEVELS[cur])) / (xpFor(next) - xpFor(TITLE_LEVELS[cur])))
  const left = a.nextLevelXp - a.xp
  const first = a.level === 1

  return (
    <section className="card ach-level">
      <div className="lvl-pane">
        <div className="lvl-head">
          <LevelEmblem level={a.level} size={96} />
          <div>
            <div className="label">Level {a.level}</div>
            <div className="lvl-title">{a.title}</div>
            <div className="lvl-xp">{n0(a.xp)} XP total</div>
          </div>
        </div>
        <div className="lvl-progress">
          <div className="lvl-row">
            <span>{first ? 'Your first ride unlocks Level 2' : `${n0(left)} XP to Level ${a.level + 1} · about ${Math.round((left / 648) * 60)} min at 180 W`}</span>
            {!first && <span><span className="num">{n0(a.xp - a.levelStartXp)}</span><span className="muted"> / {n0(a.nextLevelXp - a.levelStartXp)}</span></span>}
          </div>
          <XpBar levelStartXp={a.levelStartXp} nextLevelXp={a.nextLevelXp} xp={a.xp} height={10} />
        </div>
        <p className="lvl-foot"><IconInfo />1 kJ of work = 1 XP. Every saved ride counts, nothing else does.</p>
      </div>

      <div className="lvl-titles">
        <header><h2>Titles</h2><span className="meta">A new title every 5 levels</span></header>
        <div className="track" style={{ '--fill': (cur + segFrac) / (TITLES.length - 1) } as CSSProperties}>
          <div className="track-line" />
          <div className="track-line fill" />
          {TITLES.map((t, i) => {
            const reached = i <= cur
            const here = i === cur
            const s = here ? 34 : 26
            return (
              <div key={t} className={`node${here ? ' here' : reached ? ' reached' : ''}`}>
                <div className="hex">
                  <svg viewBox="0 0 64 64" width={s} height={s} aria-hidden="true">
                    <path d={HEX_OUTER} fill={reached ? 'var(--accent)' : 'var(--surface)'} stroke={reached ? 'var(--accent-hi)' : 'var(--border-strong)'} strokeWidth={reached ? 3 : 4} />
                    {reached && !here && <path d="M22 33l7 7 13-15" fill="none" stroke="#fff" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />}
                    {here && <circle cx={32} cy={32} r={8} fill="#fff" />}
                  </svg>
                </div>
                <b>{t}</b>
                <span className="lv">{here ? `You · Level ${a.level}` : `Level ${TITLE_LEVELS[i]}`}</span>
                <span className="xp">{n0(xpFor(TITLE_LEVELS[i]))} XP</span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function MilestoneRow({ m, lastRideId, nav }: { m: MilestoneState; lastRideId: number | null; nav: Nav }) {
  const f = FAMILY[m.family]
  const nextIdx = m.tiers.findIndex((t) => !t.unlockedAt)
  return (
    <div className="ms-row">
      <div className="ms-head">
        <b>{f.name}</b>
        <div><span className="num">{f.total(m.total)}</span>{f.unit && <span className="unit">{f.unit}</span>}</div>
        <span className="note">{f.note}</span>
      </div>
      {m.tiers.map((t, i) => {
        const tier = (i + 1) as 1 | 2 | 3 | 4 | 5
        const th = f.th(t.threshold)
        const base = `${f.name}, ${TIER_NAMES[i]}`
        if (t.unlockedAt) {
          return (
            <Row key={i} className="ms-cell" rideId={t.rideId} nav={nav}>
              <Badge family={m.family} tier={tier} size={48} label={`${base}, ${th}, unlocked ${dateLabel(t.unlockedAt, true)}`} />
              <div className="ms-txt">
                <b>{th}</b>
                <span className="st">{dateLabel(t.unlockedAt)}{t.rideId != null && t.rideId === lastRideId && <span className="badge accent">New</span>}</span>
              </div>
            </Row>
          )
        }
        const next = i === nextIdx
        const p = next ? Math.min(1, m.total / t.threshold) : 0
        const of = `${f.total(m.total)} / ${m.family === 'rides' ? n0(t.threshold) : th}`
        return (
          <div key={i} className={`ms-cell${next ? ' next' : ' later'}`}>
            <Badge family={m.family} tier={tier} size={48} locked progress={p} label={`${base}, locked, ${next ? `${f.total(m.total)} of ${th}` : th}`} />
            <div className="ms-txt">
              <b>{th}</b>
              {next
                ? <><span className="of">{of}</span><span className="ms-bar"><i style={{ width: `${p * 100}%`, background: TIER_PAINT[i].base }} /></span></>
                : <span className="locked">Locked</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SpecialRow({ s, isNew, nav }: { s: SpecialState; isNew: boolean; nav: Nav }) {
  const sp = SPECIALS[s.id]
  const on = !!s.unlockedAt
  return (
    <Row className={`ach-row spec${on ? '' : ' off'}`} rideId={s.rideId} nav={nav}>
      <Badge family="special" size={40} locked={!on} label={`${sp.name}, ${on ? `unlocked ${dateLabel(s.unlockedAt!, true)}` : 'locked'}`} />
      <div className="grow"><b>{sp.name}{isNew && <span className="badge accent">New</span>}</b><span>{sp.hint}</span></div>
      <span className="date">{on ? dateLabel(s.unlockedAt!, true) : 'Locked'}</span>
    </Row>
  )
}
