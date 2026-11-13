import { useDaoProposals, useParams, useParamsHistory, useRelayerFeeEvents } from '../api/queries'
import type { ReactNode } from 'react'
import { ApiError } from '../api/client'
import type { DaoProposal, Params, ParamsResponse } from '../api/types'
import { CONTRACT_ID, NEAR_NETWORK } from '../config'
import { QueryState } from '../components/QueryState'
import { Button, StatusBadge, type StatusCode } from '../ds/components'
import { formatCredit, formatNumber } from '../lib/format'

type Key = keyof Params

const percent = (bps: number) => `${formatNumber(bps / 100)}%`
const minutes = (seconds: number) => `${formatNumber(seconds / 60)} ${seconds === 60 ? 'minute' : 'minutes'}`

const rows: { key: Key; label: string; format: (value: never) => string }[] = [
  { key: 'epoch_length', label: 'Epoch length', format: minutes },
  { key: 'payment_window', label: 'Payment window', format: minutes },
  { key: 'proposal_window', label: 'Clearing proposal window', format: minutes },
  { key: 'base_limit_ratio', label: 'Initial limit ratio to stake', format: percent },
  { key: 'limit_growth', label: 'Limit growth from cash settlement', format: percent },
  { key: 'limit_cap', label: 'Limit cap (credit)', format: (v: string) => formatCredit(v) },
  { key: 'limit_decay', label: 'Limit decay', format: percent },
  {
    key: 'fees',
    label: 'Fees',
    format: (v: Params['fees']) => `clearing ${percent(v.clearing_fee_bps)}, solver ${percent(v.solver_fee_bps)}`,
  },
  { key: 'admission', label: 'Member admission', format: (v: string) => v },
  { key: 'bond_threshold', label: 'Bond threshold (deals at or above need a bond)', format: (v: string) => formatCredit(v) },
  { key: 'bond_bps', label: 'Bond per side', format: percent },
  { key: 'max_search_share_bps', label: 'Search share cap per bundle', format: percent },
  { key: 'prune_delay_epochs', label: 'Prune delay', format: (v: number) => `${formatNumber(v)} ${v === 1 ? 'epoch' : 'epochs'}` },
  { key: 'relayer_fee', label: 'Relayer fee per EVM claim or stake withdrawal (flat, credit)', format: (v: string) => formatCredit(v) },
]

// History carries raw values per field; the format follows the parameter table.
export function formatField(field: string, value: unknown): string {
  // The first row of a field in the history has no old value (`null`); it must not reach a formatter (`fees` would crash the page, a number would read as 0).
  if (value === null || value === undefined) return '—'
  const row = rows.find((r) => r.key === field)
  return row ? row.format(value as never) : String(value)
}

const EXPLORER_ACCOUNT = NEAR_NETWORK === 'mainnet' ? 'https://nearblocks.io/address/' : 'https://testnet.nearblocks.io/address/'

const STATUS_LABEL: Record<DaoProposal['status'], string> = {
  InProgress: 'Open',
  Approved: 'Approved',
  Rejected: 'Rejected',
  Removed: 'Removed',
  Expired: 'Expired',
  Moved: 'Moved',
  Failed: 'Failed to execute',
}

/** Sputnik `vote_counts` per role are summed: [approve, reject, remove]. */
export function tally(votes: DaoProposal['votes']): { approve: number; reject: number; remove: number } {
  const total = { approve: 0, reject: 0, remove: 0 }
  for (const [a, r, x] of Object.values(votes)) {
    total.approve += a
    total.reject += r
    total.remove += x
  }
  return total
}

// FE-073: a change reads as "Payment window: 45 minutes", not as the contract field.
const labelOf = (key: string) => rows.find((r) => r.key === key)?.label ?? key
const describeParams = (params: DaoProposal['params']) =>
  params === null
    ? '-'
    : Object.entries(params)
        .map(([key, value]) => `${labelOf(key)}: ${formatField(key, value)}`)
        .join(', ')

/** The result code that fits a proposal: an open vote is accepted and waiting (202), an approved one is settled (200), a rejected or failed one is a conflict (409). Removed, expired and moved ones carry no code, only the word. */
const PROPOSAL_CODE: Partial<Record<DaoProposal['status'], StatusCode>> = { InProgress: 202, Approved: 200, Rejected: 409, Failed: 409 }

function ProposalStatus({ status }: { status: DaoProposal['status'] }) {
  const code = PROPOSAL_CODE[status]
  const label = STATUS_LABEL[status] ?? status
  return code === undefined ? <span className="pill">{label}</span> : <StatusBadge code={code} label={label} />
}

// FE-073: the rules in four groups a member thinks in, instead of one long table of contract fields.
const RULE_GROUPS: { title: string; keys: Key[] }[] = [
  { title: 'Timing', keys: ['epoch_length', 'payment_window', 'proposal_window', 'prune_delay_epochs'] },
  { title: 'Credit limits', keys: ['base_limit_ratio', 'limit_growth', 'limit_cap', 'limit_decay'] },
  { title: 'Fees and bonds', keys: ['fees', 'bond_threshold', 'bond_bps', 'relayer_fee'] },
  { title: 'Joining and search', keys: ['admission', 'max_search_share_bps'] },
]

// FE-073: the change the DAO already approved, before it starts; the first thing a member needs to know.
function ComingUp() {
  const params = useParams()
  const next = params.data?.nextEpoch
  if (!next || params.data?.nextEpochEffective == null) return null
  const active = params.data.active
  return (
    <section className="rule-next" aria-label="Next epoch parameters">
      <p className="rule-next-title">Effective from epoch {params.data.nextEpochEffective}</p>
      <ul>
        {Object.entries(next).map(([key, value]) => (
          <li key={key}>
            <strong>{labelOf(key)}</strong> {formatField(key, active[key as Key])} becomes {formatField(key, value)}
          </li>
        ))}
      </ul>
    </section>
  )
}

// FE-015: Sputnik DAO `set_params` proposals. Read only; votes are cast in the DAO, not on this page.
function DaoProposals() {
  const proposals = useDaoProposals()
  // FE-097: dao_unavailable carries the upstream RPC text (block heights, contract ids); said in words instead, the parameters above stay current.
  const e = proposals.error
  if (proposals.data === undefined && e instanceof ApiError && e.code === 'dao_unavailable')
    return (
      <section className="ax-section" data-tour="dao" aria-labelledby="gov-proposals">
        <h2 id="gov-proposals" className="ax-h2">DAO proposals</h2>
        <div className="state" role="status" data-testid="dao-unavailable">
          <p>
            <code>dao_unavailable</code> The DAO could not be read right now, so its proposals are not listed. The parameters above come from the circle contract and are current.
          </p>
          <Button onClick={() => void proposals.refetch()}>Try again</Button>
        </div>
      </section>
    )
  return (
    <section className="ax-section" data-tour="dao" aria-labelledby="gov-proposals">
      <h2 id="gov-proposals" className="ax-h2">DAO proposals</h2>
      <QueryState
        query={proposals}
        loadingLabel="Loading DAO proposals"
        isEmpty={(d) => d.items.length === 0}
        empty="No set_params proposals in the DAO yet."
      >
        {(data) => {
          const open = data.items.filter((p) => p.status === 'InProgress')
          const closed = data.items.filter((p) => p.status !== 'InProgress')
          const table = (items: DaoProposal[], label: string) => (
            <div className="table-wrap ax-table ax-cards">
              <table aria-label={label}>
                <thead>
                  <tr>
                    <th scope="col" className="num">#</th>
                    <th scope="col">Change</th>
                    <th scope="col">Status</th>
                    <th scope="col">Proposed by</th>
                    <th scope="col" className="num">For / against / remove</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const t = tally(p.votes)
                    return (
                      <tr key={p.id}>
                        <td className="num" data-label="Proposal">
                          <a href={`${EXPLORER_ACCOUNT}${data.dao}`} target="_blank" rel="noreferrer">
                            {p.id}
                          </a>
                        </td>
                        <td className="ax-change" data-label="Change">
                          <strong>{describeParams(p.params)}</strong>
                          <small className="muted">{p.description}</small>
                        </td>
                        <td data-label="Status">
                          <ProposalStatus status={p.status} />
                        </td>
                        <td className="ax-who" data-label="Proposed by">{p.proposer}</td>
                        <td className="num" data-label="For / against / remove">{`${t.approve} / ${t.reject} / ${t.remove}`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
          return (
            <>
              <p className="ax-note">
                The council votes in <a href={`${EXPLORER_ACCOUNT}${data.dao}`} target="_blank" rel="noreferrer">{data.dao}</a>, not on this page.
              </p>
              {open.length === 0 ? <p className="state">No open proposals.</p> : table(open, 'Open proposals')}
              {closed.length > 0 && (
                <>
                  <h3 className="ax-h3">Closed proposals</h3>
                  {table(closed, 'Closed proposals')}
                </>
              )}
            </>
          )
        }}
      </QueryState>
    </section>
  )
}

const EXPLORER_TX = NEAR_NETWORK === 'mainnet' ? 'https://nearblocks.io/txns/' : 'https://testnet.nearblocks.io/txns/'

// FE-043: contract 0.0.16 pays a relayer fee on `claim_evm` and `withdraw_stake_evm`; a transfer of the fee that fails is not paid and the member keeps it. Older circles have no such events.
function RelayerFees() {
  const events = useRelayerFeeEvents()
  // FE-073: only EVM members meet this fee; it folds away so the rules come first
  return (
    <details className="tech">
      <summary>Relayer fees</summary>
      <QueryState
        query={events}
        loadingLabel="Loading relayer fees"
        isEmpty={(d) => d.items.length === 0}
        empty="No relayer fee events yet. Only contract 0.0.16 emits them, and a fee of 0 emits none."
      >
        {(data) => (
          <>
            <div className="table-wrap ax-table ax-cards">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Member</th>
                    <th scope="col">Relayer</th>
                    <th scope="col">Action</th>
                    <th scope="col" className="num">Epoch</th>
                    <th scope="col" className="num">Fee (credit)</th>
                    <th scope="col" className="num">Block</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.items].reverse().map((e) => (
                    <tr key={`${e.receiptId}-${e.logIndex}`}>
                      <td className="ax-first" data-label="Event">
                        {e.event === 'relayer_fee_paid' ? 'Paid' : 'Failed, not paid'}
                        {' '}
                        <code className="plain">{e.event}</code>
                      </td>
                      <td className="ax-who" data-label="Member">{e.data.account_id}</td>
                      <td className="ax-who" data-label="Relayer">{e.data.relayer}</td>
                      <td data-label="Action">{e.data.action}</td>
                      <td className="num" data-label="Epoch">{e.data.epoch}</td>
                      <td className="num" data-label="Fee (credit)">{formatCredit(e.data.amount)}</td>
                      <td className="num" data-label="Block">
                        {e.txHash ? <a href={`${EXPLORER_TX}${e.txHash}`} target="_blank" rel="noreferrer">{e.blockHeight}</a> : e.blockHeight}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.more && <p className="state">Showing the first {data.items.length} events; there are more.</p>}
          </>
        )}
      </QueryState>
    </details>
  )
}

const mins = (seconds: number) => formatNumber(seconds / 60)

// FE-078: one epoch drawn to scale. Trading runs for epoch_length, then the clearing proposals, then the payment window;
// the next epoch opens at cutoff, so a second lane starts there. A pending change is drawn as a hatched extension.
function EpochLife({ data }: { data: ParamsResponse }) {
  const { epoch_length: open, proposal_window: clear, payment_window: pay } = data.active
  const nextPay = typeof data.nextEpoch?.payment_window === 'number' ? data.nextEpoch.payment_window : null
  const extra = nextPay !== null && nextPay > pay ? nextPay - pay : 0
  const total = open + clear + pay + extra
  const pct = (s: number) => `${(s / total) * 100}%`
  const life = open + clear + pay
  return (
    <figure className="epoch-life">
      <div className="life-head">
        <strong>{mins(life)} min</strong>
        <span>from an epoch's first trade to its payment deadline</span>
      </div>
      <div className="life-lanes" role="img" aria-label={`Trading ${mins(open)} minutes, clearing proposals ${mins(clear)} minutes, payment window ${mins(pay)} minutes. The next epoch opens at cutoff.`}>
        <div className="life-lane">
          <span className="life-tag">Epoch N</span>
          <div className="life-bar">
            <span className="life-seg" data-kind="open" style={{ width: pct(open) }}>{mins(open)}m</span>
            <span className="life-seg" data-kind="clear" style={{ width: pct(clear) }} />
            <span className="life-seg" data-kind="pay" style={{ width: pct(pay) }}>{mins(pay)}m</span>
            {extra > 0 && <span className="life-seg" data-kind="pending" style={{ width: pct(extra) }} />}
          </div>
        </div>
        <div className="life-lane">
          <span className="life-tag">Epoch N+1</span>
          <div className="life-bar">
            <span className="life-gap" style={{ width: pct(open) }} />
            <span className="life-seg" data-kind="open" data-fade="true" style={{ width: pct(total - open) }}>opens at cutoff</span>
          </div>
        </div>
        <div className="life-ticks" aria-hidden="true">
          <span className="life-tick-end" style={{ left: pct(open) }}>Cutoff</span>
          <span className="life-tick-minor" style={{ left: pct(open + clear) }}>Commit</span>
          <span className={extra > 0 ? undefined : 'life-tick-end'} style={{ left: pct(life) }}>Deadline</span>
        </div>
      </div>
      <ul className="life-legend">
        <li data-kind="open">Trading <b>{mins(open)} min</b></li>
        <li data-kind="clear">Clearing proposals <b>{mins(clear)} min</b></li>
        <li data-kind="pay">Payment window <b>{mins(pay)} min</b></li>
        {extra > 0 && nextPay !== null && (
          <li data-kind="pending">
            Payment window <b>{mins(nextPay)} min</b> from epoch {data.nextEpochEffective}
          </li>
        )}
      </ul>
    </figure>
  )
}

// FE-078: the credit limit as its formula: a share of stake plus a share of cash settled, never above the cap.
function LimitFormula({ data }: { data: ParamsResponse }) {
  const { base_limit_ratio: base, limit_growth: growth, limit_cap: cap, limit_decay: decay } = data.active
  const share = (bps: number) => ({ width: `${Math.min(100, bps / 100)}%` })
  return (
    <figure className="limit-formula" aria-label="How a credit limit is set">
      <div className="formula-row">
        <div className="formula-term">
          <span className="formula-value">{percent(base)}</span>
          <span className="formula-label">of your stake</span>
          <span className="formula-meter" aria-hidden="true"><i style={share(base)} /></span>
        </div>
        <span className="formula-op" aria-hidden="true">+</span>
        <div className="formula-term">
          <span className="formula-value">{percent(growth)}</span>
          <span className="formula-label">of cash you settled</span>
          <span className="formula-meter" aria-hidden="true"><i style={share(growth)} /></span>
        </div>
      </div>
      <div className="formula-cap">
        <span>Capped at</span>
        <strong>{formatCredit(cap)} credit</strong>
      </div>
      <figcaption>{decay === 0 ? 'Limits do not shrink while a member is idle.' : `An idle member loses ${percent(decay)} of the limit per epoch.`}</figcaption>
    </figure>
  )
}

const GROUP_VISUAL: Partial<Record<string, (props: { data: ParamsResponse }) => ReactNode>> = {
  Timing: EpochLife,
  'Credit limits': LimitFormula,
}

export function Governance() {
  const params = useParams()
  const history = useParamsHistory()
  const active = params.data?.active
  return (
    <div className="ax ax-gov">
      <header className="ax-lede">
        <p>The rules every member trades under. The DAO council changes them by vote, and a change starts at a later epoch, never mid-trade.</p>
        {/* the facts the page already holds: where the circle lives and the two clocks every member trades by */}
        <dl className="kv ax-facts">
          <div>
            <dt>Circle contract</dt>
            <dd className="ds-num">{CONTRACT_ID}</dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd className="ds-num">NEAR {NEAR_NETWORK}</dd>
          </div>
          {active && (
            <>
              <div>
                <dt>Epoch length</dt>
                <dd className="ds-num">{formatField('epoch_length', active.epoch_length)}</dd>
              </div>
              <div>
                <dt>Payment window</dt>
                <dd className="ds-num">{formatField('payment_window', active.payment_window)}</dd>
              </div>
            </>
          )}
        </dl>
      </header>
      <ComingUp />
      <section className="ax-section" aria-labelledby="gov-rules">
      <h2 id="gov-rules" className="ax-h2">Current rules</h2>
      <QueryState query={params} loadingLabel="Loading parameters">
        {(data) => (
          <div className="ax-rules">
            {RULE_GROUPS.map((group) => {
              const Visual = GROUP_VISUAL[group.title]
              return (
              <div className="ax-rule" data-group={group.title} key={group.title}>
                {Visual && <Visual data={data} />}
                <table className="rules" aria-label={group.title}>
                  <caption>{group.title}</caption>
                  <tbody>
                    {group.keys.map((key) => {
                      const { label, format } = rows.find((r) => r.key === key)!
                      const next = data.nextEpoch?.[key]
                      return (
                        <tr key={key}>
                          <th scope="row">
                            {label}
                            <code className="plain muted">{key}</code>
                          </th>
                          <td className="num">
                            {formatField(key, data.active[key])}
                            {next !== undefined && (
                              <span className="pill" data-tone="warn">{`${format(next as never)}, effective from epoch ${data.nextEpochEffective}`}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              )
            })}
          </div>
        )}
      </QueryState>
      </section>
      <DaoProposals />
      <section className="ax-section" aria-labelledby="gov-history">
      <h2 id="gov-history" className="ax-h2">Change history</h2>
      <QueryState
        query={history}
        loadingLabel="Loading history"
        isEmpty={(d) => d.items.length === 0}
        empty="No parameter changes yet."
      >
        {(data) => (
          <div className="table-wrap ax-table ax-cards">
            <table>
              <thead>
                <tr>
                  <th scope="col">Parameter</th>
                  <th scope="col" className="num">From</th>
                  <th scope="col" className="num">To</th>
                  <th scope="col" className="num">Effective from epoch</th>
                  <th scope="col" className="num">Block</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={`${item.blockHeight}-${item.field}`}>
                    <td className="ax-first" data-label="Parameter">
                      {labelOf(item.field)}
                      <code className="plain muted">{item.field}</code>
                    </td>
                    <td className="num" data-label="From">{formatField(item.field, item.oldValue)}</td>
                    <td className="num" data-label="To">{formatField(item.field, item.newValue)}</td>
                    <td className="num" data-label="Effective from epoch">{item.effectiveEpoch}</td>
                    <td className="num" data-label="Block">{item.blockHeight}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
      </section>
      <RelayerFees />
    </div>
  )
}
