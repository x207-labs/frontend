import { useReport } from '../api/queries'
import { QueryState } from '../components/QueryState'
import { useSelectedEpoch } from '../epoch'
import { formatCredit, formatPercent } from '../lib/format'

export function Report207() {
  const epoch = useSelectedEpoch()
  const report = useReport(epoch)
  if (epoch === null) return null
  return (
    <QueryState query={report} loadingLabel="Memuat laporan">
      {(data) => (
        <p>
          Terhapus {formatCredit(data.cleared)} credit ({formatPercent(data.clearedRatio)}).
        </p>
      )}
    </QueryState>
  )
}
