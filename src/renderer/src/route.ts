export type Route =
  | { name: 'home' }
  | { name: 'devices' }
  | { name: 'workouts' }
  | { name: 'builder'; workoutId: number | null } // null = new workout
  | { name: 'ride'; mode: 'free' }
  | { name: 'ride'; mode: 'planned'; workoutId: number }
  | { name: 'history' }
  | { name: 'progress' } // analytics across rides
  | { name: 'achievements' } // level, milestones, records, specials
  | { name: 'rideDetail'; rideId: number }

export type Nav = (r: Route) => void

let leaveGuard: ((to: Route) => boolean) | null = null
/** A screen with unsaved work blocks navigation: the guard returns true to stay (and asks the user itself). */
export const setLeaveGuard = (g: ((to: Route) => boolean) | null) => {
  leaveGuard = g
}
export const guardNav = (nav: Nav): Nav => (to) => {
  if (!leaveGuard?.(to)) nav(to)
}
