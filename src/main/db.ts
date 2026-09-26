import { DatabaseSync } from 'node:sqlite'
import { LIBRARY } from '../shared/library'
import { achievements, gains } from '../shared/gamification'
import { overview, planFacts, prs, rollingBests, type RideAgg } from '../shared/stats'
import { DEFAULT_MAX_HR, type FtpRecordEntry, type NewRide, type RideStats, type RideSummary, type Sample, type SettingKey, type Workout, type WorkoutInput } from '../shared/types'

type Row = Record<string, any>

const toWorkout = (r: Row): Workout => ({
  id: r.id,
  name: r.name,
  unit: r.power_unit,
  category: r.category,
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
  kj: r.kj,
  ftp: r.ftp
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
  const version = () => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  const insertWorkout = (w: WorkoutInput, t = now()) => Number(db.prepare(
    'INSERT INTO workouts (name, power_unit, category, blocks_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(w.name, w.unit, w.category, JSON.stringify(w.blocks), t, t).lastInsertRowid)
  const storeBests = (rideId: number) => {
    const power = db.prepare('SELECT power FROM samples WHERE ride_id = ? ORDER BY t_s').all(rideId).map(r => r.power as number | null)
    db.prepare('DELETE FROM ride_bests WHERE ride_id = ?').run(rideId)
    for (const b of rollingBests(power))
      db.prepare('INSERT INTO ride_bests (ride_id, duration_s, watts) VALUES (?, ?, ?)').run(rideId, b.durationS, b.watts)
  }
  const storeFacts = (rideId: number) => {
    const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(rideId)
    if (!ride) return
    const samples = db.prepare('SELECT * FROM samples WHERE ride_id = ? ORDER BY t_s').all(rideId).map(toSample)
    db.prepare('UPDATE rides SET plan_json = ? WHERE id = ?').run(JSON.stringify(planFacts(toRide(ride), samples)), rideId)
  }
  const getWorkout = (id: number) => {
    const r = db.prepare('SELECT * FROM workouts WHERE id = ?').get(id)
    return r ? toWorkout(r) : null
  }
  // Fresh database: seed the example workout from the spec once
  if (version() === 0) {
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
  // v2: power unit + category, FTP per ride, per-ride bests (backfilled), workout library
  if (version() === 1) tx(() => {
    db.exec(`
      ALTER TABLE workouts ADD COLUMN power_unit TEXT NOT NULL DEFAULT 'watts';
      ALTER TABLE workouts ADD COLUMN category TEXT;
      ALTER TABLE rides ADD COLUMN ftp REAL;
      CREATE TABLE IF NOT EXISTS ride_bests (ride_id INTEGER NOT NULL, duration_s INTEGER NOT NULL, watts REAL NOT NULL);
      CREATE INDEX IF NOT EXISTS ride_bests_ride_id ON ride_bests (ride_id);
    `)
    for (const r of db.prepare('SELECT id FROM rides').all()) storeBests(r.id as number)
    for (const w of LIBRARY) if (!db.prepare('SELECT 1 FROM workouts WHERE name = ?').get(w.name)) insertWorkout(w)
    db.exec('PRAGMA user_version = 2')
  })
  // v3: plan facts per ride for the gamification replay (backfilled)
  if (version() === 2) tx(() => {
    db.exec('ALTER TABLE rides ADD COLUMN plan_json TEXT')
    for (const r of db.prepare('SELECT id FROM rides').all()) storeFacts(r.id as number)
    db.exec('PRAGMA user_version = 3')
  })
  // Rides that never got finish() (crash, killed app) keep their samples but have 0 stats: recompute them
  const crashed = db.prepare('SELECT id FROM rides WHERE ended_at IS NULL AND duration_s = 0').all()
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
  tx(() => crashed.forEach(r => {
    storeBests(r.id as number)
    storeFacts(r.id as number)
  }))
  // Per-ride distance, HR-zone seconds (zone formula = hrZone) and bests without loading samples
  const aggs = (): RideAgg[] => {
    const maxHr = Number(db.prepare("SELECT value FROM settings WHERE key = 'maxHr'").get()?.value) || DEFAULT_MAX_HR
    const map = new Map<number, RideAgg>()
    for (const r of db.prepare('SELECT * FROM rides').all()) {
      const plan = r.plan_json ? JSON.parse(r.plan_json as string) : { minOffset: null, plus10S: 0, atFtpS: 0 }
      map.set(r.id as number, { ride: toRide(r), distanceKm: 0, zoneS: [0, 0, 0, 0, 0, 0], bests: [], plan })
    }
    const zones = db.prepare(`
      SELECT ride_id, COALESCE((hr * 100 >= ?1 * 50) + (hr * 100 >= ?1 * 60) + (hr * 100 >= ?1 * 70)
        + (hr * 100 >= ?1 * 80) + (hr * 100 >= ?1 * 90), 0) AS z, COUNT(*) AS n, COALESCE(SUM(speed), 0) AS speed
      FROM samples GROUP BY ride_id, z
    `).all(maxHr)
    for (const r of zones) {
      const a = map.get(r.ride_id as number)
      if (!a) continue
      a.zoneS[r.z as number] += r.n as number
      a.distanceKm += (r.speed as number) / 3600
    }
    for (const r of db.prepare('SELECT * FROM ride_bests').all()) {
      map.get(r.ride_id as number)?.bests.push({ durationS: r.duration_s as number, watts: r.watts as number })
    }
    return [...map.values()]
  }
  const workoutRefs = () => db.prepare('SELECT id, name, category FROM workouts').all() as Pick<Workout, 'id' | 'name' | 'category'>[]
  const ftpRecords = (): FtpRecordEntry[] =>
    JSON.parse((db.prepare("SELECT value FROM settings WHERE key = 'ftpRecords'").get()?.value as string | undefined) ?? '[]')
  const insertSample = db.prepare(
    'INSERT INTO samples (ride_id, t_s, power, target_power, cadence, hr, speed) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )

  return {
    close: () => db.close(),
    workouts: {
      list: () => db.prepare('SELECT * FROM workouts ORDER BY name COLLATE NOCASE').all().map(toWorkout),
      get: getWorkout,
      save(w: WorkoutInput): Workout {
        const id = w.id ?? insertWorkout(w)
        if (w.id !== undefined) {
          db.prepare('UPDATE workouts SET name = ?, power_unit = ?, category = ?, blocks_json = ?, updated_at = ? WHERE id = ?')
            .run(w.name, w.unit, w.category, JSON.stringify(w.blocks), now(), id)
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
        'INSERT INTO rides (started_at, mode, workout_id, workout_name, blocks_json, ftp) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(now(), r.mode, r.workoutId, r.workoutName, r.blocks && JSON.stringify(r.blocks), r.ftp).lastInsertRowid),
      appendSamples(rideId: number, samples: Sample[]) {
        tx(() => {
          for (const s of samples) insertSample.run(rideId, s.tS, s.power, s.targetPower, s.cadence, s.hr, s.speed)
        })
      },
      finish(rideId: number, s: RideStats) {
        db.prepare(`UPDATE rides SET ended_at = ?, duration_s = ?, avg_power = ?, max_power = ?, avg_hr = ?, max_hr = ?,
          avg_cadence = ?, kj = ? WHERE id = ?`)
          .run(now(), s.durationS, s.avgPower, s.maxPower, s.avgHr, s.maxHr, s.avgCadence, s.kj, rideId)
        tx(() => {
          storeBests(rideId)
          storeFacts(rideId)
        })
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
          db.prepare('DELETE FROM ride_bests WHERE ride_id = ?').run(id)
          db.prepare('DELETE FROM rides WHERE id = ?').run(id)
        })
      }
    },
    stats: {
      overview: () => overview(aggs()),
      prs: (rideId: number) => prs(aggs(), rideId)
    },
    achievements: {
      overview: () => achievements(aggs(), ftpRecords(), workoutRefs()),
      gains: (rideId: number) => gains(aggs(), rideId, workoutRefs())
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
