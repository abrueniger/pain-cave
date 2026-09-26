import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { resolveBlocks } from '../../../shared/blocks'
import type { Block, PowerUnit, WorkoutCategory } from '../../../shared/types'
import { api } from '../api'
import { IconAlert, IconChevronLeft, IconCopy, IconGrip, IconPlus, IconTrash } from '../components/icons'
import { RideChart } from '../components/RideChart'
import { workoutDurationS } from '../engine/plan'
import { formatDuration } from '../format'
import { useFtp } from '../ftp'
import { setLeaveGuard, type Nav, type Route } from '../route'
import {
  addIntervals, addRamp, addSteady, checkDuration, checkPower, checkRepeat, convertBlocks, dragShift, dropIndex, duplicateAt, gapTop, moveTo,
  newIntervals, newSteady, removeAt, setType, unitLabel, type Slot
} from './builder'
import './builder.css'

const line = (d: string) => () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
const IconCheck = line('M5 12.5l4.5 4.5L19 7')
const IconArrow = line('M5 12h14M13 6l6 6-6 6')

type FieldName = 'durationS' | 'watts' | 'startWatts' | 'endWatts' | 'repeat' | 'onS' | 'onWatts' | 'offS' | 'offWatts'
const FIELDS: Record<Block['type'], FieldName[]> = {
  steady: ['durationS', 'watts'],
  ramp: ['durationS', 'startWatts', 'endWatts'],
  intervals: ['repeat', 'onS', 'onWatts', 'offS', 'offWatts']
}
const LABEL: Record<FieldName, string> = {
  durationS: 'duration', watts: 'power', startWatts: 'start power', endWatts: 'end power',
  repeat: 'repeats', onS: 'on duration', onWatts: 'on power', offS: 'off duration', offWatts: 'off power'
}
const TYPES: [Block['type'], string][] = [['steady', 'Steady'], ['ramp', 'Ramp'], ['intervals', 'Intervals']]
const isDur = (f: FieldName) => f === 'durationS' || f === 'onS' || f === 'offS'
const check = (f: FieldName, unit: PowerUnit) => (text: string) =>
  isDur(f) ? checkDuration(text) : f === 'repeat' ? checkRepeat(text) : checkPower(text, unit)
const format = (b: Block, f: FieldName) => {
  const v = (b as Partial<Record<FieldName, number>>)[f] ?? 0
  return isDur(f) ? formatDuration(v) : String(v)
}

type Drag = { from: number; to: number; dy: number; copy: boolean; slots: Slot[] }

export function BuilderScreen({ nav, workoutId }: { nav: Nav; workoutId: number | null }) {
  const ftp = useFtp()
  const [id, setId] = useState(workoutId)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<PowerUnit>('watts')
  const [category, setCategory] = useState<WorkoutCategory | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  // Text being typed, keyed "index.field"; invalid text is kept here and never applied
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [leaving, setLeaving] = useState<Route | null>(null)
  useEffect(() => {
    setLeaveGuard(dirty ? (to) => (setLeaving(to), true) : null)
    return () => setLeaveGuard(null)
  }, [dirty])
  const listRef = useRef<HTMLDivElement>(null)
  const preview = useMemo(() => resolveBlocks(blocks, unit, ftp), [blocks, unit, ftp])

  useEffect(() => {
    if (workoutId === null) return
    api.workouts.get(workoutId).then((w) => {
      if (!w) return setError('Workout not found')
      setName(w.name)
      setUnit(w.unit)
      setCategory(w.category)
      setBlocks(w.blocks)
    })
  }, [workoutId])

  /** Structural edit: drops pending text (invalid input reverts to the last valid value). */
  const edit = (next: Block[]) => {
    setBlocks(next)
    setDrafts({})
    setDirty(true)
  }

  const switchUnit = (u: PowerUnit) => {
    if (u === unit) return
    edit(convertBlocks(blocks, unit, u, ftp))
    setUnit(u)
  }

  const type = (i: number, f: FieldName, text: string) => {
    const k = `${i}.${f}`
    setDrafts((d) => ({ ...d, [k]: text }))
    setDirty(true)
    const v = check(f, unit)(text)
    if (typeof v === 'number') setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, [f]: v } : b)))
  }
  const blur = (i: number, f: FieldName) => {
    const k = `${i}.${f}`
    if (k in drafts && typeof check(f, unit)(drafts[k]) === 'number') setDrafts(({ [k]: _, ...rest }) => rest)
  }
  const errorOf = (i: number, f: FieldName) => {
    const text = drafts[`${i}.${f}`]
    const v = text === undefined ? 0 : check(f, unit)(text)
    return typeof v === 'string' ? v : null
  }
  const rowErrors = blocks.map((b, i) => FIELDS[b.type].map((f) => [f, errorOf(i, f)] as const).find(([, e]) => e))
  const errorCount = blocks.reduce((n, b, i) => n + FIELDS[b.type].filter((f) => errorOf(i, f)).length, 0)

  // Pointer drag on the handle. Alt (⌥) or Ctrl while dropping copies instead of moving.
  const startDrag = (e: ReactPointerEvent, from: number) => {
    if (e.button !== 0) return
    e.preventDefault()
    const slots = [...listRef.current!.querySelectorAll<HTMLElement>('.bld-block')].map((r) => ({ top: r.offsetTop, height: r.offsetHeight }))
    const y0 = e.clientY
    const centre = slots[from].top + slots[from].height / 2
    const at = (ev: PointerEvent): Drag => {
      const dy = ev.clientY - y0
      return { from, dy, slots, copy: ev.altKey || ev.ctrlKey, to: dropIndex(slots, centre + dy) }
    }
    const move = (ev: PointerEvent) => setDrag(at(ev))
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setDrag(null)
      if (ev.type !== 'pointerup') return
      const d = at(ev)
      const next = moveTo(blocks, from, d.to, d.copy)
      if (next !== blocks) edit(next)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    setDrag(at(e.nativeEvent))
  }

  const keyMove = (e: KeyboardEvent, i: number) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const j = e.key === 'ArrowUp' ? i - 1 : i + 1
    if (j < 0 || j >= blocks.length) return
    edit(moveTo(blocks, i, e.key === 'ArrowUp' ? j : j + 1))
    listRef.current!.querySelectorAll<HTMLElement>('.bld-handle')[j].focus()
  }

  const pitch = drag ? drag.slots[drag.from].height + 8 : 0

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const w = await api.workouts.save({ id: id ?? undefined, name: name.trim(), unit, category, blocks })
      setId(w.id)
      setDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const status = error
    ? <span className="bld-status bad">{error}</span>
    : errorCount
      ? <span className="bld-status bad">Fix {errorCount} error{errorCount === 1 ? '' : 's'} to save</span>
      : !name.trim() && dirty
        ? <span className="bld-status">Name the workout to save</span>
        : dirty && <span className="bld-status warn">Unsaved changes</span>

  const u = unitLabel(unit)
  const pw = (v: number) => `${v} ${u}`
  const steady = newSteady(unit, ftp)
  const iv = newIntervals(unit, ftp)
  const ivHint = `${iv.repeat} × ${formatDuration(iv.onS)} @ ${pw(iv.onWatts)} / ${formatDuration(iv.offS)} @ ${pw(iv.offWatts)}`

  const input = (i: number, b: Block, f: FieldName, className: string) => (
    <input
      className={className}
      aria-label={`Block ${i + 1} ${LABEL[f]}`}
      aria-invalid={!!errorOf(i, f)}
      value={drafts[`${i}.${f}`] ?? format(b, f)}
      onChange={(e) => type(i, f, e.target.value)}
      onBlur={() => blur(i, f)}
    />
  )
  const unitTag = <span className="bld-unit">{u}</span>

  const row = (b: Block, i: number, cls: string, style?: CSSProperties, ghost = false) => {
    const err = rowErrors[i]
    return (
      <div key={ghost ? 'ghost' : i} className={`bld-grid bld-block${cls}${err ? ' error' : ''}`} style={style} inert={ghost}>
        <button
          className="bld-handle"
          aria-label="Drag to reorder"
          title="Drag to reorder · hold Alt to copy · Alt + ↑/↓ moves"
          onPointerDown={(e) => startDrag(e, i)}
          onKeyDown={(e) => keyMove(e, i)}
        >
          <IconGrip />
        </button>
        <span className="bld-index">{i + 1}</span>
        <div className="segmented" role="radiogroup" aria-label={`Block ${i + 1} type`}>
          {TYPES.map(([t, label]) => (
            <button
              key={t}
              role="radio"
              aria-checked={b.type === t}
              onClick={() => b.type !== t && edit(blocks.map((x, j) => (j === i ? setType(b, t, unit, ftp) : x)))}
            >
              {label}
            </button>
          ))}
        </div>
        {b.type === 'intervals' ? (
          <div className="bld-iv">
            {input(i, b, 'repeat', 'bld-rep')}
            <span className="bld-sep">×</span>
            <span className="bld-lbl">on</span>
            {input(i, b, 'onS', 'bld-dur')}
            <span className="bld-sep">@</span>
            {input(i, b, 'onWatts', 'bld-w')}
            {unitTag}
            <span className="bld-lbl off">off</span>
            {input(i, b, 'offS', 'bld-dur')}
            <span className="bld-sep">@</span>
            {input(i, b, 'offWatts', 'bld-w')}
            {unitTag}
          </div>
        ) : (
          <>
            {input(i, b, 'durationS', 'bld-dur')}
            <div className="bld-watts">
              {b.type === 'steady' ? (
                input(i, b, 'watts', 'bld-w')
              ) : (
                <>
                  {input(i, b, 'startWatts', 'bld-w')}
                  <IconArrow />
                  {input(i, b, 'endWatts', 'bld-w')}
                </>
              )}
              {unitTag}
            </div>
          </>
        )}
        <div className="bld-actions">
          <button className="ghost icon" aria-label={`Duplicate block ${i + 1}`} title="Duplicate" onClick={() => edit(duplicateAt(blocks, i))}>
            <IconCopy />
          </button>
          <button className="ghost icon" aria-label={`Delete block ${i + 1}`} title="Delete" onClick={() => edit(removeAt(blocks, i))}>
            <IconTrash />
          </button>
        </div>
        {err && (
          <div className={`bld-error ${b.type === 'intervals' || err[0] === 'durationS' ? 'at-dur' : 'at-watts'}`} role="alert">
            <IconAlert />{err[1]}
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="page bld">
      <header className="bld-head">
        <button className="bld-back icon" aria-label="Back to workouts" onClick={() => nav({ name: 'workouts' })}>
          <IconChevronLeft />
        </button>
        <input
          className="bld-name"
          aria-label="Workout name"
          placeholder="Workout name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setDirty(true)
          }}
        />
        <div className="bld-unitpick">
          <div className="segmented" role="radiogroup" aria-label="Power unit">
            {(['watts', 'ftp'] as const).map((x) => (
              <button key={x} role="radio" aria-checked={unit === x} onClick={() => switchUnit(x)}>
                {x === 'watts' ? 'W' : '% FTP'}
              </button>
            ))}
          </div>
          {unit === 'ftp' && (
            <span className="bld-ftp">
              FTP {ftp} W · <button className="link" onClick={() => nav({ name: 'settings' })}>edit in Settings</button>
            </span>
          )}
        </div>
        <div className="bld-stat">
          <span className="label">Total</span>
          <span className={errorCount ? 'num bld-none' : 'num'}>{errorCount ? '—' : formatDuration(workoutDurationS(blocks))}</span>
        </div>
        <div className="bld-stat">
          <span className="label">Blocks</span>
          <span className="num">{blocks.length}</span>
        </div>
        <div className="bld-save">
          <button className="primary lg" disabled={!name.trim() || !blocks.length || !!errorCount || saving} onClick={save}>
            <IconCheck />Save
          </button>
          {status}
        </div>
      </header>

      <div className="card bld-chart">
        <RideChart blocks={preview} samples={[]} height={168} />
      </div>

      <section className="bld-blocks">
        {!!blocks.length && (
          <div className="bld-grid bld-cols label">
            <span />
            <span>#</span>
            <span>Type</span>
            <span>Duration</span>
            <span>Power</span>
          </div>
        )}
        <div ref={listRef} className="bld-list" style={drag?.copy ? { paddingBottom: pitch } : undefined}>
          {drag && (
            <div className="bld-gap" style={{ top: gapTop(drag.slots, drag.from, drag.to, drag.copy, pitch), height: drag.slots[drag.from].height }} />
          )}
          {blocks.map((b, i) => {
            if (!drag) return row(b, i, '')
            if (drag.from === i && !drag.copy) return row(b, i, ' dragging', { transform: `translate(16px, ${drag.dy}px)` })
            return row(b, i, ' shifting', { transform: `translateY(${dragShift(i, drag.from, drag.to, drag.copy) * pitch}px)` })
          })}
          {drag?.copy && row(blocks[drag.from], drag.from, ' dragging ghost', { top: drag.slots[drag.from].top, transform: `translate(16px, ${drag.dy}px)` }, true)}
        </div>

        <footer className="bld-foot">
          <button title={`5:00 @ ${pw(steady.watts)}`} onClick={() => edit(addSteady(blocks, unit, ftp))}><IconPlus />Steady</button>
          <button title={`5:00, previous power → +${unit === 'ftp' ? '25 %' : '50 W'}`} onClick={() => edit(addRamp(blocks, unit, ftp))}><IconPlus />Ramp</button>
          <button title={ivHint} onClick={() => edit(addIntervals(blocks, unit, ftp))}><IconPlus />Intervals</button>
          <span className="bld-hint">
            {blocks.length > 1
              ? 'Drag a block by its handle to reorder · hold Alt (⌥) while dropping to copy · Alt + ↑ / ↓ moves the focused block'
              : `New steady: 5:00 @ ${pw(steady.watts)} · ramp: previous power → +${unit === 'ftp' ? '25 %' : '50 W'} · intervals: ${ivHint}`}
          </span>
        </footer>
      </section>

      {leaving && (
        <div className="backdrop" onKeyDown={(e) => e.key === 'Escape' && setLeaving(null)}>
          <div className="dialog bld-dialog" role="alertdialog" aria-modal="true" aria-labelledby="bld-discard">
            <h2 id="bld-discard">Discard changes?</h2>
            <p>Your changes to {name.trim() ? `“${name.trim()}”` : 'this workout'} haven't been saved.</p>
            <div className="bld-dialog-actions">
              <button className="ghost" autoFocus onClick={() => setLeaving(null)}>Keep editing</button>
              <button className="danger" onClick={() => (setLeaveGuard(null), nav(leaving))}>Discard</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
