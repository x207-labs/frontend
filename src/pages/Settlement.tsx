import { useEpochSettlements } from '../api/queries'
import { QueryState } from '../components/QueryState'
import { useSelectedEpoch } from '../epoch'
import { formatCredit, shortAccount } from '../lib/format'

export function Settlement() {
  const epoch = useSelectedEpoch()
  const settlements = useEpochSettlements(epoch)
  if (epoch === null) return null
  return (
    <QueryState
      query={settlements}
      loadingLabel="Memuat settlement"
      isEmpty={(d) => d.items.length === 0}
      empty="Tidak ada posisi settlement di epoch ini."
    >
      {(data) => (
        <div className="table-wrap"><table>
          <thead>
            <tr>
              <th scope="col">Anggota</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">Posisi bersih</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.account}>
                <td>{shortAccount(item.account ?? '')}</td>
                <td>{item.status}</td>
                <td className="num">{formatCredit(item.net)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </QueryState>
  )
}
