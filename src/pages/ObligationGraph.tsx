import { useObligations } from '../api/queries'
import { QueryState } from '../components/QueryState'
import { useSelectedEpoch } from '../epoch'
import { formatCredit } from '../lib/format'

export function ObligationGraph() {
  const epoch = useSelectedEpoch()
  const obligations = useObligations(epoch, 'live')
  if (epoch === null) return null
  return (
    <QueryState
      query={obligations}
      loadingLabel="Memuat kewajiban"
      isEmpty={(d) => d.edges.length === 0}
      empty="Belum ada kewajiban terdaftar di epoch ini."
    >
      {(data) => (
        <p>
          {data.edgeCount} kewajiban senilai {formatCredit(data.totalObligation)} credit.
        </p>
      )}
    </QueryState>
  )
}
