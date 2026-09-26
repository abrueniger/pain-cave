import { DatabaseSync } from 'node:sqlite'
import type { Block, NewRide, RideStats, RideSummary, Sample, SettingKey, Workout } from '../shared/types'

type Row = Record<string, any>

const toWorkout = (r: Row): Workout => ({
  id: r.id,
  name: r.name,
  blocks: JSON.parse(r.blocks_json),
  createdAt: r.created_at,
  updatedAt: r.updated_at
})

const toRide = (r: Row): RideSummary => ({
  id: r.id,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  mode: r.mode,
  workoutId: r.workout_id,
  workoutName: r.workout_name,
  blocks: r.blocks_json === null ? null : JSON.parse(r.blocks_json),
  durationS: r.duration_s,
  avgPower: r.avg_power,
  maxPower: r.max_power,
  avgHr: r.avg_hr,
  maxHr: r.max_hr,
  avgCadence: r.avg_cadence,
  kj: r.kj
})

const toSample = (r: Row): Sample => ({
  tS: r.t_s,
  power: r.power,
  targetPower: r.target_power,
  cadence: r.cadence,
  hr: r.hr,
  speed: r.speed
})

export function openDb(path: string) {
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, blocks_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rides (
      id INTEGER PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT, mode TEXT NOT NULL,
      workout_id INTEGER, workout_name TEXT, blocks_json TEXT,
      duration_s REAL NOT NULL DEFAULT 0, avg_power REAL NOT NULL DEFAULT 0, max_power REAL NOT NULL DEFAULT 0,
      avg_hr REAL, max_hr REAL, avg_cadence REAL NOT NULL DEFAULT 0, kj REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS samples (
      ride_id INTEGER NOT NULL, t_s INTEGER NOT NULL, power REAL, target_power REAL NOT NULL,
      cadence REAL, hr REAL, speed REAL
    );
    CREATE INDEX IF NOT EXISTS samples_ride_id ON samples (ride_id);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)

  const now = () => new Date().toISOString()
  const tx = (fn: () => void) => {
    db.exec('BEGIN')
    try {
      fn()
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
  const getWorkout = (id: number) => {
    const r = db.prepare('SELECT * FROM workouts WHERE id = ?').get(id)
    return r ? toWorkout(r) : null
  }
  // Fresh database: seed the example workout from the spec once
  if ((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version === 0) {
    const blocks = [
      { type: 'ramp', durationS: 300, startWatts: 100, endWatts: 150 },
      { type: 'steady', durationS: 600, watts: 170 },
      { type: 'steady', durationS: 30, watts: 300 },
      { type: 'steady', durationS: 300, watts: 170 },
      { type: 'ramp', durationS: 300, startWatts: 150, endWatts: 100 }
    ]
    db.prepare('INSERT INTO workouts (name, blocks_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('Example', JSON.stringify(blocks), now(), now())
    db.exec('PRAGMA user_version = 1')
  }
  // Rides that never got finish() (crash, killed app) keep their samples but have 0 stats: recompute them
  db.exec(`
    UPDATE rides SET
      duration_s = (SELECT COUNT(*) FROM samples s WHERE s.ride_id = rides.id),
      avg_power = COALESCE((SELECT ROUND(AVG(power)) FROM samples s WHERE s.ride_id = rides.id), 0),
      max_power = COALESCE((SELECT MAX(power) FROM samples s WHERE s.ride_id = rides.id), 0),
      avg_hr = (SELECT ROUND(AVG(hr)) FROM samples s WHERE s.ride_id = rides.id),
      max_hr = (SELECT MAX(hr) FROM samples s WHERE s.ride_id = rides.id),
      avg_cadence = COALESCE((SELECT ROUND(AVG(cadence)) FROM samples s WHERE s.ride_id = rides.id), 0),
      kj = COALESCE((SELECT ROUND(SUM(power) / 100.0) / 10 FROM samples s WHERE s.ride_id = rides.id), 0)
    WHERE ended_at IS NULL AND duration_s = 0
  `)
  const insertSample = db.prepare(
    'INSERT INTO samples (ride_id, t_s, power, target_power, cadence, hr, speed) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )

  return {
    close: () => db.close(),
    workouts: {
      list: () => db.prepare('SELECT * FROM workouts ORDER BY name COLLATE NOCASE').all().map(toWorkout),
      get: getWorkout,
      save(w: { id?: number; name: string; blocks: Block[] }): Workout {
        const json = JSON.stringify(w.blocks)
        let id = w.id
        if (id === undefined) {
          const t = now()
          id = Number(db.prepare('INSERT INTO workouts (name, blocks_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
            .run(w.name, json, t, t).lastInsertRowid)
        } else {
          db.prepare('UPDATE workouts SET name = ?, blocks_json = ?, updated_at = ? WHERE id = ?').run(w.name, json, now(), id)
        }
        const saved = getWorkout(id)
        if (!saved) throw new Error(`Workout ${id} not found`)
        return saved
      },
      delete(id: number) {
        db.prepare('DELETE FROM workouts WHERE id = ?').run(id)
      }
    },
    rides: {
      start: (r: NewRide) => Number(db.prepare(
        'INSERT INTO rides (started_at, mode, workout_id, workout_name, blocks_json) VALUES (?, ?, ?, ?, ?)'
      ).run(now(), r.mode, r.workoutId, r.workoutName, r.blocks && JSON.stringify(r.blocks)).lastInsertRowid),
      appendSamples(rideId: number, samples: Sample[]) {
        tx(() => {
          for (const s of samples) insertSample.run(rideId, s.tS, s.power, s.targetPower, s.cadence, s.hr, s.speed)
        })
      },
      finish(rideId: number, s: RideStats) {
        db.prepare(`UPDATE rides SET ended_at = ?, duration_s = ?, avg_power = ?, max_power = ?, avg_hr = ?, max_hr = ?,
          avg_cadence = ?, kj = ? WHERE id = ?`)
          .run(now(), s.durationS, s.avgPower, s.maxPower, s.avgHr, s.maxHr, s.avgCadence, s.kj, rideId)
      },
      list: () => db.prepare('SELECT * FROM rides ORDER BY started_at DESC, id DESC').all().map(toRide),
      get(id: number) {
        const r = db.prepare('SELECT * FROM rides WHERE id = ?').get(id)
        if (!r) return null
        const samples = db.prepare('SELECT * FROM samples WHERE ride_id = ? ORDER BY t_s').all(id).map(toSample)
        return { ride: toRide(r), samples }
      },
      delete(id: number) {
        tx(() => {
          db.prepare('DELETE FROM samples WHERE ride_id = ?').run(id)
          db.prepare('DELETE FROM rides WHERE id = ?').run(id)
        })
      }
    },
    settings: {
      get: (key: SettingKey) =>
        (db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value as string | undefined) ?? null,
      set(key: SettingKey, value: string) {
        db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
          .run(key, value)
      }
    }
  }
}

export type Db = ReturnType<typeof openDb>
