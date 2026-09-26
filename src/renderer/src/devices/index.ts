// The app-wide DeviceManager: simulated when window.api.fakeDevices, Bluetooth otherwise.
import { api } from '../api'
import { createBluetoothManager } from './bluetooth'
import { createFakeManager } from './fake'
import type { DeviceManager } from './types'

export const devices: DeviceManager = api.fakeDevices ? createFakeManager() : createBluetoothManager()

export type * from './types'
