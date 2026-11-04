import { useState } from 'react'
import { useEpochSettlements, useMemberLimits, useMembers } from '../api/queries'
import type { SettlementItem } from '../api/types'
import { QueryState } from '../components/QueryState'
import { useSelectedEpoch } from '../epoch'
import { formatCredit, shortAccount } from '../lib/format'

// Loss order (ADR-18): debtor stake, then the reserve fund, then haircut to direct creditors. The API carries stake and haircut;
// the reserve fund part is the remainder: invoiced - paid - stake - haircut.
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
      <h2>Limit history</h2>
      <label>
        <span>Member</span>
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
        loadingLabel="Loading limit history"
        isEmpty={(d) => d.items.length === 0}
        empty="No limit changes for this member yet."
      >
        {(data) => (
          <div className="table-wrap">
            <table aria-label="Limit history">
              <thead>
                <tr>
                  <th scope="col">Epoch</th>
                  <th scope="col" className="num">Old limit</th>
                  <th scope="col" className="num">New limit</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reason</th>
                  <th scope="col" className="num">Block</th>
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
      <h2>Defaults in epoch {epoch}</h2>
      <p className="state">Loss order: debtor stake, then reserve fund, then haircut to direct creditors with no cascade. The reserve fund is the amount owed minus payments, stake, and haircut.</p>
      <QueryState
        query={defaults}
        loadingLabel="Loading defaults"
        isEmpty={(d) => d.items.length === 0}
        empty="No defaults in this epoch."
      >
        {(data) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col" className="num">Amount owed</th>
                  <th scope="col" className="num">Stake slashed</th>
                  <th scope="col" className="num">Reserve fund</th>
                  <th scope="col" className="num">Direct creditor haircut</th>
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
        loadingLabel="Loading members"
        isEmpty={(d) => d.items.length === 0}
        empty="No members in this circle yet."
      >
        {(data) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Stake</th>
                  <th scope="col" className="num">Limit</th>
                  <th scope="col" className="num">Headroom</th>
                  <th scope="col" className="num">Cash settlement history</th>
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
