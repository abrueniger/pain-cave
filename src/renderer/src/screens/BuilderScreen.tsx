import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Block } from '../../../shared/types'
import { api } from '../api'
import { IconAlert, IconChevronLeft, IconCopy, IconGrip, IconPlus, IconTrash } from '../components/icons'
import { RideChart } from '../components/RideChart'
import { workoutDurationS } from '../engine/plan'
import { formatDuration } from '../format'
import { setLeaveGuard, type Nav, type Route } from '../route'
import {
  addRamp, addSteady, checkDuration, checkWatts, dragShift, dropIndex, duplicateAt, gapTop, moveTo, removeAt, setType, type Slot
} from './builder'
import './builder.css'

const line = (d: string) => () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
const IconCheck = line('M5 12.5l4.5 4.5L19 7')
const IconArrow = line('M5 12h14M13 6l6 6-6 6')

type FieldName = 'durationS' | 'watts' | 'startWatts' | 'endWatts'
const fieldsOf = (b: Block): FieldName[] => (b.type === 'steady' ? ['durationS', 'watts'] : ['durationS', 'startWatts', 'endWatts'])
const check = (f: FieldName) => (f === 'durationS' ? checkDuration : checkWatts)
const format = (b: Block, f: FieldName) => (f === 'durationS' ? formatDuration(b.durationS) : String((b as Partial<Record<FieldName, number>>)[f]))

type Drag = { from: number; to: number; dy: number; copy: boolean; slots: Slot[] }

export function BuilderScreen({ nav, workoutId }: { nav: Nav; workoutId: number | null }) {
  const [id, setId] = useState(workoutId)
  const [name, setName] = useState('')
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

  useEffect(() => {
    if (workoutId === null) return
    api.workouts.get(workoutId).then((w) => {
      if (!w) return setError('Workout not found')
      setName(w.name)
      setBlocks(w.blocks)
    })
  }, [workoutId])

  /** Structural edit: drops pending text (invalid input reverts to the last valid value). */
  const edit = (next: Block[]) => {
    setBlocks(next)
    setDrafts({})
    setDirty(true)
  }

  const type = (i: number, f: FieldName, text: string) => {
    const k = `${i}.${f}`
    setDrafts((d) => ({ ...d, [k]: text }))
    setDirty(true)
    const v = check(f)(text)
    if (typeof v === 'number') setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, [f]: v } : b)))
  }
  const blur = (i: number, f: FieldName) => {
    const k = `${i}.${f}`
    if (k in drafts && typeof check(f)(drafts[k]) === 'number') setDrafts(({ [k]: _, ...rest }) => rest)
  }
  const errorOf = (i: number, f: FieldName) => {
    const text = drafts[`${i}.${f}`]
    const v = text === undefined ? 0 : check(f)(text)
    return typeof v === 'string' ? v : null
  }
  const rowErrors = blocks.map((b, i) => fieldsOf(b).map((f) => [f, errorOf(i, f)] as const).find(([, e]) => e))
  const errorCount = blocks.reduce((n, b, i) => n + fieldsOf(b).filter((f) => errorOf(i, f)).length, 0)

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
      const w = await api.workouts.save({ id: id ?? undefined, name: name.trim(), blocks })
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

  const input = (i: number, b: Block, f: FieldName, className: string) => (
    <input
      className={className}
      aria-label={f === 'durationS' ? `Block ${i + 1} duration` : `Block ${i + 1} ${f === 'endWatts' ? 'end ' : f === 'startWatts' ? 'start ' : ''}watts`}
      aria-invalid={!!errorOf(i, f)}
      value={drafts[`${i}.${f}`] ?? format(b, f)}
      onChange={(e) => type(i, f, e.target.value)}
      onBlur={() => blur(i, f)}
    />
  )

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
          {(['steady', 'ramp'] as const).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={b.type === t}
              onClick={() => b.type !== t && edit(blocks.map((x, j) => (j === i ? setType(b, t) : x)))}
            >
              {t === 'steady' ? 'Steady' : 'Ramp'}
            </button>
          ))}
        </div>
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
          <span className="bld-unit">W</span>
        </div>
        <div className="bld-actions">
          <button className="ghost icon" aria-label={`Duplicate block ${i + 1}`} title="Duplicate" onClick={() => edit(duplicateAt(blocks, i))}>
            <IconCopy />
          </button>
          <button className="ghost icon" aria-label={`Delete block ${i + 1}`} title="Delete" onClick={() => edit(removeAt(blocks, i))}>
            <IconTrash />
          </button>
        </div>
        {err && (
          <div className={`bld-error ${err[0] === 'durationS' ? 'at-dur' : 'at-watts'}`} role="alert">
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
        <RideChart blocks={blocks} samples={[]} height={168} />
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
          <button title="5:00 @ 150 W" onClick={() => edit(addSteady(blocks))}><IconPlus />Steady</button>
          <button title="5:00, previous watts → +50 W" onClick={() => edit(addRamp(blocks))}><IconPlus />Ramp</button>
          <span className="bld-hint">
            {blocks.length > 1
              ? 'Drag a block by its handle to reorder · hold Alt (⌥) while dropping to copy · Alt + ↑ / ↓ moves the focused block'
              : 'New steady: 5:00 @ 150 W · new ramp: previous watts → +50 W'}
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
