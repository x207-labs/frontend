import { useState } from 'react'
import { useEpochSettlements, useMemberLimits, useMembers } from '../api/queries'
import type { SettlementItem } from '../api/types'
import { QueryState } from '../components/QueryState'
import { useSelectedEpoch } from '../epoch'
import { formatCredit, shortAccount } from '../lib/format'

// Urutan kerugian (ADR-18): stake debtor, lalu dana cadangan, lalu haircut ke kreditor langsung. API memuat stake dan haircut;
// bagian dana cadangan adalah sisanya: tagihan - dibayar - stake - haircut.
export function lossAllocation(item: Pick<SettlementItem, 'amount' | 'paidAmount' | 'stakeSlashed' | 'haircut'>) {
  const owed = BigInt(item.amount) - BigInt(item.paidAmount ?? '0')
  const stake = BigInt(item.stakeSlashed ?? '0')
  const haircut = BigInt(item.haircut ?? '0')
  const reserve = owed - stake - haircut
  return { owed, stake, haircut, reserve: reserve > 0n ? reserve : 0n }
}

function LimitHistory() {
  const members = useMembers()
  const [chosen, setChosen] = useState('')
  const account = chosen || members.data?.items[0]?.account || null
  const history = useMemberLimits(account)
  if (!members.data || members.data.items.length === 0) return null
  return (
    <>
      <h2>Riwayat limit</h2>
      <label>
        <span>Anggota</span>
        <select value={account ?? ''} onChange={(e) => setChosen(e.target.value)}>
          {members.data.items.map((m) => (
            <option key={m.account} value={m.account}>
              {m.account}
            </option>
          ))}
        </select>
      </label>
      <QueryState
        query={history}
        loadingLabel="Memuat riwayat limit"
        isEmpty={(d) => d.items.length === 0}
        empty="Belum ada perubahan limit untuk anggota ini."
      >
        {(data) => (
          <div className="table-wrap">
            <table aria-label="Riwayat limit">
              <thead>
                <tr>
                  <th scope="col">Epoch</th>
                  <th scope="col" className="num">Limit lama</th>
                  <th scope="col" className="num">Limit baru</th>
                  <th scope="col">Status</th>
                  <th scope="col">Alasan</th>
                  <th scope="col" className="num">Blok</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={`${item.blockHeight}-${item.epoch}`}>
                    <td>{item.epoch ?? '-'}</td>
                    <td className="num">{formatCredit(item.oldLimit)}</td>
                    <td className="num">{formatCredit(item.newLimit)}</td>
                    <td>{item.status}</td>
                    <td>
                      <code className="plain">{item.reason}</code>
                    </td>
                    <td className="num">{item.blockHeight}</td>
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

function Defaults() {
  const epoch = useSelectedEpoch()
  const defaults = useEpochSettlements(epoch, 'defaulted')
  if (epoch === null) return null
  return (
    <>
      <h2>Default di epoch {epoch}</h2>
      <p className="state">Urutan kerugian: stake debtor, dana cadangan, lalu haircut ke kreditor langsung tanpa kaskade. Dana cadangan dihitung dari tagihan dikurangi pembayaran, stake, dan haircut.</p>
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
                  <th scope="col" className="num">Dana cadangan</th>
                  <th scope="col" className="num">Haircut kreditor langsung</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const loss = lossAllocation(item)
                  return (
                    <tr key={item.account}>
                      <td>{shortAccount(item.account ?? '')}</td>
                      <td className="num">{formatCredit(item.amount)}</td>
                      <td className="num">{formatCredit(item.stakeSlashed)}</td>
                      <td className="num">{formatCredit(loss.reserve.toString())}</td>
                      <td className="num">{formatCredit(loss.haircut.toString())}</td>
                    </tr>
                  )
                })}
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
      <LimitHistory />
      <Defaults />
    </>
  )
}
