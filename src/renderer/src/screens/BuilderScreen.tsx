import { useEffect, useState, type DragEvent } from 'react'
import type { Block } from '../../../shared/types'
import { api } from '../api'
import { RideChart } from '../components/RideChart'
import { workoutDurationS } from '../engine/plan'
import { formatDuration, parseDuration } from '../format'
import type { Nav } from '../route'
import { addRamp, addSteady, duplicateAt, moveTo, parseWatts, removeAt, replaceAt, setType } from './builder'
import './screens.css'

const parsePositiveDuration = (t: string) => {
  const s = parseDuration(t)
  return s && s > 0 ? s : null
}

/** Text input that only reports valid values; invalid text gets a red outline and is not applied. */
function Field(props: { value: number; format: (v: number) => string; parse: (t: string) => number | null; onChange: (v: number) => void }) {
  const { value, format, parse, onChange } = props
  const [text, setText] = useState(format(value))
  useEffect(() => {
    if (parse(text) !== value) setText(format(value))
  }, [value])
  return (
    <input
      className={parse(text) === null ? 'invalid' : ''}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const v = parse(e.target.value)
        if (v !== null) onChange(v)
      }}
    />
  )
}

const WattsField = (p: { value: number; onChange: (v: number) => void }) => (
  <Field value={p.value} format={String} parse={parseWatts} onChange={p.onChange} />
)

export function BuilderScreen({ nav, workoutId }: { nav: Nav; workoutId: number | null }) {
  const [id, setId] = useState(workoutId)
  const [name, setName] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ from: number; to: number | null } | null>(null)

  useEffect(() => {
    if (workoutId === null) return
    api.workouts.get(workoutId).then((w) => {
      if (!w) return setError('Workout not found')
      setName(w.name)
      setBlocks(w.blocks)
    })
  }, [workoutId])

  const edit = (next: Block[]) => {
    setBlocks(next)
    setDirty(true)
  }
  const patch = (i: number, b: Block) => edit(replaceAt(blocks, i, b))

  // Native drag & drop: drag the handle, drop above/below a row; Alt (⌥) or Ctrl while dropping copies
  const copyKey = (e: DragEvent) => e.altKey || e.ctrlKey
  const dragOver = (e: DragEvent<HTMLTableRowElement>, i: number) => {
    if (!drag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = copyKey(e) ? 'copy' : 'move'
    const r = e.currentTarget.getBoundingClientRect()
    const to = e.clientY > r.top + r.height / 2 ? i + 1 : i
    if (to !== drag.to) setDrag({ ...drag, to })
  }
  const drop = (e: DragEvent) => {
    e.preventDefault()
    if (drag?.to != null) {
      const next = moveTo(blocks, drag.from, drag.to, copyKey(e))
      if (next !== blocks) edit(next)
    }
    setDrag(null)
  }
  const rowClass = (i: number) =>
    [
      drag?.from === i && 'dragging',
      drag?.to === i && 'drop-before',
      drag?.to === i + 1 && i === blocks.length - 1 && 'drop-after'
    ]
      .filter(Boolean)
      .join(' ')

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

  const back = () => {
    if (dirty && !confirm('Discard changes?')) return
    nav({ name: 'workouts' })
  }

  return (
    <main className="screen">
      <header className="topbar">
        <button onClick={back}>Back</button>
        <h1 className="grow">{id === null ? 'New workout' : 'Edit workout'}</h1>
        <button className="primary" disabled={!name.trim() || !blocks.length || saving} onClick={save}>
          {dirty || id === null ? 'Save' : 'Saved'}
        </button>
      </header>

      {error && <div className="error">{error}</div>}

      <div className="builder-head">
        <label className="field grow">
          Name
          <input
            className="grow"
            value={name}
            placeholder="Workout name"
            onChange={(e) => {
              setName(e.target.value)
              setDirty(true)
            }}
          />
        </label>
        <span className="total">Total {formatDuration(workoutDurationS(blocks))}</span>
      </div>

      <div className="card">
        <RideChart blocks={blocks} samples={[]} />
      </div>

      <table className="table blocks">
        <thead>
          <tr><th /><th>#</th><th>Type</th><th>Duration</th><th>Watts</th><th /></tr>
        </thead>
        <tbody>
          {blocks.map((b, i) => (
            <tr key={i} className={rowClass(i)} onDragOver={(e) => dragOver(e, i)} onDrop={drop}>
              <td
                className="handle"
                title="Drag to reorder, hold Alt to copy"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'copyMove'
                  e.dataTransfer.setDragImage(e.currentTarget.parentElement!, 0, 0)
                  setDrag({ from: i, to: null })
                }}
                onDragEnd={() => setDrag(null)}
              >
                ⠿
              </td>
              <td className="muted">{i + 1}</td>
              <td>
                <select value={b.type} onChange={(e) => patch(i, setType(b, e.target.value as Block['type']))}>
                  <option value="steady">Steady</option>
                  <option value="ramp">Ramp</option>
                </select>
              </td>
              <td className="duration">
                <Field value={b.durationS} format={formatDuration} parse={parsePositiveDuration} onChange={(durationS) => patch(i, { ...b, durationS })} />
              </td>
              <td className="watts">
                {b.type === 'steady' ? (
                  <WattsField value={b.watts} onChange={(watts) => patch(i, { ...b, watts })} />
                ) : (
                  <>
                    <WattsField value={b.startWatts} onChange={(startWatts) => patch(i, { ...b, startWatts })} />
                    {' → '}
                    <WattsField value={b.endWatts} onChange={(endWatts) => patch(i, { ...b, endWatts })} />
                  </>
                )}
                {' W'}
              </td>
              <td className="actions">
                <button title="Duplicate" onClick={() => edit(duplicateAt(blocks, i))}>Duplicate</button>
                <button title="Delete" className="danger" onClick={() => edit(removeAt(blocks, i))}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="row">
        <button onClick={() => edit(addSteady(blocks))}>+ Steady</button>
        <button onClick={() => edit(addRamp(blocks))}>+ Ramp</button>
        {blocks.length > 1 && <span className="muted hint">Drag ⠿ to reorder · hold Alt (⌥) while dropping to copy</span>}
      </div>
    </main>
  )
}
