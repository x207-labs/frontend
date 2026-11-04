import { useDaoProposals, useParams, useParamsHistory } from '../api/queries'
import type { DaoProposal, Params } from '../api/types'
import { NEAR_NETWORK } from '../config'
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

const describeParams = (params: DaoProposal['params']) =>
  params === null
    ? '-'
    : Object.entries(params)
        .map(([key, value]) => `${key} = ${formatField(key, value)}`)
        .join(', ')

// FE-015: Sputnik DAO `set_params` proposals. Read only; votes are cast in the DAO, not on this page.
function DaoProposals() {
  const proposals = useDaoProposals()
  const params = useParams()
  const next = params.data?.nextEpoch
  return (
    <>
      <h2>DAO proposals</h2>
      {next && params.data?.nextEpochEffective != null && (
        <p className="state" aria-label="Next epoch parameters">
          Effective from epoch {params.data.nextEpochEffective}:{' '}
          {Object.entries(next)
            .map(([key, value]) => `${key} = ${formatField(key, value)}`)
            .join(', ')}
          .
        </p>
      )}
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
                    <th scope="col" className="num">ID</th>
                    <th scope="col">Status</th>
                    <th scope="col">Change</th>
                    <th scope="col">Proposer</th>
                    <th scope="col" className="num">Votes (approve / reject / remove)</th>
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
                        <td>{STATUS_LABEL[p.status] ?? p.status}</td>
                        <td>
                          <code className="plain">set_params</code> {describeParams(p.params)}
                          <br />
                          <small>{p.description}</small>
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
              <p>
                DAO: <a href={`${EXPLORER_ACCOUNT}${data.dao}`} target="_blank" rel="noreferrer">{data.dao}</a>. Votes are cast in the DAO by council members.
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

export function Governance() {
  const params = useParams()
  const history = useParamsHistory()
  return (
    <>
      <QueryState query={params} loadingLabel="Loading parameters">
        {(data) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Parameter</th>
                  <th scope="col">Contract name</th>
                  <th scope="col" className="num">Active value</th>
                  <th scope="col">Pending change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ key, label, format }) => {
                  const next = data.nextEpoch?.[key]
                  return (
                    <tr key={key}>
                      <td>{label}</td>
                      <td>
                        <code className="plain">{key}</code>
                      </td>
                      <td className="num">{formatField(key, data.active[key])}</td>
                      <td>
                        {next !== undefined &&
                          `${format(next as never)}, effective from epoch ${data.nextEpochEffective}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
                      <code className="plain">{item.field}</code>
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
    </>
  )
}
