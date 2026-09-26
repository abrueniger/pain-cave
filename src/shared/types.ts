// Contracts shared by main, preload and renderer. Change with care: every module builds on these.

export type Block =
  | { type: 'steady'; durationS: number; watts: number }
  | { type: 'ramp'; durationS: number; startWatts: number; endWatts: number }

export interface Workout {
  id: number
  name: string
  blocks: Block[]
  createdAt: string // ISO
  updatedAt: string // ISO
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
  blocks: Block[] | null // snapshot of the plan at ride start
}

export interface NewRide {
  mode: RideMode
  workoutId: number | null
  workoutName: string | null
  blocks: Block[] | null
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
    save(w: { id?: number; name: string; blocks: Block[] }): Promise<Workout>
    delete(id: number): Promise<void>
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
