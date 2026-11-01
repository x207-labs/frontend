import { useEpochSettlements, useMembers } from '../api/queries'
import { QueryState } from '../components/QueryState'
import { useSelectedEpoch } from '../epoch'
import { formatCredit, shortAccount } from '../lib/format'

function Defaults() {
  const epoch = useSelectedEpoch()
  const defaults = useEpochSettlements(epoch, 'defaulted')
  if (epoch === null) return null
  return (
    <>
      <h2>Default di epoch {epoch}</h2>
      <QueryState
        query={defaults}
        loadingLabel="Memuat default"
        isEmpty={(d) => d.items.length === 0}
        empty="Tidak ada default di epoch ini."
      >
        {(data) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Anggota</th>
                  <th scope="col" className="num">Tagihan</th>
                  <th scope="col" className="num">Potongan stake</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.account}>
                    <td>{shortAccount(item.account ?? '')}</td>
                    <td className="num">{formatCredit(item.amount)}</td>
                    <td className="num">{formatCredit(item.stakeSlashed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
    </>
  )
}

export function Risk() {
  const members = useMembers()
  return (
    <>
      <QueryState
        query={members}
        loadingLabel="Memuat anggota"
        isEmpty={(d) => d.items.length === 0}
        empty="Belum ada anggota di lingkaran ini."
      >
        {(data) => (
          <div className="table-wrap">
            <table>
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
                    <td>
                      <span className={m.status === 'suspended' ? 'member-suspended' : undefined}>{m.status}</span>
                    </td>
                    <td className="num">{formatCredit(m.stake)}</td>
                    <td className="num">{formatCredit(m.limit)}</td>
                    <td className="num">{formatCredit(m.headroom)}</td>
                    <td className="num">{formatCredit(m.settledHistory)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
      <Defaults />
    </>
  )
}
