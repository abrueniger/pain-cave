// In-memory Api for previewing the renderer in a plain browser (no Electron, no DB).
import type { Api, RideSummary, Sample, Workout } from '../../shared/types'

const now = () => new Date().toISOString()
const clone = <T>(v: T): T => structuredClone(v)

const workouts = new Map<number, Workout>()
const rides = new Map<number, { ride: RideSummary; samples: Sample[] }>()
const settings = new Map<string, string>()
let nextId = 1

workouts.set(nextId, {
  id: nextId++,
  name: 'Example',
  blocks: [
    { type: 'ramp', durationS: 300, startWatts: 100, endWatts: 150 },
    { type: 'steady', durationS: 600, watts: 170 },
    { type: 'steady', durationS: 30, watts: 300 },
    { type: 'steady', durationS: 300, watts: 170 },
    { type: 'ramp', durationS: 300, startWatts: 150, endWatts: 100 }
  ],
  createdAt: now(),
  updatedAt: now()
})

export const mockApi: Api = {
  workouts: {
    list: async () => clone([...workouts.values()].sort((a, b) => a.name.localeCompare(b.name))),
    get: async id => clone(workouts.get(id) ?? null),
    async save(w) {
      const old = w.id === undefined ? undefined : workouts.get(w.id)
      const id = old?.id ?? nextId++
      const saved = { id, name: w.name, blocks: clone(w.blocks), createdAt: old?.createdAt ?? now(), updatedAt: now() }
      workouts.set(id, saved)
      return clone(saved)
    },
    async delete(id) {
      workouts.delete(id)
    }
  },
  rides: {
    async start(r) {
      const id = nextId++
      rides.set(id, {
        ride: {
          ...clone(r), id, startedAt: now(), endedAt: null,
          durationS: 0, avgPower: 0, maxPower: 0, avgHr: null, maxHr: null, avgCadence: 0, kj: 0
        },
        samples: []
      })
      return id
    },
    async appendSamples(rideId, samples) {
      rides.get(rideId)?.samples.push(...clone(samples))
    },
    async finish(rideId, stats) {
      const r = rides.get(rideId)
      if (r) r.ride = { ...r.ride, ...stats, endedAt: now() }
    },
    list: async () => clone([...rides.values()].map(r => r.ride).reverse()),
    get: async id => clone(rides.get(id) ?? null),
    async delete(id) {
      rides.delete(id)
    }
  },
  settings: {
    get: async key => settings.get(key) ?? null,
    async set(key, value) {
      settings.set(key, value)
    }
  },
  bluetooth: {
    onCandidates: () => () => {},
    select: () => {},
    async runWithGesture() {
      await (window as { __paincaveGesture?: () => unknown }).__paincaveGesture?.()
    }
  },
  fakeDevices: true
}
