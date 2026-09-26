// Contract between the device layer (Bluetooth or fake) and the rest of the renderer.

export type DeviceKind = 'trainer' | 'controller' | 'hr'
export type DeviceStatus = 'none' | 'searching' | 'connected' // none = not configured / not found

export interface TrainerData {
  power: number // W
  cadence: number // rpm
  speedKmh: number
}

export type Shift = 'leftUp' | 'leftDown' | 'rightUp' | 'rightDown'

export interface DeviceEvents {
  status: (kind: DeviceKind, status: DeviceStatus, name: string | null) => void
  trainer: (d: TrainerData) => void // ~1 Hz
  hr: (bpm: number) => void
  shift: (s: Shift) => void // one event per button press (edge), not per repeat frame
}

export interface DeviceManager {
  status(kind: DeviceKind): { status: DeviceStatus; name: string | null }
  on<E extends keyof DeviceEvents>(event: E, cb: DeviceEvents[E]): () => void

  /**
   * Must be called from a user gesture (click). Opens Electron's chooser flow
   * (candidates are shown via window.api.bluetooth.onCandidates), connects the
   * chosen device and stores it in settings as device.<kind>.
   */
  pair(kind: DeviceKind): Promise<void>
  /** The user's pick from the candidate list during pair(); '' cancels. Remembers the id for auto-reconnect. */
  choose(candidateId: string): void
  /** Connect all stored devices without user interaction; keeps retrying/reconnecting in the background. */
  connectStored(): Promise<void>
  forget(kind: DeviceKind): Promise<void>

  /** ERG target. Clamping is the caller's job. Resumes the trainer if it was released. */
  setTargetPower(watts: number): Promise<void>
  /** Minimum resistance while paused (FTMS stop/pause). Next setTargetPower resumes ERG. */
  release(): Promise<void>
}
