// Classic workouts seeded into every database (% FTP).
import type { Block, WorkoutCategory, WorkoutInput } from './types'

const wu: Block = { type: 'ramp', durationS: 600, startWatts: 45, endWatts: 75 }
const cd: Block = { type: 'ramp', durationS: 480, startWatts: 65, endWatts: 45 }
const steady = (min: number, pct: number): Block => ({ type: 'steady', durationS: min * 60, watts: pct })
const reps = (repeat: number, onS: number, onWatts: number, offS: number, offWatts: number): Block =>
  ({ type: 'intervals', repeat, onS, onWatts, offS, offWatts })
const w = (name: string, category: WorkoutCategory, main: Block[], warm = wu, cool = cd): WorkoutInput =>
  ({ name, unit: 'ftp', category, blocks: [warm, ...main, cool] })
const sets = (n: number, set: Block, recMin: number) =>
  Array.from({ length: n }, (_, i) => (i < n - 1 ? [set, steady(recMin, 50)] : [set])).flat()

export const LIBRARY: WorkoutInput[] = [
  w('Recovery spin', 'Recovery', [steady(17, 55)],
    { type: 'ramp', durationS: 480, startWatts: 40, endWatts: 55 }, { type: 'ramp', durationS: 300, startWatts: 55, endWatts: 40 }),
  w('Endurance 60', 'Endurance', [steady(42, 68)]),
  w('Endurance 90', 'Endurance', [steady(72, 68)]),
  w('Tempo 2×15', 'Tempo', [reps(2, 900, 83, 300, 55)]),
  w('Sweet spot 3×10', 'Sweet spot', [reps(3, 600, 90, 300, 55)]),
  w('Sweet spot 2×20', 'Sweet spot', [reps(2, 1200, 90, 300, 55)]),
  w('Over-unders 3×9', 'Threshold', sets(3, reps(3, 120, 95, 60, 105), 5)),
  w('Threshold 2×20', 'Threshold', [reps(2, 1200, 98, 300, 55)]),
  w('Threshold 4×8', 'Threshold', [reps(4, 480, 105, 240, 55)]),
  w('Pyramid', 'Threshold', [75, 85, 95, 105, 115, 105, 95, 85, 75].map(p => steady(3, p))),
  w('VO2max 5×3', 'VO2max', [reps(5, 180, 115, 180, 50)]),
  w('VO2max 30/30s', 'VO2max', sets(3, reps(8, 30, 120, 30, 50), 5)),
  w('Tabata 8×20/10', 'Anaerobic', sets(2, reps(8, 20, 170, 10, 40), 5)),
  w('Anaerobic 6×1', 'Anaerobic', [reps(6, 60, 130, 180, 50)]),
  // 1-min steps +6 % from 60 % up to 150 %: ride until you can't hold it, then end the ride
  w('Ramp test', 'Test', Array.from({ length: 16 }, (_, i) => ({ type: 'steady', durationS: 60, watts: 60 + 6 * i, label: `Step ${i + 1}` }) as Block),
    { type: 'ramp', durationS: 600, startWatts: 45, endWatts: 60 }, { type: 'ramp', durationS: 300, startWatts: 55, endWatts: 40 })
]
