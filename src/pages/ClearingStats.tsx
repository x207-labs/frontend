import { useMetrics } from '../api/queries'
import { QueryState } from '../components/QueryState'
import { useSelectedEpoch } from '../epoch'
import { formatNumber } from '../lib/format'

export function ClearingStats() {
  const epoch = useSelectedEpoch()
  const metrics = useMetrics(epoch)
  if (epoch === null) return null
  return (
    <QueryState query={metrics} loadingLabel="Memuat metrik">
      {(data) => <p>Cleared ratio {formatNumber(data.clearedRatio)}.</p>}
    </QueryState>
  )
}
