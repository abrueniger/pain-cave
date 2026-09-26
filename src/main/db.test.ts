import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { openDb } from './db'
import { LIBRARY } from '../shared/library'
import type { Block, NewRide, Sample } from '../shared/types'

const blocks: Block[] = [
  { type: 'ramp', durationS: 300, startWatts: 100, endWatts: 150 },
  { type: 'steady', durationS: 600, watts: 170 }
]

const sample = (tS: number): Sample => ({ tS, power: 150 + tS, targetPower: 150, cadence: 90, hr: null, speed: 30.5 })
const freeRide: NewRide = { mode: 'free', workoutId: null, workoutName: null, blocks: null, ftp: null }
const tmpPath = () => join(mkdtempSync(join(tmpdir(), 'paincave-')), 'test.db')

describe('db', () => {
  it('saves, updates, lists and deletes workouts', () => {
    const db = openDb(':memory:')
    const w = db.workouts.save({ name: 'B', unit: 'watts', category: null, blocks })
    expect(w).toMatchObject({ name: 'B', unit: 'watts', category: null, blocks })
    expect(w.id).toBeTypeOf('number')
    db.workouts.save({ name: 'A', unit: 'ftp', category: 'Tempo', blocks: [] })

    const updated = db.workouts.save({ id: w.id, name: 'B2', unit: 'ftp', category: 'Test', blocks: blocks.slice(1) })
    expect(updated).toMatchObject({ id: w.id, name: 'B2', unit: 'ftp', category: 'Test', blocks: blocks.slice(1), createdAt: w.createdAt })
    const names = db.workouts.list().map(x => x.name)
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: 'base' })))
    expect(names).toContain('B2')
    expect(names).toContain('Example')
    expect(db.workouts.get(w.id)).toEqual(updated)

    db.workouts.delete(w.id)
    expect(db.workouts.get(w.id)).toBeNull()
    expect(db.workouts.list()).toHaveLength(LIBRARY.length + 2)
  })

  it('records, finishes, lists and deletes rides with samples and bests', () => {
    const db = openDb(':memory:')
    const free = db.rides.start(freeRide)
    const planned = db.rides.start({ mode: 'planned', workoutId: 7, workoutName: 'Sweet', blocks, ftp: 250 })

    expect(db.rides.get(planned)!.ride).toMatchObject({
      endedAt: null, mode: 'planned', workoutId: 7, workoutName: 'Sweet', blocks, durationS: 0, avgHr: null, ftp: 250
    })

    db.rides.appendSamples(planned, [sample(0), sample(1)])
    db.rides.appendSamples(planned, [sample(2), sample(3), sample(4)])
    db.rides.appendSamples(free, [sample(0)])
    const stats = { durationS: 5, avgPower: 152, maxPower: 154, avgHr: 120, maxHr: 130, avgCadence: 90, kj: 0.76 }
    db.rides.finish(planned, stats)

    const got = db.rides.get(planned)!
    expect(got.ride).toMatchObject(stats)
    expect(got.ride.endedAt).toBeTypeOf('string')
    expect(got.samples).toEqual([0, 1, 2, 3, 4].map(sample))
    expect(db.stats.overview().bestsAllTime).toEqual([{ durationS: 5, watts: 152, rideId: planned, date: got.ride.startedAt }])
    expect(db.stats.prs(planned)).toEqual([5])

    expect(db.rides.list().map(r => r.id)).toEqual([planned, free])
    expect(db.rides.get(free)!.ride.blocks).toBeNull()

    db.rides.delete(planned)
    expect(db.rides.get(planned)).toBeNull()
    expect(db.stats.overview().bestsAllTime).toEqual([])
    expect(db.rides.list().map(r => r.id)).toEqual([free])
    // a new ride may reuse the id; it must not inherit old samples
    const next = db.rides.start(freeRide)
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

  it('recomputes stats and bests of rides that were never finished (crash)', () => {
    const path = tmpPath()
    let db = openDb(path)
    const id = db.rides.start(freeRide)
    db.rides.appendSamples(id, [0, 1, 2, 3, 4].map((t) => ({ ...sample(t), hr: 120 + t })))
    db.close()

    db = openDb(path)
    expect(db.rides.get(id)!.ride).toMatchObject({
      endedAt: null, durationS: 5, avgPower: 152, maxPower: 154, avgHr: 122, maxHr: 124, avgCadence: 90, kj: 0.8
    })
    expect(db.stats.prs(id)).toEqual([5])
    db.close()
  })

  it('migrates a v1 database: new columns, backfilled bests, library seeded once', () => {
    const path = tmpPath()
    const v1 = new DatabaseSync(path)
    v1.exec(`
      CREATE TABLE workouts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, blocks_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE rides (id INTEGER PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT, mode TEXT NOT NULL,
        workout_id INTEGER, workout_name TEXT, blocks_json TEXT,
        duration_s REAL NOT NULL DEFAULT 0, avg_power REAL NOT NULL DEFAULT 0, max_power REAL NOT NULL DEFAULT 0,
        avg_hr REAL, max_hr REAL, avg_cadence REAL NOT NULL DEFAULT 0, kj REAL NOT NULL DEFAULT 0);
      CREATE TABLE samples (ride_id INTEGER NOT NULL, t_s INTEGER NOT NULL, power REAL, target_power REAL NOT NULL, cadence REAL, hr REAL, speed REAL);
      INSERT INTO workouts VALUES (1, 'Mine', '[]', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
      INSERT INTO rides (id, started_at, ended_at, mode, duration_s, kj) VALUES (1, '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z', 'free', 60, 12);
      PRAGMA user_version = 1;
    `)
    const ins = v1.prepare('INSERT INTO samples VALUES (1, ?, ?, 100, 90, NULL, 36)')
    for (let t = 0; t < 60; t++) ins.run(t, t < 5 ? 300 : 200)
    v1.close()

    let db = openDb(path)
    expect(db.workouts.get(1)).toMatchObject({ name: 'Mine', unit: 'watts', category: null })
    expect(db.rides.get(1)!.ride.ftp).toBeNull()
    expect(db.stats.overview().bestsAllTime.map(b => [b.durationS, b.watts])).toEqual([[5, 300], [60, 208]])
    expect(db.stats.overview().totals).toEqual({ rides: 1, durationS: 60, kj: 12, distanceKm: 0.6 })
    const count = db.workouts.list().length
    expect(count).toBe(LIBRARY.length + 1)
    db.close()
    db = openDb(path)
    expect(db.workouts.list()).toHaveLength(count)
    db.close()
  })

  it('computes the overview from stored rides', () => {
    const db = openDb(':memory:')
    db.settings.set('maxHr', '200')
    const plan: Block[] = [{ type: 'steady', durationS: 1200, watts: 200 }]
    const ride = (hr: number, watts: number) => {
      const id = db.rides.start({ mode: 'planned', workoutId: 3, workoutName: 'SS', blocks: plan, ftp: 250 })
      db.rides.appendSamples(id, Array.from({ length: 1200 }, (_, t) => ({ tS: t, power: watts, targetPower: 200, cadence: 90, hr, speed: 36 })))
      db.rides.finish(id, { durationS: 1200, avgPower: watts, maxPower: watts, avgHr: hr, maxHr: hr, avgCadence: 90, kj: watts * 1.2 })
      return id
    }
    const a = ride(150, 200) // 75 % of 200 → Z3
    const b = ride(170, 210) // 85 % → Z4
    const o = db.stats.overview()
    const week = o.weeks[11]
    expect(o.weeks).toHaveLength(12)
    expect(week).toMatchObject({ rides: 2, durationS: 2400, kj: 492, distanceKm: 24, zoneS: [0, 0, 0, 1200, 1200, 0] })
    expect(o.ftpEstimate).toBe(Math.round(0.95 * 210))
    expect(o.bests90d.find(x => x.durationS === 1200)).toMatchObject({ rideId: b, watts: 210 })
    expect(o.workoutTrends).toEqual([{
      workoutId: 3, name: 'SS', points: [
        expect.objectContaining({ rideId: a, avgPower: 200, avgHr: 150, efficiency: 1.333 }),
        expect.objectContaining({ rideId: b, avgPower: 210, avgHr: 170, efficiency: 1.235 })
      ]
    }])
    expect(db.stats.prs(a)).toEqual([])
    expect(db.stats.prs(b)).toEqual([5, 60, 300, 1200])
  })

  it('stores plan facts at finish and on crash recovery; achievements and gains from stored rides', () => {
    const path = tmpPath()
    let db = openDb(path)
    const plan: Block[] = [{ type: 'steady', durationS: 600, watts: 200 }]
    const id = db.rides.start({ mode: 'planned', workoutId: 1, workoutName: 'Hard', blocks: plan, ftp: 200 })
    db.rides.appendSamples(id, Array.from({ length: 600 }, (_, t) => ({ ...sample(t), targetPower: 210 })))
    db.rides.finish(id, { durationS: 600, avgPower: 200, maxPower: 200, avgHr: null, maxHr: null, avgCadence: 90, kj: 120.4 })
    expect(db.achievements.gains(id)).toMatchObject({
      xp: 120, before: { level: 1 }, after: { level: 2, xp: 120 },
      unlocked: [{ kind: 'special', id: 'firstRide' }, { kind: 'special', id: 'firstPlanned' },
        { kind: 'special', id: 'asPlanned' }, { kind: 'special', id: 'harderThanPlanned' }]
    })
    const crashed = db.rides.start({ mode: 'planned', workoutId: 1, workoutName: 'Hard', blocks: plan, ftp: 200 })
    db.rides.appendSamples(crashed, Array.from({ length: 300 }, (_, t) => ({ ...sample(t), targetPower: 190 })))
    db.settings.set('ftpRecords', JSON.stringify([{ date: '2026-01-01T00:00:00.000Z', watts: 220, prevWatts: 200 }]))
    db.close()

    db = openDb(path)
    const raw = new DatabaseSync(path)
    expect(raw.prepare('SELECT plan_json FROM rides ORDER BY id').all().map(r => JSON.parse(r.plan_json as string))).toEqual([
      { minOffset: 10, plus10S: 600, atFtpS: 600 },
      { minOffset: -10, plus10S: 0, atFtpS: 0 }
    ])
    raw.close()
    const a = db.achievements.overview()
    expect(a).toMatchObject({ level: 2, records: [{ kind: 'ftp', watts: 220 }] })
    expect(a.milestones.map(m => m.total)).toEqual([expect.closeTo(9 * 30.5 / 36, 5), 0.25, 2, 0])
    db.close()
  })

  it('migrates a v2 database: plan facts backfilled', () => {
    const path = tmpPath()
    openDb(path).close()
    const v2 = new DatabaseSync(path)
    v2.exec(`ALTER TABLE rides DROP COLUMN plan_json; PRAGMA user_version = 2;
      INSERT INTO rides (id, started_at, ended_at, mode, blocks_json, duration_s, kj, ftp)
      VALUES (1, '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z', 'planned', '[{"type":"steady","durationS":60,"watts":150}]', 60, 12, 140);`)
    const ins = v2.prepare('INSERT INTO samples VALUES (1, ?, 200, ?, 90, NULL, 36)')
    for (let t = 0; t < 60; t++) ins.run(t, t < 30 ? 150 : 149)
    v2.close()
    const db = openDb(path)
    expect(db.achievements.gains(1).unlocked.map(u => u.kind === 'special' && u.id)).toEqual(['firstRide', 'firstPlanned', 'asPlanned'])
    db.close()
    const backups = readdirSync(dirname(path)).filter(f => /^test-backup-v2-\d+\.db$/.test(f))
    expect(backups).toHaveLength(1)
    const old = new DatabaseSync(join(dirname(path), backups[0]))
    expect(old.prepare('PRAGMA user_version').get()).toEqual({ user_version: 2 })
    old.close()
    const raw = new DatabaseSync(path)
    expect(raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: 3 })
    expect(JSON.parse(raw.prepare('SELECT plan_json FROM rides').get()!.plan_json as string)).toEqual({ minOffset: -1, plus10S: 0, atFtpS: 60 })
    raw.close()
  })
})
