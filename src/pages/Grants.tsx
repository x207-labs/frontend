import { useState } from 'react'
import { useGrants, useMembers } from '../api/queries'
import type { Grant, GrantEscrow, GrantStatus } from '../api/types'
import { ItemTitle, Party } from '../components/ListBits'
import { QueryState } from '../components/QueryState'
import { Kpi, StatusBadge, type StatusCode } from '../ds/components'
import { formatCredit, formatExpiry, shortAccount } from '../lib/format'
import { useWallet } from '../wallet/WalletContext'
import { AccountSales } from './AccountSales'

// FE-017 (F8): per-member access grants from D9 `grants` (BE-038). Read only. Classes A to D as in the D10 registry; secrets are not in D9.
// FE-073: written for the member, not the contract. The page opens on your own grants; looking up another member is a choice (grants are public).
// Plain words for roles, classes and reasons, a status pill, three numbers on top, and the token-escrow rules folded away.
const STATUS_LABEL: Record<GrantStatus, string> = { offered: 'Offered', active: 'Active', revoked: 'Revoked', expired: 'Expired' }
/** The result code of a grant: offered is accepted and waiting for a renter (202), active is settled and running (200), revoked is a conflict (409). A grant that ran out has no code, only the word. */
const STATUS_CODE: Record<GrantStatus, StatusCode | undefined> = { offered: 202, active: 200, revoked: 409, expired: undefined }
function GrantState({ status }: { status: GrantStatus }) {
  const code = STATUS_CODE[status]
  const label = STATUS_LABEL[status] ?? status
  return code === undefined ? <span className="pill">{label}</span> : <StatusBadge code={code} label={label} />
}
const REASON_LABEL: Record<string, string> = {
  grantor: 'ended by the owner',
  grantee: 'ended by the renter',
  operator: 'ended by the operator',
  expired: 'time ran out',
  defaulted: 'renter did not pay',
}
const CLASS_LABEL: Record<string, string> = {
  A: 'Handed over in escrow',
  B: 'Own login for the renter',
  C: 'Through a secure broker',
  D: 'Paid endpoint (x402)',
  X: 'Rejected',
}

const ESCROW_STATE_LABEL: Record<string, string> = {
  held: 'held by contract',
  completing: 'being delivered',
  cancelling: 'being returned',
  delivered: 'delivered',
  cancelled: 'returned to grantor',
  stuck: 'stuck',
}

/** Class A escrow: an NFT, or the exact amount of an NEP-141 token in that token's unit (not credit). */
export function EscrowCell({ escrow }: { escrow: GrantEscrow | null | undefined }) {
  if (!escrow) return <>-</>
  const state = ESCROW_STATE_LABEL[escrow.state] ?? escrow.state
  if (escrow.kind === 'mt') {
    return (
      <>
        Multi-token <code className="plain">{shortAccount(escrow.mtContract)}</code> <code className="plain">{escrow.tokenId}</code>: {escrow.amount} token units ({state})
      </>
    )
  }
  return escrow.kind === 'ft' ? (
    <>
      Token <code className="plain">{shortAccount(escrow.ftContract)}</code>: {escrow.amount} token units ({state})
    </>
  ) : (
    <>
      NFT <code className="plain">{shortAccount(escrow.nftContract)}</code> #{escrow.tokenId} ({state})
    </>
  )
}

// FE-045: formatExpiry moved to lib/format (the account sales use it too).

type Row = Grant & { role: 'grantor' | 'grantee' }

function Counterparty({ g }: { g: Row }) {
  if (g.role === 'grantee') return <span className="party-with"><span className="row-sub">Rents from</span> <Party account={g.grantor} /></span>
  return g.grantee ? <span className="party-with"><span className="row-sub">Lends to</span> <Party account={g.grantee} /></span> : <span className="row-sub">Open offer</span>
}

// FE-083: who holds which access until when, drawn on one time axis. A lane runs from now to the end of the grant: solid while it is used,
// dashed while it waits for a renter, struck through when it was ended early; a grant that ran out is a dot where it ended. The table under it says the same in words.
const LANE_TONE: Record<GrantStatus, string> = { active: 'var(--ds-settled)', offered: 'var(--ds-claim)', revoked: 'var(--ds-default)', expired: 'var(--ds-ink-3)' }
const nsToMs = (ns: string) => {
  try {
    return Number(BigInt(ns) / 1_000_000n)
  } catch {
    return Number.NaN
  }
}
const shortDate = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

function AccessTimeline({ rows }: { rows: Row[] }) {
  const [now] = useState(() => Date.now())
  const lanes = rows.map((g) => ({ g, end: nsToMs(g.expiresAt) })).filter((l) => Number.isFinite(l.end))
  if (lanes.length === 0) return null
  const ends = lanes.map((l) => l.end)
  const lo = Math.min(now, ...ends)
  const hi = Math.max(now, ...ends)
  const pad = (hi - lo) * 0.04 || 86_400_000
  const t0 = lo - pad
  const span = hi + pad - t0
  const at = (t: number) => ((t - t0) / span) * 100
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3)
  return (
    <figure className="access-timeline" aria-hidden="true" style={{ ['--now' as string]: `${at(now)}%` }}>
      <ol>
        {lanes.map(({ g, end }) => {
          const other = g.role === 'grantee' ? g.grantor : g.grantee
          const from = at(Math.min(now, end))
          return (
            <li key={g.grantId} data-status={g.status} style={{ ['--lane' as string]: LANE_TONE[g.status] }}>
              <span className="lane-who">
                {other ? <Party account={other} /> : <span className="lane-open">Anyone</span>}
                <small>{g.assetType}</small>
              </span>
              <span className="lane-track">
                {g.status === 'expired' || end <= now ? (
                  <span className="lane-dot" style={{ left: `${at(end)}%` }} />
                ) : (
                  <span className="lane-bar" style={{ left: `${from}%`, width: `${at(end) - from}%` }} />
                )}
              </span>
            </li>
          )
        })}
      </ol>
      <div className="lane-axis">
        <span />
        <span className="lane-ticks">
          {ticks.map((t, i) => (
            <span key={i} style={{ left: `${at(t)}%` }}>{shortDate(t)}</span>
          ))}
        </span>
      </div>
      <figcaption className="lane-key">
        {(['active', 'offered', 'revoked', 'expired'] as GrantStatus[]).map((s) => (
          <span key={s} data-status={s} style={{ ['--lane' as string]: LANE_TONE[s] }}>{STATUS_LABEL[s]}</span>
        ))}
        <span className="key-now">Now</span>
      </figcaption>
    </figure>
  )
}

function GrantTable({ rows }: { rows: Row[] }) {
  const hasToken = rows.some((g) => g.escrow?.kind === 'ft' || g.escrow?.kind === 'mt')
  const hasEscrow = rows.some((g) => g.escrow)
  return (
    <>
      <div className="table-wrap ax-table ax-cards" data-cols={hasEscrow ? 'wide' : undefined}>
        <table aria-label="Grant list">
          <thead>
            <tr>
              <th scope="col">Access</th>
              <th scope="col">With</th>
              <th scope="col" className="num">Price<small>credit</small></th>
              <th scope="col">Status</th>
              <th scope="col">Until</th>
              {hasEscrow && <th scope="col">Held item</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.grantId}>
                <td className="ax-first" data-label="Access">
                  <ItemTitle
                    icon="/access"
                    hue={LANE_TONE[g.status]}
                    title={<><code className="plain">{g.assetType}</code> <span className="row-id">#{g.grantId}</span></>}
                    sub={CLASS_LABEL[g.class] ?? g.class}
                  />
                </td>
                <td data-label="With">
                  <Counterparty g={g} />
                </td>
                <td className="num" data-label="Price"><span className="amount">{formatCredit(g.unitPrice)}</span> <span className="muted">per {g.unit}</span></td>
                <td data-label="Status">
                  <GrantState status={g.status} />
                  {g.revokeReason && <small className="muted ax-reason">{REASON_LABEL[g.revokeReason] ?? g.revokeReason}</small>}
                </td>
                <td className="ax-when" data-label="Until">{formatExpiry(g.expiresAt)}</td>
                {hasEscrow && (
                  <td data-label="Held item">
                    <EscrowCell escrow={g.escrow} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasToken && (
        <details className="tech">
          <summary>Rules for tokens held in escrow</summary>
          <p className="state" role="note" data-testid="ft-escrow-warning">
            Token or multi-token escrow (class A): the contract holds the <strong>exact amount</strong> written in the grant. Tokens with a transfer fee are not supported: the amount that
            arrives is smaller, so the escrow is rejected and the token returns to the grantor. Restricted tokens (whitelist, freezing) can refuse delivery to the buyer;
            the buyer's payment is then cancelled and the grant stays offered. The buyer must be registered on the token contract (<code className="plain">storage_deposit</code>). A rejected multi-token escrow is returned by the multi-token contract itself; only the contract written in the grant may escrow.
          </p>
        </details>
      )}
    </>
  )
}

function Figures({ rows }: { rows: Row[] }) {
  const count = (pick: (g: Row) => boolean) => rows.filter(pick).length
  return (
    <div className="ds-kpis ax-kpis" role="group" aria-label="Grant summary">
      <Kpi badge="200" tone="settled" label="Active" value={count((g) => g.status === 'active')} unit="grants" />
      <Kpi badge="202" tone="claim" label="Waiting for a renter" value={count((g) => g.status === 'offered')} unit="grants" />
      <Kpi label="Ended" value={count((g) => g.status === 'revoked' || g.status === 'expired')} unit="grants" note="Revoked or ran out" />
    </div>
  )
}

export function Grants() {
  const members = useMembers()
  const { account: wallet } = useWallet()
  const [chosen, setChosen] = useState('')
  const [status, setStatus] = useState('')
  const account = chosen || wallet || members.data?.items[0]?.account || null
  const filter: Record<string, string> = status ? { status } : {}
  const asGrantee = useGrants(account ? { grantee: account, ...filter } : {}, account !== null)
  const asGrantor = useGrants(account ? { grantor: account, ...filter } : {}, account !== null)

  const rows: Row[] =
    asGrantee.data && asGrantor.data
      ? [
          ...asGrantor.data.items.map((g) => ({ ...g, role: 'grantor' as const })),
          ...asGrantee.data.items.filter((g) => g.grantor !== account).map((g) => ({ ...g, role: 'grantee' as const })),
        ].sort((a, b) => a.grantId - b.grantId)
      : []
  // one shared query for loading and error status
  const query = asGrantee.isError ? asGrantee : asGrantor.isError ? asGrantor : asGrantee.data && asGrantor.data ? { ...asGrantee, data: { items: rows } } : asGrantee
  const mine = wallet !== null && account === wallet

  return (
    <div className="ax ax-grants">
      <header className="ax-lede">
        <p>Who may use what, and until when. The owner keeps the password; the contract keeps the record.</p>
        {/* FE-090: the life of a grant as its steps */}
        <ol className="ax-steps" aria-label="How it works">
          <li>Owner offers access</li>
          <li>Renter pays per day</li>
          <li>Ends on its date</li>
        </ol>
      </header>
      {/* FE-090: everything under the lead, in one column with even room between the parts */}
      <div className="grants-main">
        <div className="ax-pair grants-filter">
          <label>
            <span>Member</span>
            <select value={account ?? ''} onChange={(e) => setChosen(e.target.value)}>
              {wallet && <option value={wallet}>You ({shortAccount(wallet)})</option>}
              {members.data?.items
                .filter((m) => m.account !== wallet)
                .map((m) => (
                  <option key={m.account} value={m.account}>
                    {m.account}
                  </option>
                ))}
              {account && account !== wallet && !members.data?.items.some((m) => m.account === account) && <option value={account}>{account}</option>}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {(Object.keys(STATUS_LABEL) as GrantStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="grants-note">{mine ? 'Your grants. Grants are public, so you can also look up any other member.' : 'Grants are public, so anyone can look up any member. Sign in to open on your own.'}</p>
        <QueryState
          query={query as never}
          loadingLabel="Loading grants"
          isEmpty={(d: { items: Row[] }) => d.items.length === 0}
          empty="This member has no grants yet."
        >
          {(data: { items: Row[] }) => (
            <>
              <Figures rows={data.items} />
              <AccessTimeline rows={data.items} />
              <GrantTable rows={data.items} />
            </>
          )}
        </QueryState>
        <AccountSales />
      </div>
    </div>
  )
}
