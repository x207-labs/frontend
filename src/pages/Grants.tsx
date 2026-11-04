import { useState } from 'react'
import { useGrants, useMembers } from '../api/queries'
import type { Grant, GrantEscrow, GrantStatus } from '../api/types'
import { QueryState } from '../components/QueryState'
import { formatCredit, shortAccount } from '../lib/format'
import { useWallet } from '../wallet/WalletContext'

// FE-017 (F8): per-member access grants from D9 `grants` (BE-038). Read only. Classes A to D as in the D10 registry; secrets are not in D9.
const STATUS_LABEL: Record<GrantStatus, string> = { offered: 'Offered', active: 'Active', revoked: 'Revoked', expired: 'Expired' }
const REASON_LABEL: Record<string, string> = {
  grantor: 'revoked by grantor',
  grantee: 'revoked by grantee',
  operator: 'revoked by operator',
  expired: 'validity ended',
  defaulted: 'grantee defaulted (defaulted)',
}
const CLASS_LABEL: Record<string, string> = { A: 'A: transferred', B: 'B: derived credential', C: 'C: TEE broker', D: 'D: x402 endpoint', X: 'X: rejected' }

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

/** Nanoseconds (string) to a UTC date; `not available` if unreadable. */
export function formatExpiry(ns: string): string {
  try {
    const ms = Number(BigInt(ns) / 1_000_000n)
    return new Date(ms).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC'
  } catch {
    return 'not available'
  }
}

type Row = Grant & { role: 'grantor' | 'grantee' }

function GrantTable({ rows }: { rows: Row[] }) {
  const hasToken = rows.some((g) => g.escrow?.kind === 'ft' || g.escrow?.kind === 'mt')
  return (
    <div className="table-wrap">
      {hasToken && (
        <p className="state" role="note" data-testid="ft-escrow-warning">
          Token or multi-token escrow (class A): the contract holds the <strong>exact amount</strong> written in the grant. Tokens with a transfer fee are not supported: the amount that
          arrives is smaller, so the escrow is rejected and the token returns to the grantor. Restricted tokens (whitelist, freezing) can refuse delivery to the buyer;
          the buyer's payment is then cancelled and the grant stays offered. The buyer must be registered on the token contract (<code className="plain">storage_deposit</code>). A rejected multi-token escrow is returned by the multi-token contract itself; only the contract written in the grant may escrow.
        </p>
      )}
      <table aria-label="Grant list">
        <thead>
          <tr>
            <th scope="col" className="num">ID</th>
            <th scope="col">Role</th>
            <th scope="col">Asset type</th>
            <th scope="col">Class</th>
            <th scope="col">Grantor</th>
            <th scope="col">Grantee</th>
            <th scope="col" className="num">Price</th>
            <th scope="col">Status</th>
            <th scope="col">Valid until</th>
            <th scope="col">Revocation reason</th>
            <th scope="col">Escrow</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.grantId}>
              <td className="num">{g.grantId}</td>
              <td>{g.role}</td>
              <td>
                <code className="plain">{g.assetType}</code>
              </td>
              <td>{CLASS_LABEL[g.class] ?? g.class}</td>
              <td>{shortAccount(g.grantor)}</td>
              <td>{g.grantee ? shortAccount(g.grantee) : '-'}</td>
              <td className="num">{`${formatCredit(g.unitPrice)} per ${g.unit}`}</td>
              <td>
                <span className={g.status === 'revoked' ? 'member-suspended' : undefined}>{STATUS_LABEL[g.status] ?? g.status}</span>
              </td>
              <td>{formatExpiry(g.expiresAt)}</td>
              <td>{g.revokeReason ? (REASON_LABEL[g.revokeReason] ?? g.revokeReason) : '-'}</td>
              <td>
                <EscrowCell escrow={g.escrow} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

  return (
    <>
      <p>Access grants (F8): members rent out access without handing over their secrets. Data comes from the read API; secrets are never there.</p>
      <label>
        <span>Member</span>
        <select value={account ?? ''} onChange={(e) => setChosen(e.target.value)}>
          {members.data?.items.map((m) => (
            <option key={m.account} value={m.account}>
              {m.account}
            </option>
          ))}
          {account && !members.data?.items.some((m) => m.account === account) && <option value={account}>{account}</option>}
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
      <QueryState
        query={query as never}
        loadingLabel="Loading grants"
        isEmpty={(d: { items: Row[] }) => d.items.length === 0}
        empty="This member has no grants yet."
      >
        {(data: { items: Row[] }) => <GrantTable rows={data.items} />}
      </QueryState>
    </>
  )
}
