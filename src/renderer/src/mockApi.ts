// In-memory Api for previewing the renderer in a plain browser (no Electron, no DB).
import { achievements, gains } from '../../shared/gamification'
import { LIBRARY } from '../../shared/library'
import { overview, prs, rideAgg } from '../../shared/stats'
import { parseZwo } from '../../shared/zwo'
import { DEFAULT_MAX_HR, type Api, type RideSummary, type Sample, type Workout, type WorkoutInput } from '../../shared/types'

const now = () => new Date().toISOString()
const clone = <T>(v: T): T => structuredClone(v)

const workouts = new Map<number, Workout>()
const rides = new Map<number, { ride: RideSummary; samples: Sample[] }>()
const settings = new Map<string, string>()
let nextId = 1

function save(w: WorkoutInput): Workout {
  const old = w.id === undefined ? undefined : workouts.get(w.id)
  const id = old?.id ?? nextId++
  const saved: Workout = {
    id, name: w.name, unit: w.unit, category: w.category, blocks: clone(w.blocks), createdAt: old?.createdAt ?? now(), updatedAt: now()
  }
  workouts.set(id, saved)
  return clone(saved)
}

save({
  name: 'Example',
  unit: 'watts',
  category: null,
  blocks: [
    { type: 'ramp', durationS: 300, startWatts: 100, endWatts: 150 },
    { type: 'steady', durationS: 600, watts: 170 },
    { type: 'steady', durationS: 30, watts: 300 },
    { type: 'steady', durationS: 300, watts: 170 },
    { type: 'ramp', durationS: 300, startWatts: 150, endWatts: 100 }
  ]
})
LIBRARY.forEach(save)

const aggs = () => {
  const maxHr = Number(settings.get('maxHr')) || DEFAULT_MAX_HR
  return [...rides.values()].map(r => rideAgg(r.ride, r.samples, maxHr))
}

// Browser stand-in for the native dialog: a hidden file input
const pickFiles = () =>
  new Promise<File[]>(resolve => {
    const input = Object.assign(document.createElement('input'), { type: 'file', multiple: true, accept: '.zwo' })
    input.onchange = () => resolve([...(input.files ?? [])])
    input.oncancel = () => resolve([])
    input.click()
  })

export const mockApi: Api = {
  workouts: {
    list: async () => clone([...workouts.values()].sort((a, b) => a.name.localeCompare(b.name))),
    get: async id => clone(workouts.get(id) ?? null),
    save: async w => save(w),
    async delete(id) {
      workouts.delete(id)
    },
    async importZwo() {
      const result = { imported: [] as Workout[], errors: [] as { file: string; message: string }[] }
      for (const f of await pickFiles()) {
        try {
          result.imported.push(save(parseZwo(await f.text(), f.name)))
        } catch (err) {
          result.errors.push({ file: f.name, message: err instanceof Error ? err.message : String(err) })
        }
      }
      return result
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
  stats: {
    overview: async () => overview(aggs()),
    prs: async rideId => prs(aggs(), rideId)
  },
  achievements: {
    overview: async () => achievements(aggs(), JSON.parse(settings.get('ftpRecords') ?? '[]'), [...workouts.values()]),
    gains: async rideId => gains(aggs(), rideId, [...workouts.values()])
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
