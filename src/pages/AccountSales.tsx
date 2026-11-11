import { useEffect } from 'react'
import { ApiError } from '../api/client'
import { useAccountEscrow, useAccountEscrows, useEpochs, useGrants, useMaxEscrowTtl } from '../api/queries'
import type { AccountEscrowItem, AccountEscrowState } from '../api/types'
import { ErrorNotice, Loading } from '../components/QueryState'
import { ItemTitle, Party } from '../components/ListBits'
import { PAGE_HUE } from '../components/pageHue'
import { formatExpiry, formatTtl } from '../lib/format'

// FE-045: sales of a NEAR account through a locker (contract 0.0.18, barter kinds #11 and #14), read only. The list comes from `GET account-escrows`, the expiry
// from the grant of the same id (`GET grants`), the lock epoch from `GET account-escrows/{grantId}`, the time limit from the contract view `get_max_escrow_ttl`.
// No wallet action here: locking, delivering and cancelling an account sale are not in the dashboard yet.

const STATE_LABEL: Record<AccountEscrowState, string> = {
  held: 'held: keys locked, waiting for delivery',
  delivered: 'delivered to the buyer',
  cancelled: "cancelled: seller's key returned",
}
// FE-085: rows in the list look of FE-081. The tile hue and the state dot say where the sale stands: held (blue), delivered (green), cancelled (red).
const STATE_TONE: Record<AccountEscrowState, 'info' | 'ok' | 'bad'> = { held: 'info', delivered: 'ok', cancelled: 'bad' }
const STATE_HUE: Record<AccountEscrowState, string> = { held: '#3d8bff', delivered: '#3fb56a', cancelled: '#e25a4f' }
/** Detail reads are one request per row: only the newest rows get one. */
const DETAIL_ROWS = 50

const notOnThisCircle = (error: unknown) => error instanceof ApiError && error.status === 404

function TtlLine() {
  const ttl = useMaxEscrowTtl()
  const text = ttl.data === undefined ? null : formatTtl(ttl.data)
  if (ttl.isPending) return null
  return (
    <p className="sales-ttl" data-testid="max-escrow-ttl">
      Longest lock of an account sale (<code className="plain">max_escrow_ttl</code>): {text ?? 'not available on this contract'}. A sale not delivered by its expiry can be
      cancelled by anyone, and the locker gives the seller's key back.
    </p>
  )
}

function DetailCells({ item, withDetail, finalizedHead, epochsRead }: { item: AccountEscrowItem; withDetail: boolean; finalizedHead: number | null; epochsRead: boolean }) {
  // FE-047: the key of a held sale holds the finalized head, so it waits for the epoch list; otherwise it is read once without it and again when the list arrives.
  const detail = useAccountEscrow(item.grantId, item.state, finalizedHead, withDetail && (item.state !== 'held' || epochsRead))
  if (!withDetail)
    return (
      <td colSpan={3} data-label="Details">
        <span className="muted">Details are read for the first {DETAIL_ROWS} sales only</span>
      </td>
    )
  if (detail.isPending) return <><td colSpan={3} data-label="Details">loading…</td></>
  if (detail.isError || !detail.data) return <><td colSpan={3} data-label="Details">not available</td></>
  const d = detail.data
  const kind = d.member ? 'member account' : 'account'
  // FE-090: an empty cell says why in words, not with a dash
  const epoch = d.lockedEpoch === null ? <span className="muted">Not locked</span> : `${d.lockedEpoch}${d.lockedEpochFinalized ? ' (finalized)' : ''}`
  const delivery = d.ready ? 'can be delivered now' : 'waits until the lock epoch is finalized'
  return (
    <>
      <td data-label="Kind">{kind}</td>
      <td className="num" data-label="Lock epoch">{epoch}</td>
      <td data-label="Delivery">{d.state === 'held' ? <span className="state-line" data-tone={d.ready ? 'ok' : 'warn'}>{delivery}</span> : <span className="muted">{d.state === 'delivered' ? 'Done' : 'Not delivered'}</span>}</td>
    </>
  )
}

export function AccountSales() {
  const escrows = useAccountEscrows()
  const items = escrows.data?.items ?? []
  // FE-046: the expiry of a grant never changes, so the grant list is read once (only when there are sales) and again only when a sale shows a grant it lacks.
  const grants = useGrants({}, items.length > 0, false)
  const expiry = new Map((grants.data?.items ?? []).map((g) => [g.grantId, g.expiresAt]))
  const missing = grants.data ? items.filter((e) => !expiry.has(e.grantId)).map((e) => e.grantId).join() : ''
  const { refetch: refetchGrants } = grants
  useEffect(() => {
    if (missing) void refetchGrants()
  }, [missing, refetchGrants])
  // A held sale can change once an epoch is finalized (EpochProvider polls the list already).
  const epochs = useEpochs()
  const finalizedHead = epochs.data?.items.find((e) => e.phase === 'finalized')?.epoch ?? null
  const epochsRead = !epochs.isPending

  let body
  if (escrows.isPending) body = <Loading label="Loading account sales" />
  else if (escrows.isError && notOnThisCircle(escrows.error))
    body = <p className="state">This circle has no account sales: they need contract 0.0.18 (circle x207-v018) and a read API that serves them.</p>
  else if (escrows.isError) body = <ErrorNotice error={escrows.error} onRetry={() => void escrows.refetch()} />
  else if (escrows.data.items.length === 0) body = <p className="state">No account sale in this circle yet.</p>
  else
    body = (
      <div className="table-wrap ax-table ax-cards" data-cols="wide">
        <table aria-label="Account sales">
          <thead>
            <tr>
              <th scope="col">Account sold</th>
              <th scope="col" className="num">Grant</th>
              <th scope="col">State</th>
              <th scope="col">Buyer (new owner)</th>
              <th scope="col">Expires</th>
              <th scope="col">Kind</th>
              <th scope="col" className="num">Lock epoch</th>
              <th scope="col">Delivery</th>
            </tr>
          </thead>
          <tbody>
            {escrows.data.items.map((e, i) => (
              <tr key={e.grantId}>
                <td className="ax-first" data-label="Account sold">
                  <ItemTitle icon="/access" hue={STATE_HUE[e.state] ?? PAGE_HUE['/access']} title={<code className="plain">{e.account}</code>} sub="NEAR account" />
                </td>
                <td className="num row-num" data-label="Grant">{e.grantId}</td>
                <td className="sales-state" data-label="State"><span className="state-line" data-tone={STATE_TONE[e.state] ?? 'info'}>{STATE_LABEL[e.state] ?? e.state}</span></td>
                <td data-label="Buyer">{e.newOwner ? <Party account={e.newOwner} /> : <span className="muted">no buyer yet</span>}</td>
                <td className="sales-expiry" data-label="Expires">{expiry.has(e.grantId) ? formatExpiry(expiry.get(e.grantId)!) : 'not available'}</td>
                <DetailCells item={e} withDetail={i < DETAIL_ROWS} finalizedHead={finalizedHead} epochsRead={epochsRead} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )

  return (
    <section className="ax-section" aria-labelledby="account-sales-title">
      <h2 id="account-sales-title" className="ax-h2">Account sales</h2>
      <p className="ax-note">Whole NEAR accounts changing hands, held by the circle until the buyer pays.</p>
      {/* FE-073: the mechanism folds away; the list is what a visitor came for */}
      <details className="tech">
        <summary>How an account sale works</summary>
        <p>
          A seller locks a NEAR account with a small locker contract and deletes its own keys; the circle holds the sale until the buyer pays with a voucher, then the locker adds
          the buyer's key. A member account (with its stake and debts) is delivered only after the epoch of the lock is finalized. Needs contract 0.0.18.
        </p>
      </details>
      {escrows.isSuccess && <TtlLine />}
      {body}
    </section>
  )
}
