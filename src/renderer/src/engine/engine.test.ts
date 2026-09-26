import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Api, Block, Sample, Workout } from '../../../shared/types'
import type { DeviceEvents, DeviceManager, TrainerData } from '../devices/types'
import { blockAt, createRideController, hrZone, planTargetAt } from './index'

const blocks: Block[] = [
  { type: 'steady', durationS: 10, watts: 150 },
  { type: 'ramp', durationS: 10, startWatts: 100, endWatts: 200 }
]

describe('plan', () => {
  it('computes steady, ramp and end', () => {
    expect(planTargetAt(blocks, 0)).toBe(150)
    expect(planTargetAt(blocks, 9)).toBe(150)
    expect(planTargetAt(blocks, 10)).toBe(100)
    expect(planTargetAt(blocks, 15)).toBe(150)
    expect(planTargetAt(blocks, 19)).toBe(190)
    expect(planTargetAt(blocks, 20)).toBeNull()
    expect(planTargetAt([{ type: 'ramp', durationS: 3, startWatts: 100, endWatts: 101 }], 1)).toBe(100)
  })

  it('reports the block position', () => {
    expect(blockAt(blocks, 4)).toEqual({ index: 0, count: 2, block: blocks[0], remainingS: 6, next: blocks[1] })
    expect(blockAt(blocks, 10)).toMatchObject({ index: 1, remainingS: 10, next: null })
    expect(blockAt(blocks, 20)).toBeNull()
  })
})

describe('hrZone', () => {
  it('uses % of max HR (175)', () => {
    const z = (bpm: number | null) => hrZone(bpm, 175)
    expect([z(null), z(87), z(88), z(104), z(105), z(122), z(123), z(139), z(140), z(157), z(158), z(200)]).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5
    ])
  })
})

function setup(mode: 'free' | 'planned', b: Block[] = blocks) {
  const handlers: { [E in keyof DeviceEvents]?: DeviceEvents[E][] } = {}
  const devices = {
    on(e: keyof DeviceEvents, cb: never) {
      ;(handlers[e] ??= [] as never[]).push(cb)
      return () => {}
    },
    setTargetPower: vi.fn(async () => {}),
    release: vi.fn(async () => {})
  } as unknown as DeviceManager & { setTargetPower: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }
  const stored: Sample[] = []
  const rides = {
    start: vi.fn(async () => 7),
    appendSamples: vi.fn(async (_id: number, s: Sample[]) => void stored.push(...s)),
    finish: vi.fn(async () => {}),
    delete: vi.fn(async () => {})
  }
  const api = { rides } as unknown as Api
  const workout: Workout | null = mode === 'planned' ? { id: 1, name: 'W', blocks: b, createdAt: '', updatedAt: '' } : null
  const ctrl = createRideController({ devices, api, mode, workout, maxHr: 175 })
  const emit = <E extends keyof DeviceEvents>(e: E, ...args: Parameters<DeviceEvents[E]>) =>
    handlers[e]?.forEach((cb) => (cb as (...a: unknown[]) => void)(...args))
  const pedal = (d: Partial<TrainerData> = {}) => emit('trainer', { power: 200, cadence: 90, speedKmh: 30, ...d })
  // advance n seconds, delivering a trainer reading before every tick
  const ride = async (n: number, d: Partial<TrainerData> = {}) => {
    for (let i = 0; i < n; i++) {
      pedal(d)
      await vi.advanceTimersByTimeAsync(1000)
    }
  }
  const lastSent = () => devices.setTargetPower.mock.calls.at(-1)?.[0]
  return { ctrl, devices, rides, stored, emit, pedal, ride, lastSent }
}

describe('ride controller', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  it('free ride: starts at 100 W and clamps shifts to 50..1000', async () => {
    const { ctrl, emit, lastSent, rides } = setup('free')
    await ctrl.start()
    expect(rides.start).toHaveBeenCalledWith({ mode: 'free', workoutId: null, workoutName: null, blocks: null })
    expect(lastSent()).toBe(100)
    emit('shift', 'leftDown')
    expect(ctrl.view().target).toBe(50)
    emit('shift', 'rightDown')
    expect(ctrl.view().target).toBe(50)
    for (let i = 0; i < 25; i++) emit('shift', 'leftUp')
    expect(ctrl.view().target).toBe(1000)
    expect(lastSent()).toBe(1000)
    emit('shift', 'rightDown')
    expect(lastSent()).toBe(990)
  })

  it('planned: offset is carried into later blocks', async () => {
    const { ctrl, emit, ride, lastSent } = setup('planned')
    await ctrl.start()
    expect(lastSent()).toBe(150)
    emit('shift', 'rightUp')
    emit('shift', 'rightUp')
    expect(ctrl.view()).toMatchObject({ target: 170, planTarget: 150, offset: 20 })
    await ride(15)
    expect(ctrl.view()).toMatchObject({ elapsedS: 15, target: 170, planTarget: 150, offset: 20 })
    expect(lastSent()).toBe(170)
    expect(ctrl.view().block).toMatchObject({ index: 1, remainingS: 5 })
  })

  it('auto-pauses after >3 s without cadence and resumes on pedaling', async () => {
    const { ctrl, devices, ride, pedal, lastSent } = setup('free')
    await ctrl.start()
    await ride(2)
    await ride(4, { cadence: 0, power: 0 })
    expect(ctrl.view().state).toBe('autoPaused')
    expect(devices.release).toHaveBeenCalled()
    const t = ctrl.view().elapsedS
    await vi.advanceTimersByTimeAsync(5000)
    expect(ctrl.view().elapsedS).toBe(t)
    devices.setTargetPower.mockClear()
    pedal()
    expect(ctrl.view().state).toBe('running')
    expect(lastSent()).toBe(100)
    await ride(2)
    expect(ctrl.view().elapsedS).toBe(t + 2)
  })

  it('auto-pauses before the first pedal stroke', async () => {
    const { ctrl } = setup('free')
    await ctrl.start()
    await vi.advanceTimersByTimeAsync(5000)
    expect(ctrl.view().state).toBe('autoPaused')
  })

  it('manual pause is not ended by pedaling, only by resume()', async () => {
    const { ctrl, ride, devices } = setup('free')
    await ctrl.start()
    await ride(2)
    ctrl.pause()
    expect(devices.release).toHaveBeenCalled()
    ctrl.shift(10)
    devices.setTargetPower.mockClear()
    await ride(5)
    expect(ctrl.view()).toMatchObject({ state: 'paused', elapsedS: 2, target: 110 })
    expect(devices.setTargetPower).not.toHaveBeenCalled()
    ctrl.resume()
    expect(ctrl.view().state).toBe('running')
    expect(devices.setTargetPower).toHaveBeenCalledWith(110)
  })

  it('planned: sends ramp targets and ends after the last block', async () => {
    const { ctrl, ride, rides, stored, devices } = setup('planned')
    await ctrl.start()
    await ride(12)
    expect(devices.setTargetPower.mock.calls.map((c) => c[0])).toEqual([150, 100, 110, 120])
    await ride(8)
    expect(ctrl.view().state).toBe('finished')
    expect(stored).toHaveLength(20)
    expect(stored.map((s) => s.tS)).toEqual([...Array(20).keys()])
    expect(stored[15].targetPower).toBe(150)
    expect(rides.finish).toHaveBeenCalledWith(7, expect.objectContaining({ durationS: 20 }))
  })

  it('flushes samples every 5 s and computes stats', async () => {
    const { ctrl, ride, emit, rides, stored } = setup('free')
    await ctrl.start()
    await ride(2, { power: 100, cadence: 80 })
    emit('hr', 120)
    await ride(3, { power: 300, cadence: 100 })
    expect(rides.appendSamples).toHaveBeenCalledTimes(1)
    expect(stored).toHaveLength(5)
    await ride(1, { power: 200 })
    await ctrl.end()
    expect(stored).toHaveLength(6)
    const stats = { durationS: 6, avgPower: 217, maxPower: 300, avgHr: 120, maxHr: 120, avgCadence: 92, kj: 1.3 }
    expect(ctrl.view().stats).toEqual(stats)
    expect(rides.finish).toHaveBeenCalledWith(7, stats)
    expect(ctrl.view().power3s).toBe(250)
    await ctrl.discard()
    expect(rides.delete).toHaveBeenCalledWith(7)
  })
})
