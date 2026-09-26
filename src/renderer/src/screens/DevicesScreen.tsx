import { useEffect, useRef, useState } from 'react'
import { DEFAULT_MAX_HR, type BluetoothCandidate } from '../../../shared/types'
import { api } from '../api'
import { devices, type DeviceKind } from '../devices'
import { IconBluetooth, IconController, IconHeart, IconInfo, IconTrainer, IconX } from '../components/icons'
import { setFtp, useFtp } from '../ftp'
import type { Nav } from '../route'
import { FtpSuggestion } from './ProgressScreen'
import './devices.css'

const SLOTS = {
  trainer: {
    title: 'Trainer', Icon: IconTrainer, required: true, what: 'trainers', type: 'Trainer', pairTitle: 'Pair trainer',
    hint: 'Controls resistance in ERG mode. Start is disabled without it.',
    pick: 'Pick your trainer from the list.',
    tip: 'Not listed? Pedal once to wake the trainer and close other apps that might be connected to it.'
  },
  controller: {
    title: 'Zwift Ride controller', Icon: IconController, required: false, what: 'Zwift Ride controllers', type: 'Controller', pairTitle: 'Pair Zwift Ride controller',
    hint: 'Pair the left controller — it relays the right one. Without it, use ↑ ↓ on the keyboard.',
    pick: 'Pick the left controller from the list.',
    tip: 'Not listed? Press a button on the left controller to wake it, and close Zwift and Zwift Companion.'
  },
  hr: {
    title: 'Heart rate strap', Icon: IconHeart, required: false, what: 'heart rate straps', type: 'Heart Rate', pairTitle: 'Pair heart rate strap',
    hint: 'Without a strap the heart-rate tile stays empty.',
    pick: 'Pick your strap from the list.',
    tip: 'Not listed? Straps only advertise while they sense a heartbeat — wet the electrodes and put it on.'
  }
}
const KINDS = Object.keys(SLOTS) as DeviceKind[]

const ZONES = [50, 60, 70, 80, 90, 100]
const validHr = (t: string) => /^\d+$/.test(t) && +t >= 100 && +t <= 230
const validFtp = (t: string) => /^\d+$/.test(t) && +t >= 50 && +t <= 600

function FtpCard() {
  const ftp = useFtp()
  const [text, setText] = useState(String(ftp))
  const [estimate, setEstimate] = useState<number | null>()
  useEffect(() => setText(String(ftp)), [ftp])
  useEffect(() => {
    api.stats.overview().then((o) => setEstimate(o.ftpEstimate))
  }, [])
  const commit = () => {
    if (validFtp(text)) setFtp(+text)
    else setText(String(ftp))
  }
  const invalid = !validFtp(text)
  return (
    <section className="card zones-card">
      <div className="zones-left">
        <h2>FTP</h2>
        <p className="small muted">Workouts in % FTP use this value.</p>
        <label className="field" htmlFor="ftp">Functional threshold power</label>
        <div className="hr-input">
          <input
            id="ftp"
            inputMode="numeric"
            aria-invalid={invalid}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <span className="muted">W</span>
        </div>
        {invalid && <div className="error-text">Enter 50–600 W</div>}
      </div>
      <div className="ftp-right"><FtpSuggestion estimate={estimate} /></div>
    </section>
  )
}

export function DevicesScreen(_: { nav: Nav }) {
  const [, rerender] = useState(0)
  const [pairing, setPairing] = useState<DeviceKind | null>(null)
  const [picked, setPicked] = useState(false)
  const [slow, setSlow] = useState(false)
  const [candidates, setCandidates] = useState<BluetoothCandidate[]>([])
  const [errors, setErrors] = useState<Partial<Record<DeviceKind, string>>>({})
  const cancelled = useRef(false)
  const [maxHrText, setMaxHrText] = useState(String(DEFAULT_MAX_HR))
  const [maxHr, setMaxHr] = useState(DEFAULT_MAX_HR)

  useEffect(() => devices.on('status', () => rerender((n) => n + 1)), [])
  useEffect(() => {
    api.settings.get('maxHr').then((v) => {
      if (v && validHr(v)) {
        setMaxHr(+v)
        setMaxHrText(v)
      }
    })
  }, [])

  const dialogOpen = pairing !== null && !picked
  useEffect(() => {
    if (!dialogOpen) return
    setSlow(false)
    const t = setTimeout(() => setSlow(true), 10000)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel()
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [dialogOpen])

  const setError = (kind: DeviceKind, msg?: string) => setErrors((e) => ({ ...e, [kind]: msg }))

  // Must stay synchronous up to devices.pair(): Web Bluetooth needs the click's user gesture.
  const pair = (kind: DeviceKind) => {
    cancelled.current = false
    setError(kind)
    setPairing(kind)
    setPicked(false)
    setCandidates([])
    const off = api.bluetooth.onCandidates(setCandidates)
    devices
      .pair(kind)
      .catch((e) => cancelled.current || setError(kind, e instanceof Error ? e.message : String(e)))
      .finally(() => {
        off()
        setPairing(null)
        setCandidates([])
      })
  }

  const choose = (id: string) => {
    setPicked(true)
    devices.choose(id)
  }

  const cancel = () => {
    cancelled.current = true
    devices.choose('')
  }

  const forget = (kind: DeviceKind) => {
    setError(kind)
    devices.forget(kind).catch((e) => setError(kind, e instanceof Error ? e.message : String(e)))
  }

  const commitMaxHr = () => {
    if (validHr(maxHrText)) api.settings.set('maxHr', String(maxHr))
    else setMaxHrText(String(maxHr))
  }
  const hrInvalid = !validHr(maxHrText)

  const slot = pairing && SLOTS[pairing]

  return (
    <main className="page devices">
      <header>
        <h1>Devices</h1>
        <p className="sub">Paired devices reconnect automatically when PainCave starts.</p>
      </header>

      <div className="banner">
        <IconInfo />
        <div>
          <strong>Before you pair</strong>
          Close the Wahoo app, Zwift and Zwift Companion — the trainer and controllers accept only one app at a time.
          <br />
          Wake devices first: pedal once, press a button on the controller, or put the strap on.
        </div>
      </div>

      <section className="slot-grid">
        {KINDS.map((kind) => {
          const { title, Icon, required, hint } = SLOTS[kind]
          const s = devices.status(kind)
          const err = errors[kind]
          const firmware = !!err && /firmware|service/i.test(err)
          const busy = pairing === kind
          const state = busy
            ? { cls: 'searching', text: picked ? 'Connecting…' : 'Searching…', spin: true }
            : err
              ? { cls: 'failed', text: firmware ? 'Control service hidden' : 'Pairing failed' }
              : { cls: s.status, text: s.status === 'connected' ? 'Connected' : s.status === 'searching' ? 'Searching…' : 'Not paired', spin: s.status === 'searching' }
          return (
            <div key={kind} className="card slot">
              <div className="slot-top">
                <span className="well-icon"><Icon /></span>
                <span className="badge">{required ? 'Required' : 'Optional'}</span>
              </div>
              <h3>{title}</h3>
              <div className={s.name ? 'dev-name' : 'dev-name muted'}>{s.name ?? 'No device paired'}</div>
              <div className={`state ${state.cls}`}>
                {state.spin ? <span className="spinner" /> : <span className={`dot ${state.cls}`} />}
                {state.text}
              </div>
              <p className={`slot-hint${err && !firmware ? ' err' : ''}`}>
                {firmware ? 'Firmware newer than 1.2.0 is the likely cause.' : err || hint}
              </p>
              <div className="actions">
                {busy ? (
                  <button disabled={picked} onClick={cancel}>Cancel</button>
                ) : s.status === 'none' ? (
                  <button className="primary" disabled={pairing !== null} onClick={() => pair(kind)}>Pair</button>
                ) : (
                  <>
                    <button disabled={pairing !== null} onClick={() => pair(kind)}>Pair</button>
                    <button className="danger" disabled={pairing !== null} onClick={() => forget(kind)}>Forget</button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </section>

      <section className="card zones-card">
        <div className="zones-left">
          <h2>Heart rate zones</h2>
          <p className="small muted">Zones are a percentage of your max heart rate.</p>
          <label className="field" htmlFor="max-hr">Max heart rate</label>
          <div className="hr-input">
            <input
              id="max-hr"
              inputMode="numeric"
              aria-invalid={hrInvalid}
              value={maxHrText}
              onChange={(e) => {
                setMaxHrText(e.target.value)
                if (validHr(e.target.value)) setMaxHr(+e.target.value)
              }}
              onBlur={commitMaxHr}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            <span className="muted">bpm</span>
          </div>
          {hrInvalid && <div className="error-text">Enter 100–230 bpm</div>}
        </div>
        <div className="zone-grid">
          {ZONES.slice(0, -1).map((lo, i) => (
            <div key={lo} className="zone-col">
              <span className="bar" style={{ background: `var(--z${i + 1})` }} />
              <div><b>Z{i + 1}</b><span className="small muted">{lo}–{ZONES[i + 1]} %</span></div>
              <div className="tnum">
                {Math.round((maxHr * lo) / 100)}–{Math.round((maxHr * ZONES[i + 1]) / 100)}
                <span className="muted"> bpm</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <FtpCard />

      {dialogOpen && slot && (
        <div className="backdrop">
          <div className="dialog pair-dialog" role="dialog" aria-modal="true" aria-labelledby="pair-title">
            <div className="pd-head">
              <span className="well-icon accent"><slot.Icon /></span>
              <div className="grow">
                <h2 id="pair-title">{slot.pairTitle}</h2>
                <div className="small muted">{slot.pick}</div>
              </div>
              <button className="ghost icon" aria-label="Close" onClick={cancel}><IconX /></button>
            </div>
            <div className="pd-search">
              <span className="spinner accent" />
              <span className="grow">Searching for {slot.what}…</span>
              <span className="small muted">{candidates.length} found</span>
            </div>
            <div className="pd-list">
              {candidates.map((c) => (
                <div key={c.id} className="cand">
                  <IconBluetooth />
                  <div className="grow">
                    <div className="cname">{c.name || 'Unnamed device'}</div>
                    <div className="small muted">{slot.type}</div>
                  </div>
                  <button className="sm" onClick={() => choose(c.id)}>Connect</button>
                </div>
              ))}
              <div className={`tip${slow && !candidates.length ? ' prominent' : ''}`}>
                <IconInfo />
                {slot.tip}
              </div>
            </div>
            <div className="pd-foot">
              <button className="ghost" onClick={cancel}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
