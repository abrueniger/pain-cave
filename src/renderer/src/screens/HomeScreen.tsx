// To be restyled per docs/design.md "Home".
import type { Nav } from '../route'

export function HomeScreen({ nav }: { nav: Nav }) {
  return (
    <main className="page">
      <button className="primary xl" onClick={() => nav({ name: 'ride', mode: 'free' })}>Start free ride</button>
    </main>
  )
}
