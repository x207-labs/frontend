import { useDaoProposals, useParams, useParamsHistory, useRelayerFeeEvents } from '../api/queries'
import type { DaoProposal, Params } from '../api/types'
import { NEAR_NETWORK } from '../config'
import { NavIcon } from '../components/icons'
import { QueryState } from '../components/QueryState'
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

const PROPOSAL_TONE: Partial<Record<DaoProposal['status'], string>> = { InProgress: 'info', Approved: 'ok', Rejected: 'bad', Failed: 'bad' }

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
  return (
    <>
      <h2>DAO proposals</h2>
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
            <div className="table-wrap">
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
                        <td className="num">
                          <a href={`${EXPLORER_ACCOUNT}${data.dao}`} target="_blank" rel="noreferrer">
                            {p.id}
                          </a>
                        </td>
                        <td>
                          <strong>{describeParams(p.params)}</strong>
                          <br />
                          <small className="muted">{p.description}</small>
                        </td>
                        <td>
                          <span className="pill" data-tone={PROPOSAL_TONE[p.status]}>
                            {STATUS_LABEL[p.status] ?? p.status}
                          </span>
                        </td>
                        <td>{p.proposer}</td>
                        <td className="num">{`${t.approve} / ${t.reject} / ${t.remove}`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
          return (
            <>
              <p className="state">
                The council votes in <a href={`${EXPLORER_ACCOUNT}${data.dao}`} target="_blank" rel="noreferrer">{data.dao}</a>, not on this page.
              </p>
              {open.length === 0 ? <p className="state">No open proposals.</p> : table(open, 'Open proposals')}
              {closed.length > 0 && (
                <>
                  <h3>Closed proposals</h3>
                  {table(closed, 'Closed proposals')}
                </>
              )}
            </>
          )
        }}
      </QueryState>
    </>
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
            <div className="table-wrap">
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
                      <td>
                        {e.event === 'relayer_fee_paid' ? 'Paid' : 'Failed, not paid'}
                        {' '}
                        <code className="plain">{e.event}</code>
                      </td>
                      <td>{e.data.account_id}</td>
                      <td>{e.data.relayer}</td>
                      <td>{e.data.action}</td>
                      <td className="num">{e.data.epoch}</td>
                      <td className="num">{formatCredit(e.data.amount)}</td>
                      <td className="num">
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

export function Governance() {
  const params = useParams()
  const history = useParamsHistory()
  return (
    <>
      <div className="page-lead">
        <span className="tone-tile" aria-hidden="true" style={{ ['--tone' as string]: '#8b6cf0' }}>
          <NavIcon name="/governance" size={22} />
        </span>
        <p>The rules every member trades under. The DAO council changes them by vote, and a change starts at a later epoch, never mid-trade.</p>
      </div>
      <ComingUp />
      <h2>Current rules</h2>
      <QueryState query={params} loadingLabel="Loading parameters">
        {(data) => (
          <div className="rule-groups">
            {RULE_GROUPS.map((group) => (
              <div className="table-wrap" key={group.title}>
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
            ))}
          </div>
        )}
      </QueryState>
      <DaoProposals />
      <h2>Change history</h2>
      <QueryState
        query={history}
        loadingLabel="Loading history"
        isEmpty={(d) => d.items.length === 0}
        empty="No parameter changes yet."
      >
        {(data) => (
          <div className="table-wrap">
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
                    <td>
                      {labelOf(item.field)}
                      <code className="plain muted">{item.field}</code>
                    </td>
                    <td className="num">{formatField(item.field, item.oldValue)}</td>
                    <td className="num">{formatField(item.field, item.newValue)}</td>
                    <td className="num">{item.effectiveEpoch}</td>
                    <td className="num">{item.blockHeight}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
      <RelayerFees />
    </>
  )
}
