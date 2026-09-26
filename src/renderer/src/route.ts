export type Route =
  | { name: 'home' }
  | { name: 'devices' }
  | { name: 'workouts' }
  | { name: 'builder'; workoutId: number | null } // null = new workout
  | { name: 'ride'; mode: 'free' }
  | { name: 'ride'; mode: 'planned'; workoutId: number }
  | { name: 'history' }
  | { name: 'rideDetail'; rideId: number }

export type Nav = (r: Route) => void
