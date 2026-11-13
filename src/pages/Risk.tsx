import { useState } from 'react'
import { CircleLogo } from '../components/CircleLogo'
import { useEpochSettlements, useMemberLimits, useMembers } from '../api/queries'
import type { Member, SettlementItem } from '../api/types'
import { EvmBadge } from '../components/EvmBadge'
import { MemberBadge } from '../components/MemberBadge'
import { QueryState } from '../components/QueryState'
import { SortableTable, type Column } from '../components/SortableTable'
import { CIRCLE } from '../config'
import { Kpi, StatusBadge } from '../ds/components'
import { useEpochSelection, useSelectedEpoch } from '../epoch'
import { formatCredit2, formatNumber, shortAccount } from '../lib/format'
import { Mascot } from '../components/Mascot'
import { MONEY } from '../lib/network'

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

const phaseWord = (phase: string): string => phase.replace(/_/g, ' ')
const total = (items: Member[], key: 'stake' | 'limit' | 'headroom'): bigint => items.reduce((sum, m) => sum + BigInt(m[key]), 0n)

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
    <section className="ep-section" aria-labelledby="risk-limits">
      <h2 id="risk-limits" className="ep-h2">Limit history</h2>
      <p className="ep-sechint">Every change to one member's credit limit, newest first. Amounts in credit.</p>
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
          <div className="table-wrap ep-table ep-cards">
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
                    <td data-label="Epoch">{item.epoch ?? <span className="soft">No epoch</span>}</td>
                    <td className="num" data-label="Old limit">{formatCredit2(item.oldLimit)}</td>
                    <td className="num" data-label="New limit">{formatCredit2(item.newLimit)}</td>
                    <td data-label="Status">
                      <MemberBadge status={item.status} />
                    </td>
                    <td data-label="Reason">
                      <code className="plain">{item.reason}</code>
                    </td>
                    <td className="num" data-label="Block">{item.blockHeight}</td>
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
    <section className="ep-section" aria-labelledby="risk-defaults">
      <h2 id="risk-defaults" className="ep-h2">Defaults in epoch {epoch}</h2>
      <p className="ep-sechint">Who did not pay, and who covered the loss. Amounts in credit. A loss is covered in this order:</p>
      <ol className="loss-order" aria-label="Loss order">
        {LOSS_ORDER.map(([name, note], i) => (
          <li key={name}>
            <span className="loss-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
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
          <div className="table-wrap ep-table ep-cards">
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
                      <td data-label="Member" data-title>{shortAccount(item.account ?? '')}</td>
                      <td className="num" data-label="Amount owed">{formatCredit2(item.amount)}</td>
                      <td className="num" data-label="Stake slashed">{formatCredit2(item.stakeSlashed)}</td>
                      <td className="num" data-label="Reserve fund">{formatCredit2(loss.reserve.toString())}</td>
                      <td className="num" data-label="Direct creditor haircut">{formatCredit2(loss.haircut.toString())}</td>
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

/** Headroom as a share of the limit: a thin bar beside the number. Under a quarter the bar turns amber and the word "low" stands beside the number, so it is never colour alone. */
function Headroom({ m }: { m: Member }) {
  const limit = BigInt(m.limit)
  const pct = limit > 0n ? Number((BigInt(m.headroom) * 100n) / limit) : 0
  const low = pct < 25
  return (
    <span className="risk-room">
      <span className="risk-meter" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} data-low={low ? '' : undefined} />
      </span>
      {formatCredit2(m.headroom)}
      {low && limit > 0n && <span className="risk-low">low</span>}
    </span>
  )
}

/** The one sentence under the title, with the real numbers: who stands behind the credit, and whether anyone defaulted in the epoch. */
function ledeOf(members: number, stake: bigint, epoch: number | null, defaulted: number | null): string {
  // v6.4 (KISS): two short facts, to the point
  const base = `${formatCredit2(stake.toString())} ${MONEY} staked by ${formatNumber(members, 0)} ${members === 1 ? 'member' : 'members'}.`
  if (epoch === null || defaulted === null) return base
  return `${base} ${defaulted === 0 ? 'No defaults' : `${formatNumber(defaulted, 0)} ${defaulted === 1 ? 'default' : 'defaults'}`} in epoch ${epoch}.`
}

export function Risk() {
  const epoch = useSelectedEpoch()
  const selected = useEpochSelection().selected
  const members = useMembers()
  const defaults = useEpochSettlements(epoch, 'defaulted')
  const list = admitted(members.data?.items ?? [])
  const ready = members.data !== undefined && list.length > 0
  const defaulted = epoch === null || defaults.data === undefined ? null : defaults.data.items.length
  const unpaid = (defaults.data?.items ?? []).reduce((sum, item) => sum + lossAllocation(item).owed, 0n)
  // FE-090: three blocks with room between them: the members, one member's limit history, and the defaults of the epoch.
  // v4: a statement first (the sentence and the figures), then the three blocks.
  return (
    <div className="risk ep cl">
      <header className="ep-head">
        <p className="ep-eyebrow">
          <CircleLogo />
          {CIRCLE}
          {epoch !== null ? ` · epoch ${epoch}` : ''}
          {selected ? ` · ${phaseWord(selected.phase)}` : ''}
        </p>
        {/* the page title is the h1 of the shell; this one names what the page is about */}
        <h2 className="ep-title">Stake, limits and defaults</h2>
        {ready && <p className="ep-lede">{ledeOf(list.length, total(list, 'stake'), epoch, defaulted)}</p>}
      </header>
      {ready && (
        <section className="ep-section" data-tour="credit" aria-label="Headline figures">
          <div className="ds-kpis ep-kpis cl-kpis">
            <Kpi label="Members" value={formatNumber(list.length, 0)} note="Admitted to the circle" />
            <Kpi label="Stake" value={formatCredit2(total(list, 'stake').toString())} unit={MONEY} note="Held behind the credit limits" />
            <Kpi label="Credit limit" value={formatCredit2(total(list, 'limit').toString())} unit="credit" note={`${formatCredit2(total(list, 'headroom').toString())} credit of headroom left`} />
            {defaulted !== null && (
              <Kpi
                label={`Defaults in epoch ${epoch}`}
                value={formatNumber(defaulted, 0)}
                tone={defaulted > 0 ? 'default' : 'ink'}
                note={defaulted > 0 ? <><StatusBadge code={409} /> {formatCredit2(unpaid.toString())} credit not paid</> : 'No member defaulted'}
              />
            )}
          </div>
        </section>
      )}
      <section className="ep-section" aria-labelledby="risk-members">
        <h2 id="risk-members" className="ep-h2">Members</h2>
        <p className="ep-sechint">Stake backs each member's credit. Headroom is what the member can still owe. Amounts in credit.</p>
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
                    <span className="member-cell" title={m.account}>
                      <Mascot id={m.account} size={30} mood={m.status === 'suspended' ? 'sad' : undefined} />
                      {shortAccount(m.account)}
                    </span>
                    <EvmBadge account={m.account} />
                  </td>
                  <td>
                    <MemberBadge status={m.status} />
                  </td>
                  <td className="num">{formatCredit2(m.stake)}</td>
                  <td className="num">{formatCredit2(m.limit)}</td>
                  <td className="num">
                    <Headroom m={m} />
                  </td>
                  <td className="num">{formatCredit2(m.settledHistory)}</td>
                </tr>
              )}
            />
          )}
        </QueryState>
      </section>
      {/* v6.3 (KISS): the block by block history of the limits is for an audit; it folds away */}
      <details className="more ep-more">
        <summary>Limit history</summary>
        <LimitHistory />
      </details>
      <Defaults />
    </div>
  )
}
