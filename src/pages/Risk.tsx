import { useState } from 'react'
import { useEpochSettlements, useMemberLimits, useMembers } from '../api/queries'
import type { Member, SettlementItem } from '../api/types'
import { EvmBadge } from '../components/EvmBadge'
import { QueryState } from '../components/QueryState'
import { SortableTable, type Column } from '../components/SortableTable'
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

/** FE-042: a member that has not been admitted (`pending`) has no stake, limit or history, and the contract cannot remove it; the risk views list admitted members only. */
const admitted = <T extends { status: string }>(items: T[]): T[] => items.filter((m) => m.status !== 'pending')

// FE-057: the member table can be filtered and sorted on what the reader sees.
const MEMBER_COLUMNS: Column<Member>[] = [
  { key: 'member', label: 'Member', sortValue: (m) => m.account },
  { key: 'status', label: 'Status', sortValue: (m) => m.status },
  { key: 'stake', label: 'Stake', className: 'num', sortValue: (m) => BigInt(m.stake) },
  { key: 'limit', label: 'Limit', className: 'num', sortValue: (m) => BigInt(m.limit) },
  { key: 'headroom', label: 'Headroom', className: 'num', sortValue: (m) => BigInt(m.headroom) },
  { key: 'history', label: 'Cash settlement history', className: 'num', sortValue: (m) => BigInt(m.settledHistory) },
]
const memberText = (m: Member) => `${m.account} ${m.status}`

function LimitHistory() {
  const members = useMembers()
  const [chosen, setChosen] = useState('')
  const list = admitted(members.data?.items ?? [])
  const account = chosen || list[0]?.account || null
  const history = useMemberLimits(account)
  if (list.length === 0) return null
  return (
    <section className="risk-block" aria-labelledby="risk-limits">
      <div className="risk-head">
        <h2 id="risk-limits">Limit history</h2>
        <p>Every change to one member's credit limit, newest first.</p>
      </div>
      <label className="risk-pick">
        <span>Member</span>
        <select value={account ?? ''} onChange={(e) => setChosen(e.target.value)}>
          {list.map((m) => (
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
                    <td>{item.epoch ?? <span className="soft">No epoch</span>}</td>
                    <td className="num">{formatCredit(item.oldLimit)}</td>
                    <td className="num">{formatCredit(item.newLimit)}</td>
                    <td>
                      <span className="pill" data-tone={MEMBER_TONE[item.status] ?? 'info'}>{item.status}</span>
                    </td>
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
    </section>
  )
}

// FE-090: the loss order as the three steps it is, in the order a loss is absorbed.
const LOSS_ORDER: Array<[string, string]> = [
  ['Debtor stake', 'The member who did not pay loses stake first.'],
  ['Reserve fund', 'Covers what is left: owed minus payments, stake, and haircut.'],
  ['Haircut to direct creditors', 'Only the members owed by the debtor, with no cascade.'],
]

function Defaults() {
  const epoch = useSelectedEpoch()
  const defaults = useEpochSettlements(epoch, 'defaulted')
  if (epoch === null) return null
  return (
    <section className="risk-block" aria-labelledby="risk-defaults">
      <div className="risk-head">
        <h2 id="risk-defaults">Defaults in epoch {epoch}</h2>
        <p>Who did not pay, and who covered the loss. A loss is covered in this order:</p>
      </div>
      <ol className="loss-order" aria-label="Loss order">
        {LOSS_ORDER.map(([name, note], i) => (
          <li key={name}>
            <span className="loss-n" aria-hidden="true">{i + 1}</span>
            <span className="loss-text">
              <strong>{name}</strong>
              <span>{note}</span>
            </span>
          </li>
        ))}
      </ol>
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
    </section>
  )
}

const MEMBER_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'info'> = { active: 'ok', suspended: 'bad', exited: 'warn' }

/** Headroom as a share of the limit: a thin bar beside the number, so a member close to the limit stands out. */
function Headroom({ m }: { m: Member }) {
  const limit = BigInt(m.limit)
  const pct = limit > 0n ? Number((BigInt(m.headroom) * 100n) / limit) : 0
  return (
    <span className="risk-room">
      <span className="risk-meter" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} data-low={pct < 25 ? '' : undefined} />
      </span>
      {formatCredit(m.headroom)}
    </span>
  )
}

export function Risk() {
  const members = useMembers()
  // FE-090: three blocks with room between them: the members, one member's limit history, and the defaults of the epoch.
  return (
    <div className="risk">
      <section className="risk-block" aria-labelledby="risk-members">
        <div className="risk-head">
          <h2 id="risk-members">Members</h2>
          <p>Stake backs each member's credit. Headroom is what the member can still owe.</p>
        </div>
        <QueryState
          query={members}
          loadingLabel="Loading members"
          isEmpty={(d) => admitted(d.items).length === 0}
          empty="No admitted members in this circle yet."
        >
          {(data) => (
            <SortableTable
              label="Members"
              filterLabel="Filter the members shown"
              rows={admitted(data.items)}
              columns={MEMBER_COLUMNS}
              searchText={memberText}
              renderRow={(m) => (
                <tr key={m.account}>
                  <td>
                    <span title={m.account}>{shortAccount(m.account)}</span>
                    <EvmBadge account={m.account} />
                  </td>
                  <td>
                    <span className="pill" data-tone={MEMBER_TONE[m.status] ?? 'info'}>{m.status}</span>
                  </td>
                  <td className="num">{formatCredit(m.stake)}</td>
                  <td className="num">{formatCredit(m.limit)}</td>
                  <td className="num">
                    <Headroom m={m} />
                  </td>
                  <td className="num">{formatCredit(m.settledHistory)}</td>
                </tr>
              )}
            />
          )}
        </QueryState>
      </section>
      <LimitHistory />
      <Defaults />
    </div>
  )
}
