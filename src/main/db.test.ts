import { describe, expect, it } from 'vitest'
import { openDb } from './db'
import type { Block, Sample } from '../shared/types'

const blocks: Block[] = [
  { type: 'ramp', durationS: 300, startWatts: 100, endWatts: 150 },
  { type: 'steady', durationS: 600, watts: 170 }
]

const sample = (tS: number): Sample => ({ tS, power: 150 + tS, targetPower: 150, cadence: 90, hr: null, speed: 30.5 })

describe('db', () => {
  it('saves, updates, lists and deletes workouts', () => {
    const db = openDb(':memory:')
    const w = db.workouts.save({ name: 'B', blocks })
    expect(w).toMatchObject({ name: 'B', blocks })
    expect(w.id).toBeTypeOf('number')
    db.workouts.save({ name: 'A', blocks: [] })

    const updated = db.workouts.save({ id: w.id, name: 'B2', blocks: blocks.slice(1) })
    expect(updated).toMatchObject({ id: w.id, name: 'B2', blocks: blocks.slice(1), createdAt: w.createdAt })
    expect(db.workouts.list().map(x => x.name)).toEqual(['A', 'B2'])
    expect(db.workouts.get(w.id)).toEqual(updated)

    db.workouts.delete(w.id)
    expect(db.workouts.get(w.id)).toBeNull()
    expect(db.workouts.list()).toHaveLength(1)
  })

  it('records, finishes, lists and deletes rides with samples', () => {
    const db = openDb(':memory:')
    const free = db.rides.start({ mode: 'free', workoutId: null, workoutName: null, blocks: null })
    const planned = db.rides.start({ mode: 'planned', workoutId: 7, workoutName: 'Sweet', blocks })

    expect(db.rides.get(planned)!.ride).toMatchObject({
      endedAt: null, mode: 'planned', workoutId: 7, workoutName: 'Sweet', blocks, durationS: 0, avgHr: null
    })

    db.rides.appendSamples(planned, [sample(0), sample(1)])
    db.rides.appendSamples(planned, [sample(2)])
    db.rides.appendSamples(free, [sample(0)])
    const stats = { durationS: 3, avgPower: 151, maxPower: 152, avgHr: 120, maxHr: 130, avgCadence: 90, kj: 0.45 }
    db.rides.finish(planned, stats)

    const got = db.rides.get(planned)!
    expect(got.ride).toMatchObject(stats)
    expect(got.ride.endedAt).toBeTypeOf('string')
    expect(got.samples).toEqual([sample(0), sample(1), sample(2)])

    expect(db.rides.list().map(r => r.id)).toEqual([planned, free])
    expect(db.rides.get(free)!.ride.blocks).toBeNull()

    db.rides.delete(planned)
    expect(db.rides.get(planned)).toBeNull()
    expect(db.rides.list().map(r => r.id)).toEqual([free])
    // a new ride may reuse the id; it must not inherit old samples
    const next = db.rides.start({ mode: 'free', workoutId: null, workoutName: null, blocks: null })
    expect(db.rides.get(next)!.samples).toEqual([])
    expect(db.rides.get(free)!.samples).toHaveLength(1)
  })

  it('gets and sets settings', () => {
    const db = openDb(':memory:')
    expect(db.settings.get('maxHr')).toBeNull()
    db.settings.set('maxHr', '180')
    db.settings.set('maxHr', '185')
    expect(db.settings.get('maxHr')).toBe('185')
  })
})
