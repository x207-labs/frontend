import { useParams } from '../api/queries'
import { QueryState } from '../components/QueryState'

export function Governance() {
  const params = useParams()
  return (
    <QueryState query={params} loadingLabel="Memuat parameter">
      {(data) => <p>Parameter aktif di epoch {data.currentEpoch}.</p>}
    </QueryState>
  )
}
