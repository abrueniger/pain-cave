import { useEffect, useRef, useState } from 'react'
import { DEFAULT_MAX_HR, type BluetoothCandidate } from '../../../shared/types'
import { api } from '../api'
import { devices, type DeviceKind } from '../devices'
import type { Nav } from '../route'
import './screens.css'

const SLOTS: { kind: DeviceKind; label: string }[] = [
  { kind: 'trainer', label: 'Trainer' },
  { kind: 'controller', label: 'Ride controller' },
  { kind: 'hr', label: 'Heart rate strap' }
]

const ZONES = [50, 60, 70, 80, 90, 100]

export function DevicesScreen({ nav }: { nav: Nav }) {
  const [, rerender] = useState(0)
  const [pairing, setPairing] = useState<DeviceKind | null>(null)
  const [candidates, setCandidates] = useState<BluetoothCandidate[]>([])
  const [errors, setErrors] = useState<Partial<Record<DeviceKind, string>>>({})
  const cancelled = useRef(false)
  const [maxHrText, setMaxHrText] = useState(String(DEFAULT_MAX_HR))
  const [maxHr, setMaxHr] = useState(DEFAULT_MAX_HR)

  useEffect(() => devices.on('status', () => rerender((n) => n + 1)), [])
  useEffect(() => {
    api.settings.get('maxHr').then((v) => {
      const n = Number(v)
      if (v && n > 0) {
        setMaxHr(n)
        setMaxHrText(v)
      }
    })
  }, [])

  const setError = (kind: DeviceKind, msg?: string) => setErrors((e) => ({ ...e, [kind]: msg }))

  // Must stay synchronous up to devices.pair(): Web Bluetooth needs the click's user gesture.
  const pair = (kind: DeviceKind) => {
    cancelled.current = false
    setError(kind)
    setPairing(kind)
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

  const cancel = () => {
    cancelled.current = true
    devices.choose('')
  }

  const forget = (kind: DeviceKind) => {
    setError(kind)
    devices.forget(kind).catch((e) => setError(kind, e instanceof Error ? e.message : String(e)))
  }

  const changeMaxHr = (text: string) => {
    setMaxHrText(text)
    const n = Number(text)
    if (/^\d+$/.test(text) && n >= 100 && n <= 230) {
      setMaxHr(n)
      api.settings.set('maxHr', String(n))
    }
  }
  const maxHrValid = Number(maxHrText) === maxHr

  return (
    <main className="screen">
      <header className="topbar">
        <button onClick={() => nav({ name: 'home' })}>Back</button>
        <h1 className="grow">Devices</h1>
      </header>

      <p className="hint">
        Close the Wahoo app, Zwift and Zwift Companion – the trainer and controllers accept only one app at a time.
        <br />
        Wake devices first: pedal once / press a button.
      </p>

      <section className="slots">
        {SLOTS.map(({ kind, label }) => {
          const s = devices.status(kind)
          return (
            <div key={kind} className="card slot">
              <div className="slot-row">
                <span className={`dot dot-${s.status}`} />
                <div className="grow">
                  <div>{label}</div>
                  <div className="muted">{s.name ?? (s.status === 'searching' ? 'Searching…' : 'Not paired')}</div>
                </div>
                <button className="primary" disabled={pairing !== null} onClick={() => pair(kind)}>
                  {pairing === kind ? 'Pairing…' : 'Pair'}
                </button>
                <button disabled={pairing !== null} onClick={() => forget(kind)}>
                  Forget
                </button>
              </div>
              {errors[kind] && <div className="error">{errors[kind]}</div>}
              {pairing === kind && (
                <div className="candidates">
                  {candidates.length === 0 && <div className="muted">Looking for devices…</div>}
                  {candidates.map((c) => (
                    <button key={c.id} onClick={() => devices.choose(c.id)}>
                      {c.name || c.id}
                    </button>
                  ))}
                  <button onClick={cancel}>Cancel</button>
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section className="card settings">
        <h2>Settings</h2>
        <label className="field">
          Max heart rate
          <input
            type="number"
            min={100}
            max={230}
            className={maxHrValid ? '' : 'invalid'}
            value={maxHrText}
            onChange={(e) => changeMaxHr(e.target.value)}
          />
          bpm
        </label>
        <div className="zones">
          {ZONES.slice(0, -1).map((lo, i) => (
            <span key={lo} className="zone" style={{ background: `var(--z${i + 1}-bg)`, color: `var(--z${i + 1}-fg)` }}>
              Z{i + 1} {lo}–{ZONES[i + 1]} % · {Math.round((maxHr * lo) / 100)}–{Math.round((maxHr * ZONES[i + 1]) / 100)} bpm
            </span>
          ))}
        </div>
      </section>
    </main>
  )
}
