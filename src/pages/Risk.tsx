import { useMembers } from '../api/queries'
import { QueryState } from '../components/QueryState'
import { formatCredit, shortAccount } from '../lib/format'

export function Risk() {
  const members = useMembers()
  return (
    <QueryState
      query={members}
      loadingLabel="Memuat anggota"
      isEmpty={(d) => d.items.length === 0}
      empty="Belum ada anggota di lingkaran ini."
    >
      {(data) => (
        <div className="table-wrap"><table>
          <thead>
            <tr>
              <th scope="col">Anggota</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">Stake</th>
              <th scope="col" className="num">Limit</th>
              <th scope="col" className="num">Headroom</th>
              <th scope="col" className="num">Riwayat lunas tunai</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((m) => (
              <tr key={m.account}>
                <td>{shortAccount(m.account)}</td>
                <td>{m.status}</td>
                <td className="num">{formatCredit(m.stake)}</td>
                <td className="num">{formatCredit(m.limit)}</td>
                <td className="num">{formatCredit(m.headroom)}</td>
                <td className="num">{formatCredit(m.settledHistory)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </QueryState>
  )
}
