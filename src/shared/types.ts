// Contracts shared by main, preload and renderer. Change with care: every module builds on these.

/** 'watts' = absolute W; 'ftp' = % of FTP (e.g. 88 = 88 %). Applies to every power value of a workout. */
export type PowerUnit = 'watts' | 'ftp'

/**
 * Power fields ("watts", "startWatts", …) are in the workout's PowerUnit.
 * Rides only ever see resolved blocks (see resolveBlocks): steady/ramp in absolute watts.
 */
export type Block =
  | { type: 'steady'; durationS: number; watts: number; label?: string } // label e.g. "Interval 3/5 · on"
  | { type: 'ramp'; durationS: number; startWatts: number; endWatts: number }
  | { type: 'intervals'; repeat: number; onS: number; onWatts: number; offS: number; offWatts: number }

export interface Workout {
  id: number
  name: string
  unit: PowerUnit
  category: WorkoutCategory | null // library workouts and imports get one; own workouts usually null
  blocks: Block[]
  createdAt: string // ISO
  updatedAt: string // ISO
}

export type WorkoutCategory = 'Recovery' | 'Endurance' | 'Tempo' | 'Sweet spot' | 'Threshold' | 'VO2max' | 'Anaerobic' | 'Test'

export interface WorkoutInput {
  id?: number
  name: string
  unit: PowerUnit
  category: WorkoutCategory | null
  blocks: Block[]
}

export type RideMode = 'free' | 'planned'

/** One row per second of moving time. Raw values; null = no data from that device. */
export interface Sample {
  tS: number // moving time in seconds since ride start (pauses excluded)
  power: number | null
  targetPower: number
  cadence: number | null
  hr: number | null
  speed: number | null // km/h, recorded but not shown
}

export interface RideStats {
  durationS: number
  avgPower: number
  maxPower: number
  avgHr: number | null
  maxHr: number | null
  avgCadence: number
  kj: number
}

export interface RideSummary extends RideStats {
  id: number
  startedAt: string // ISO
  endedAt: string | null // ISO; null = unfinished (crash) ride
  mode: RideMode
  workoutId: number | null
  workoutName: string | null
  blocks: Block[] | null // snapshot of the plan at ride start, resolved to absolute watts
  ftp: number | null // FTP setting at ride start
}

export interface NewRide {
  mode: RideMode
  workoutId: number | null
  workoutName: string | null
  blocks: Block[] | null // resolved (absolute watts, no intervals)
  ftp: number | null
}

/** Best average power over a duration within one ride. */
export interface Best {
  durationS: number // one of BEST_DURATIONS
  watts: number
  rideId: number
  date: string // ISO start of that ride
}

export interface WeekStats {
  weekStart: string // ISO date (Monday, local time) e.g. "2026-09-21"
  rides: number
  durationS: number
  kj: number
  distanceKm: number
  zoneS: [number, number, number, number, number, number] // seconds per HR zone; index 0 = no HR / below Z1, 1..5 = Z1..Z5 (current max HR)
}

export interface WorkoutTrendPoint {
  rideId: number
  date: string
  avgPower: number
  avgHr: number
  efficiency: number // avgPower / avgHr (W per bpm) – higher = fitter
}

export interface StatsOverview {
  weeks: WeekStats[] // the last 12 weeks incl. the current one, oldest first, empty weeks included
  bestsAllTime: Best[] // one per BEST_DURATIONS entry that has data
  bests90d: Best[] // same, last 90 days
  ftpEstimate: number | null // round(0.95 × best 20 min of the last 90 days)
  workoutTrends: { workoutId: number; name: string; points: WorkoutTrendPoint[] }[] // workouts with ≥ 2 completed rides with HR, oldest point first
  totals: { rides: number; durationS: number; kj: number; distanceKm: number }
}

/** A device offered by Electron's Bluetooth chooser (select-bluetooth-device). */
export interface BluetoothCandidate {
  id: string
  name: string
}

/** Exposed by the preload script as window.api. */
export interface Api {
  workouts: {
    list(): Promise<Workout[]>
    get(id: number): Promise<Workout | null>
    /** Insert when id is missing, update otherwise. Returns the stored workout. */
    save(w: WorkoutInput): Promise<Workout>
    delete(id: number): Promise<void>
    /** Opens a file dialog (multi-select .zwo), parses and saves them. Returns the imported workouts ([] if cancelled). */
    importZwo(): Promise<{ imported: Workout[]; errors: { file: string; message: string }[] }>
  }
  rides: {
    /** Creates the ride row (endedAt null, stats 0) and returns its id. */
    start(r: NewRide): Promise<number>
    appendSamples(rideId: number, samples: Sample[]): Promise<void>
    finish(rideId: number, stats: RideStats): Promise<void>
    list(): Promise<RideSummary[]> // newest first
    get(id: number): Promise<{ ride: RideSummary; samples: Sample[] } | null>
    delete(id: number): Promise<void> // also deletes samples
  }
  stats: {
    overview(): Promise<StatsOverview>
    /** Durations for which this ride set a new all-time best (e.g. [60, 300]). */
    prs(rideId: number): Promise<number[]>
  }
  settings: {
    get(key: SettingKey): Promise<string | null>
    set(key: SettingKey, value: string): Promise<void>
  }
  bluetooth: {
    /**
     * Fires (repeatedly, growing list) while a navigator.bluetooth.requestDevice() call is pending.
     * Returns an unsubscribe function.
     */
    onCandidates(cb: (devices: BluetoothCandidate[]) => void): () => void
    /** Resolves the pending requestDevice() with this device id; '' cancels it. */
    select(deviceId: string): void
    /**
     * Web Bluetooth's requestDevice() needs a user gesture. Main calls window.__paincaveGesture()
     * in the page via executeJavaScript(code, userGesture = true) and resolves when it settles.
     * Used to reconnect stored devices on app start without a click.
     */
    runWithGesture(): Promise<void>
  }
  /** True when started with PAINCAVE_FAKE=1 (simulated devices). */
  fakeDevices: boolean
}

export type SettingKey =
  | 'maxHr' // default 175
  | 'ftp' // W, default DEFAULT_FTP
  | 'device.trainer' // JSON StoredDevice
  | 'device.controller'
  | 'device.hr'

export interface StoredDevice {
  id: string // Web Bluetooth device id
  name: string
}

export const LIMITS = { minWatts: 50, maxWatts: 1000 } as const
export const FREE_RIDE_START_WATTS = 100
export const DEFAULT_MAX_HR = 175
export const DEFAULT_FTP = 200
export const BEST_DURATIONS = [5, 60, 300, 1200] as const
