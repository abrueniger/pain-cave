// "Earned in this ride" strip (docs/design-gamification.md 4.4 / 4.5).
import type { MilestoneFamily, RideGains, SpecialId, Unlock } from '../../../shared/types'
import { Badge, type BadgeFamily } from './Badge'
import { LevelEmblem } from './LevelEmblem'
import { XpBar } from './XpBar'
import './ride.css'

export const n0 = (n: number) => Math.round(n).toLocaleString('en-US')

const FAMILY: Record<MilestoneFamily, string> = { distance: 'Distance', time: 'Time', rides: 'Rides', pain: 'Pain' }
const UNIT: Record<MilestoneFamily, string> = { distance: 'km', time: 'h', rides: 'rides', pain: 'min' }
const TIER = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Violet']
const SPECIAL: Record<SpecialId, [string, string]> = {
  firstRide: ['First ride', 'Your first saved ride'],
  firstPlanned: ['First planned workout', 'Finished a ride from a workout'],
  asPlanned: ['As planned', 'Never below the plan'],
  harderThanPlanned: ['Harder than planned', '+10 W for 10 min, never below'],
  rampTest: ['Ramp test', 'Past 100 % FTP']
}
const secs = (s: number) => (s < 60 ? `${s} s` : `${s / 60} min`) // same as RideReport's bestLabel (import would be circular)
const total = (f: MilestoneFamily, v: number) => (f === 'time' && v < 100 ? v.toFixed(1) : n0(v))

interface Item { key: string; family: BadgeFamily; tier?: 1 | 2 | 3 | 4 | 5; name: string; sub: string }

const rank = (u: Unlock) => (u.kind === 'record' ? 0 : u.kind === 'milestone' ? 6 - u.tier : 9)

function toItem(u: Unlock, i: number): Item {
  if (u.kind === 'milestone')
    return { key: `m${i}`, family: u.family, tier: u.tier, name: `${n0(u.threshold)} ${UNIT[u.family]}`, sub: `${FAMILY[u.family]} · ${TIER[u.tier - 1]}` }
  if (u.kind === 'special') return { key: `s${i}`, family: 'special', name: SPECIAL[u.id][0], sub: SPECIAL[u.id][1] }
  const r = u.record
  return r.kind === 'best'
    ? { key: `r${i}`, family: 'record', name: `New best ${secs(r.durationS)}: ${r.watts} W`, sub: `+${r.watts - r.prevWatts} W over ${r.prevWatts} W` }
    : { key: `r${i}`, family: 'record', name: `FTP raised to ${r.watts} W`, sub: `from ${r.prevWatts} W` }
}

const ItemView = ({ it, locked, progress }: { it: Item; locked?: boolean; progress?: number }) => (
  <div className="earned-item">
    <Badge family={it.family} tier={it.tier} size={40} locked={locked} progress={progress} label={`${it.name}, ${it.sub}`} />
    <div><b>{it.name}</b><span>{it.sub}</span></div>
  </div>
)

/** level = post-ride summary (level block, next up, level-up); false = ride detail from History. */
export function EarnedStrip({ gains, level }: { gains: RideGains; level: boolean }) {
  const a = gains.after
  const up = level && a.level > gains.before.level
  const bar = <XpBar {...a} gainedXp={gains.xp} height={6} />
  const toNext = `${n0(a.nextLevelXp - a.xp)} XP to Level ${a.level + 1}`
  const items = [...gains.unlocked].sort((x, y) => rank(x) - rank(y)).map(toItem)
  const rest = items.slice(3)
  const next = level && !items.length ? gains.nextUp : null

  return (
    <section className={`earned${up ? ' up' : ''}`} aria-label="Earned in this ride">
      <div className="earned-xp"><span className="num">+{n0(gains.xp)}</span><span>XP</span></div>
      {level && (up ? (
        <>
          <div className="lvlup-panel">
            <LevelEmblem level={a.level} size={48} glow />
            <div>
              <div className="lvlup-title">Level {a.level}!</div>
              {a.title !== gains.before.title
                ? <div className="lvlup-sub accent">New title · {a.title}</div>
                : <div className="lvlup-sub">{a.title}</div>}
            </div>
          </div>
          <div className="earned-bar narrow">{bar}<span>{toNext}</span></div>
        </>
      ) : (
        <div className="earned-lvl">
          <LevelEmblem level={a.level} size={36} />
          <div className="earned-bar"><b>Level {a.level} · {a.title}</b>{bar}<span>{toNext}</span></div>
        </div>
      ))}
      <span className="earned-div" />
      {items.length ? (
        <>
          <span className="label">{level ? 'New' : 'Unlocked'}</span>
          <div className="earned-items">
            {items.slice(0, 3).map((it) => <ItemView key={it.key} it={it} />)}
            {rest.length > 0 && <span className="earned-more" title={rest.map((it) => it.name).join('\n')}>+{rest.length} more</span>}
          </div>
        </>
      ) : next ? (
        <>
          <span className="label">Next up</span>
          <ItemView
            it={{ key: 'next', family: next.family, tier: next.tier, name: `${n0(next.threshold)} ${UNIT[next.family]}`,
              sub: `${FAMILY[next.family]} · ${TIER[next.tier - 1]} · ${total(next.family, next.total)} / ${n0(next.threshold)} ${UNIT[next.family]}` }}
            locked progress={next.total / next.threshold}
          />
        </>
      ) : <span className="earned-none">Nothing unlocked</span>}
    </section>
  )
}
