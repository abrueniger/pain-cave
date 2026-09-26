// STUB – implemented by the ride-UI agent. Props are the contract.
import type { Block, Sample } from '../../../shared/types'

export interface RideChartProps {
  blocks: Block[] | null // planned: whole profile in the background; null = free ride
  samples: Sample[] // actual power, HR and (free ride) target step line
  positionS?: number // vertical "now" line; omit for static charts
  offset?: number // planned: dashed plan+offset line from positionS on
  height?: number // px, default 220
}

export function RideChart(_props: RideChartProps) {
  return <div className="stub">RideChart</div>
}
