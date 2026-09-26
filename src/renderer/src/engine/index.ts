// STUB – implemented by the engine agent. Signatures are the contract.
import type { Api, RideMode, Workout } from '../../../shared/types'
import type { DeviceManager } from '../devices/types'
import type { HrZone, RideController } from './types'

export function createRideController(_opts: {
  devices: DeviceManager
  api: Api
  mode: RideMode
  workout: Workout | null // required when mode === 'planned'
  maxHr: number
}): RideController {
  throw new Error('not implemented')
}

export function hrZone(_bpm: number | null, _maxHr: number): HrZone {
  throw new Error('not implemented')
}

export * from './plan'
export type * from './types'
