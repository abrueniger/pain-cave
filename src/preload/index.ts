import { contextBridge, ipcRenderer } from 'electron'
import type { Api, BluetoothCandidate } from '../shared/types'

const invoke = (channel: string) => (...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const api: Api = {
  workouts: {
    list: invoke('workouts:list'),
    get: invoke('workouts:get'),
    save: invoke('workouts:save'),
    delete: invoke('workouts:delete'),
    importZwo: invoke('workouts:importZwo')
  },
  rides: {
    start: invoke('rides:start'),
    appendSamples: invoke('rides:appendSamples'),
    finish: invoke('rides:finish'),
    list: invoke('rides:list'),
    get: invoke('rides:get'),
    delete: invoke('rides:delete')
  },
  stats: {
    overview: invoke('stats:overview'),
    prs: invoke('stats:prs')
  },
  achievements: {
    overview: invoke('achievements:overview'),
    gains: invoke('achievements:gains')
  },
  settings: {
    get: invoke('settings:get'),
    set: invoke('settings:set')
  },
  bluetooth: {
    onCandidates(cb) {
      const listener = (_e: unknown, devices: BluetoothCandidate[]) => cb(devices)
      ipcRenderer.on('bt:candidates', listener)
      return () => {
        ipcRenderer.removeListener('bt:candidates', listener)
      }
    },
    select: id => ipcRenderer.send('bt:select', id),
    runWithGesture: invoke('bt:gesture')
  },
  fakeDevices: process.env.PAINCAVE_FAKE === '1',
  platform: process.platform
}

contextBridge.exposeInMainWorld('api', api)
