import { FREE_RIDE_START_WATTS, LIMITS } from '../../../shared/types'
import type { Api, RideMode, RideStats, Sample, Workout } from '../../../shared/types'
import type { DeviceManager, Shift, TrainerData } from '../devices/types'
import { blockAt, planTargetAt, workoutDurationS } from './plan'
import type { HrZone, RideController, RideState, RideView } from './types'

const SHIFT_W: Record<Shift, number> = { leftUp: 50, leftDown: -50, rightUp: 10, rightDown: -10 }
const TRAINER_FRESH_MS = 3000
const HR_FRESH_MS = 5000
const AUTO_PAUSE_MS = 3000
const FLUSH_EVERY = 5

const clamp = (w: number) => Math.min(LIMITS.maxWatts, Math.max(LIMITS.minWatts, Math.round(w)))
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export function hrZone(bpm: number | null, maxHr: number): HrZone {
  if (bpm == null) return 0
  return [50, 60, 70, 80, 90].filter((pct) => bpm * 100 >= maxHr * pct).length as HrZone
}

export function rideStats(samples: Sample[], durationS: number): RideStats {
  const power = samples.flatMap((s) => (s.power == null ? [] : [s.power]))
  const hr = samples.flatMap((s) => (s.hr == null ? [] : [s.hr]))
  const cadence = samples.flatMap((s) => (s.cadence == null ? [] : [s.cadence]))
  const sumPower = power.reduce((a, b) => a + b, 0)
  return {
    durationS,
    avgPower: Math.round(mean(power) ?? 0),
    maxPower: power.length ? Math.max(...power) : 0,
    avgHr: hr.length ? Math.round(mean(hr)!) : null,
    maxHr: hr.length ? Math.max(...hr) : null,
    avgCadence: Math.round(mean(cadence) ?? 0),
    kj: Math.round(sumPower / 100) / 10
  }
}

export function createRideController(opts: {
  devices: DeviceManager
  api: Api
  mode: RideMode
  workout: Workout | null // required when mode === 'planned'
  maxHr: number
}): RideController {
  const { devices, api, mode, maxHr } = opts
  const blocks = mode === 'planned' ? (opts.workout?.blocks ?? []) : null
  const totalS = blocks ? workoutDurationS(blocks) : 0

  let state: RideState = 'ready'
  let rideId: number | null = null
  let elapsedS = 0
  let freeTarget: number = FREE_RIDE_START_WATTS
  let offset = 0
  let sent: number | null = null
  let lastPedalAt = 0
  let trainer: { d: TrainerData; at: number } | null = null
  let hr: { bpm: number; at: number } | null = null
  let powers: { w: number; at: number }[] = []
  const samples: Sample[] = []
  let pending: Sample[] = []
  let flushing: Promise<void> = Promise.resolve()
  let timer: ReturnType<typeof setInterval> | null = null
  const subs = new Set<(v: RideView) => void>()

  const planNow = () => (blocks ? planTargetAt(blocks, elapsedS) : null)
  const target = () => {
    if (!blocks) return freeTarget
    const p = planNow()
    return p == null ? (sent ?? LIMITS.minWatts) : clamp(p + offset)
  }
  const send = (w: number) => {
    sent = w
    devices.setTargetPower(w).catch((e) => console.error('setTargetPower failed', e))
  }
  const release = () => {
    devices.release().catch((e) => console.error('release failed', e))
  }

  const flush = () => {
    if (rideId == null || !pending.length) return flushing
    const id = rideId
    const batch = pending
    pending = []
    flushing = flushing.then(() =>
      api.rides.appendSamples(id, batch).catch((e) => {
        console.error('appendSamples failed', e)
        pending = batch.concat(pending) // retried with the next flush
      })
    )
    return flushing
  }

  let current: RideView
  const buildView = (): RideView => {
    const now = Date.now()
    const fresh = trainer && now - trainer.at < TRAINER_FRESH_MS ? trainer.d : null
    const bpm = hr && now - hr.at < HR_FRESH_MS ? hr.bpm : null
    const p3 = mean(powers.filter((p) => now - p.at < TRAINER_FRESH_MS).map((p) => p.w))
    return {
      state,
      mode,
      workoutName: opts.workout?.name ?? null,
      blocks,
      elapsedS,
      target: target(),
      planTarget: planNow(),
      offset: blocks ? offset : 0,
      power3s: p3 == null ? null : Math.round(p3),
      cadence: fresh ? fresh.cadence : null,
      hr: bpm,
      hrZone: hrZone(bpm, maxHr),
      block: blocks ? blockAt(blocks, elapsedS) : null,
      totalRemainingS: blocks ? Math.max(0, totalS - elapsedS) : null,
      samples: samples.slice(),
      stats: rideStats(samples, elapsedS),
      rideId
    }
  }
  const emit = () => {
    current = buildView()
    subs.forEach((cb) => cb(current))
  }
  current = buildView()

  const tick = () => {
    if (state === 'running') {
      const now = Date.now()
      if (now - lastPedalAt > AUTO_PAUSE_MS) {
        state = 'autoPaused'
        release()
      } else {
        const t = trainer && now - trainer.at < TRAINER_FRESH_MS ? trainer.d : null
        const h = hr && now - hr.at < HR_FRESH_MS ? hr.bpm : null
        const s: Sample = {
          tS: elapsedS,
          power: t?.power ?? null,
          targetPower: target(),
          cadence: t?.cadence ?? null,
          hr: h,
          speed: t?.speedKmh ?? null
        }
        samples.push(s)
        pending.push(s)
        elapsedS += 1
        if (pending.length >= FLUSH_EVERY) void flush()
        if (blocks) {
          if (elapsedS >= totalS) {
            void end()
            return
          }
          if (target() !== sent) send(target())
        }
      }
    }
    emit()
  }

  const offs = [
    devices.on('trainer', (d) => {
      const now = Date.now()
      trainer = { d, at: now }
      powers = powers.filter((p) => now - p.at < TRAINER_FRESH_MS)
      powers.push({ w: d.power, at: now })
      if (d.cadence > 0) {
        lastPedalAt = now
        if (state === 'autoPaused') {
          state = 'running'
          send(target())
          emit()
        }
      }
    }),
    devices.on('hr', (bpm) => {
      hr = { bpm, at: Date.now() }
    }),
    devices.on('shift', (s) => ctrl.shift(SHIFT_W[s]))
  ]

  async function end() {
    if (state === 'ready' || state === 'finished') return
    state = 'finished'
    if (timer) clearInterval(timer)
    timer = null
    release()
    emit()
    await flush()
    if (rideId != null) await api.rides.finish(rideId, rideStats(samples, elapsedS))
  }

  const ctrl: RideController = {
    view: () => current,
    subscribe(cb) {
      subs.add(cb)
      return () => void subs.delete(cb)
    },
    async start() {
      if (state !== 'ready') return
      rideId = await api.rides.start({
        mode,
        workoutId: opts.workout?.id ?? null,
        workoutName: opts.workout?.name ?? null,
        blocks
      })
      state = 'running'
      lastPedalAt = Date.now()
      send(target())
      timer = setInterval(tick, 1000)
      emit()
    },
    pause() {
      if (state !== 'running' && state !== 'autoPaused') return
      state = 'paused'
      release()
      emit()
    },
    resume() {
      if (state !== 'paused' && state !== 'autoPaused') return
      state = 'running'
      lastPedalAt = Date.now()
      send(target())
      emit()
    },
    end,
    async discard() {
      if (rideId != null) await api.rides.delete(rideId)
    },
    shift(delta) {
      if (state === 'finished') return
      if (blocks) {
        const p = planNow()
        if (p == null) return
        offset = clamp(p + offset + delta) - p
      } else {
        freeTarget = clamp(freeTarget + delta)
      }
      if (state === 'running' && target() !== sent) send(target())
      emit()
    },
    dispose() {
      offs.forEach((off) => off())
      if (state !== 'ready' && state !== 'finished') end().catch((e) => console.error('end failed', e))
      if (timer) clearInterval(timer)
      timer = null
      subs.clear()
    }
  }
  return ctrl
}

export * from './plan'
export type * from './types'
