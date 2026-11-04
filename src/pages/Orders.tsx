import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError, api } from '../api/client'
import { useDaoRegistry, useOrder, useOrderProofs, useOrders } from '../api/queries'
import type { OrderMilestoneView, OrderView } from '../api/types'
import { QueryState } from '../components/QueryState'
import { VoucherKeyField } from '../components/VoucherKeyField'
import { CONTRACT_ID } from '../config'
import { formatCredit, formatTime, shortAccount } from '../lib/format'
import { describeMarketError } from '../lib/marketError'
import {
  CLAIM_REASON, CREATABLE_KINDS, EMPTY_ORDER, KIND_LABEL, assertMandate, assertOrderHash, KIND_NOTE, ORDER_PATTERN, PROOF_METHODS, buildCreateOrder, mandateHashOf, milestoneNotice, orderHashOf, signClaim, signNotice, toMandate, toOrderDocument,
  type MilestoneAction, type OrderForm, type OutcomeAction,
} from '../lib/orderFlow'
import { useWallet } from '../wallet/WalletContext'

// FE-027: service orders (pipeline P6, ADR-45), built from Backend API Spec 5f. The buyer creates an order with milestones; the seller delivers, the buyer confirms or
// disputes within the window (ADR-42); leads and bugs are paid per result; keeper and solver are paid per tx the buyer's agent sees on-chain (the page only shows the proof).
const MILESTONE_LABEL: Record<string, string> = { open: 'Open', delivered: 'Delivered', confirmed: 'Confirmed', disputed: 'Disputed', paid: 'Paid', cancelled: 'Cancelled' }
const REASONS = [['not_received', 'Not received'], ['not_as_described', 'Not as described'], ['other', 'Other']] as const
const now = () => Math.floor(Date.now() / 1000)

/** B5-F4 (review BE-062): the backend only checks that the account answers `get_policy`; whether it is the DAO that the buyer means is the buyer's to check, so the page says whether the circle knows the account. */
function DaoNote({ dao }: { dao: string }) {
  const registry = useDaoRegistry()
  if (dao.trim() === '') return null
  if (registry.isPending) return null
  if (registry.data === null || registry.data === undefined) return <p className="state" role="note" data-testid="dao-note">The circle DAO registry is unavailable: check yourself that <code>{dao}</code> is the DAO you mean.</p>
  if (registry.data.includes(dao.trim())) return <p className="state" role="note" data-testid="dao-note">This DAO is in the circle registry.</p>
  return <p className="state state-error" role="note" data-testid="dao-note">This DAO is not in the circle registry. The backend only checks that this account answers <code>get_policy</code>; check the address before signing.</p>
}

function CreateOrder({ voucherKey, onVoucherKey, onCreated }: { voucherKey: string; onVoucherKey: (v: string) => void; onCreated: (hash: string) => void }) {
  const { account } = useWallet()
  const client = useQueryClient()
  const [form, setForm] = useState<OrderForm>(EMPTY_ORDER)
  const [counterparty, setCounterparty] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof OrderForm>(key: K, value: OrderForm[K]) => setForm((prev) => ({ ...prev, [key]: value }))
  const pattern = form.kind === '' ? null : ORDER_PATTERN[form.kind]
  const setMilestone = (k: number, field: 'amount' | 'due', value: string) => set('milestones', form.milestones.map((m, i) => (i === k ? { ...m, [field]: value } : m)))

  async function submit() {
    if (!account || form.kind === '') return
    setBusy(true)
    setError(null)
    try {
      // delegate: the mandate is built first, because its hash is part of the document
      const mandate = form.kind === 'delegate' ? await toMandate(form, CONTRACT_ID) : undefined
      if (typeof mandate === 'string') {
        setError(mandate)
        return
      }
      const doc = await toOrderDocument(form, CONTRACT_ID, account, crypto.randomUUID().replaceAll('-', '').slice(0, 24), mandate ? await mandateHashOf(mandate) : null)
      if (typeof doc === 'string') {
        setError(doc)
        return
      }
      const body = await buildCreateOrder(doc, account, voucherKey, counterparty.trim() === '' ? undefined : parseCounterparty(counterparty, form.seller), mandate)
      await api.createOrder(body)
      await client.invalidateQueries({ queryKey: ['orders'] })
      onCreated(await orderHashOf(doc))
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" aria-label="Create order" onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <h3>Create a service order (buyer)</h3>
      {!account && <p className="state">Sign in with your wallet to create an order.</p>}
      <label>
        <span>Service kind</span>
        <select value={form.kind} onChange={(e) => setForm({ ...EMPTY_ORDER, seller: form.seller, kind: e.target.value as OrderForm['kind'] })}>
          <option value="">Choose a kind</option>
          {CREATABLE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </label>
      {form.kind !== '' && KIND_NOTE[form.kind] && <p className="state" role="note" data-testid="order-note">{KIND_NOTE[form.kind]}</p>}
      <label><span>Seller</span><input value={form.seller} onChange={(e) => set('seller', e.target.value)} placeholder="audit.x207-circle.near" /></label>
      <label><span>Work specification (only its hash is sent)</span><textarea value={form.spec} onChange={(e) => set('spec', e.target.value)} rows={3} /></label>
      {form.kind === 'prompt' && (
        <label><span>Sample result (required; only its hash is sent)</span><textarea value={form.sample} onChange={(e) => set('sample', e.target.value)} rows={2} /></label>
      )}
      {form.kind === 'loadtest' && (
        <label><span>Load test target (host name)</span><input value={form.target} onChange={(e) => set('target', e.target.value)} placeholder="shop.example.com" /></label>
      )}
      {form.kind === 'delegate' && (
        <fieldset aria-label="Mandate">
          <legend>Public mandate</legend>
          <label><span>DAO account</span><input value={form.dao} onChange={(e) => set('dao', e.target.value)} placeholder="gauge.sputnik-dao.near" /></label>
          <DaoNote dao={form.dao} />
          <label><span>Paid proposal kinds (comma-separated, snake_case)</span><input value={form.kinds} onChange={(e) => set('kinds', e.target.value)} placeholder="transfer, function_call" /></label>
          <label><span>Rules text: when the delegate votes what (only its hash is locked)</span><textarea value={form.rules} onChange={(e) => set('rules', e.target.value)} rows={3} /></label>
        </fieldset>
      )}
      {pattern === 'proof' && form.kind !== '' && (
        <>
          <label>
            <span>Method counted as proof</span>
            <select value={form.proofMethod} onChange={(e) => set('proofMethod', e.target.value)}>
              <option value="">Choose a method</option>
              {PROOF_METHODS[form.kind as 'keeper' | 'solver' | 'delegate'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label><span>{form.kind === 'delegate' ? 'Payment per vote (credit)' : 'Payment per transaction (credit)'}</span><input value={form.proofAmount} onChange={(e) => set('proofAmount', e.target.value)} inputMode="decimal" /></label>
        </>
      )}
      <fieldset>
        <legend>{pattern === 'outcome' ? 'Outcome slots (one milestone per outcome)' : pattern === 'proof' ? 'Budget' : 'Milestones'}</legend>
        {form.milestones.map((m, k) => (
          <div key={k} className="side">
            <label><span>Amount {k + 1} (credit)</span><input value={m.amount} onChange={(e) => setMilestone(k, 'amount', e.target.value)} inputMode="decimal" /></label>
            <label><span>Due {k + 1} (UTC)</span><input type="datetime-local" value={m.due} onChange={(e) => setMilestone(k, 'due', e.target.value)} /></label>
          </div>
        ))}
        <button type="button" disabled={form.milestones.length >= 24} onClick={() => set('milestones', [...form.milestones, { amount: '', due: '' }])}>Add milestone</button>
      </fieldset>
      <label><span>Seller signature (optional): account and signature, separated by a space</span><input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="audit.x207-circle.near ed25519:…" /></label>
      <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />
      <div><button type="submit" disabled={!account || form.kind === '' || voucherKey.trim() === '' || busy}>{busy ? 'Signing…' : 'Sign and create order'}</button></div>
      {error && <p className="state state-error" role="alert">{error}</p>}
    </form>
  )
}

function parseCounterparty(text: string, seller: string): { account: string; signature: string } {
  const [account, signature] = text.trim().split(/\s+/)
  if (account !== seller.trim() || !signature?.startsWith('ed25519:')) throw new Error('The seller signature must be formatted "<seller account> ed25519:…".')
  return { account, signature }
}

function MilestoneRow({ view, opened, m, account, voucherKey, busy, run }: {
  view: OrderView; opened: string; m: OrderMilestoneView; account: string | null; voucherKey: string; busy: boolean
  run: (label: string, fn: () => Promise<void>) => void
}) {
  const [reason, setReason] = useState('not_received')
  const [deliverable, setDeliverable] = useState('')
  const isBuyer = account === view.order.buyer
  const isSeller = account === view.order.seller
  const pattern = ORDER_PATTERN[view.order.kind as keyof typeof ORDER_PATTERN]
  const keyless = voucherKey.trim() === ''
  const goodHash = /^[0-9a-f]{64}$/.test(deliverable.trim())
  // milestone notices go to .../milestones/{index}; outcomes of lead and bug go to .../outcomes with the place in `milestone`
  const act = (action: MilestoneAction) => run(action, async () => {
    await assertOrderHash(view, opened)
    const notice = milestoneNotice(CONTRACT_ID, view.orderHash, m.index, account!, action, now(), action === 'delivered' ? deliverable.trim() : null, action === 'disputed' ? reason : null)
    await api.orderMilestone(view.orderHash, m.index, notice, await signNotice(notice, voucherKey))
  })
  const outcome = (action: OutcomeAction) => run(`outcome ${action}`, async () => {
    await assertOrderHash(view, opened)
    // BE-054: deliverable_hash only for `proposed`; `accepted` and `rejected` name the place and carry no hash
    const notice = milestoneNotice(CONTRACT_ID, view.orderHash, m.index, account!, action, now(), action === 'proposed' ? deliverable.trim() : null, action === 'rejected' ? reason : null)
    await api.orderOutcome(view.orderHash, notice, await signNotice(notice, voucherKey))
  })
  // the seller may withdraw until the buyer confirms; the buyer may cancel only a milestone that is still open after its due date
  const canCancel = (isSeller && (m.status === 'open' || m.status === 'delivered')) || (isBuyer && m.status === 'open' && now() > m.dueAt)
  return (
    <tr>
      <td>{m.index}</td>
      <td>{formatCredit(m.amount)}</td>
      <td>{formatTime(new Date(m.dueAt * 1000).toISOString())}</td>
      <td>
        {MILESTONE_LABEL[m.status] ?? m.status}
        {m.autoConfirmed && ' (automatic after the dispute window)'}
        {m.outcome && ` · outcome ${m.outcome}`}
        {m.disputeReason && ` · ${m.disputeReason}`}
      </td>
      <td>{m.deliverableHash ? <code>{m.deliverableHash.slice(0, 12)}</code> : '-'}</td>
      <td>
        {pattern !== 'proof' && isSeller && m.status === 'open' && (
          <>
            <input aria-label={`Deliverable hash ${m.index}`} value={deliverable} onChange={(e) => setDeliverable(e.target.value)} placeholder="sha256 of the deliverable or outcome (hex)" />
            {pattern === 'milestone' ? (
              <button type="button" disabled={busy || keyless || !goodHash} onClick={() => act('delivered')}>Mark delivered</button>
            ) : (
              <button type="button" disabled={busy || keyless || !goodHash} onClick={() => outcome('proposed')}>Propose outcome</button>
            )}
          </>
        )}
        {pattern === 'milestone' && isBuyer && m.status === 'delivered' && (
          <>
            <button type="button" disabled={busy || keyless} onClick={() => act('confirmed')} aria-label={`Confirm ${m.index}`}>Confirm</button>
            <select aria-label={`Dispute reason ${m.index}`} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="button" disabled={busy || keyless} onClick={() => act('disputed')} aria-label={`Dispute ${m.index}`}>Dispute</button>
          </>
        )}
        {pattern === 'outcome' && isBuyer && m.status === 'delivered' && (
          <>
            <button type="button" disabled={busy || keyless} onClick={() => outcome('accepted')} aria-label={`Accept outcome ${m.index}`}>Accept outcome</button>
            <button type="button" disabled={busy || keyless} onClick={() => outcome('rejected')} aria-label={`Reject outcome ${m.index}`}>Reject outcome</button>
            <small>A silent buyer does not pay: lead and bug outcomes are not confirmed automatically.</small>
          </>
        )}
        {pattern !== 'proof' && canCancel && <button type="button" disabled={busy || keyless} onClick={() => act('cancelled')} aria-label={`Cancel ${m.index}`}>Cancel</button>}
      </td>
    </tr>
  )
}

/** The seller (delegate) declares one of their vote transactions; the backend checks it over RPC. The mandate and hash are re-checked before the notice is signed. */
function ClaimVote({ view, hash, voucherKey, busy, run }: { view: OrderView; hash: string; voucherKey: string; busy: boolean; run: (label: string, fn: () => Promise<void>) => void }) {
  const [tx, setTx] = useState('')
  const claim = () => run('vote claimed', async () => {
    await assertOrderHash(view, hash)
    await assertMandate(view)
    const { notice, signature } = await signClaim(CONTRACT_ID, hash, view.order.seller, now(), tx.trim(), voucherKey)
    try {
      await api.claimVote(hash, tx.trim(), notice, signature)
    } catch (e) {
      const reason = e instanceof ApiError && typeof e.details?.reason === 'string' ? e.details.reason : null
      if (reason !== null) throw new Error(`Claim rejected (${reason}): ${CLAIM_REASON[reason] ?? (e instanceof Error ? e.message : '')}`)
      if (e instanceof ApiError && e.code === 'claim_rpc_unavailable') throw new Error('The backend cannot check the transaction yet (RPC unavailable). Try again later.')
      throw e
    }
    setTx('')
  })
  return (
    <div className="form" aria-label="Claim vote">
      <h4>Claim vote</h4>
      <label><span>Hash of the vote transaction in the DAO (base58)</span><input value={tx} onChange={(e) => setTx(e.target.value)} /></label>
      <button type="button" disabled={busy || voucherKey.trim() === '' || tx.trim() === ''} onClick={claim}>Sign and claim</button>
    </div>
  )
}

function OrderDetail({ hash, voucherKey }: { hash: string; voucherKey: string }) {
  const { account } = useWallet()
  const client = useQueryClient()
  const query = useOrder(hash)
  const proofKind = query.data !== undefined && ORDER_PATTERN[query.data.order.kind as keyof typeof ORDER_PATTERN] === 'proof'
  const proofs = useOrderProofs(hash, proofKind)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function run(label: string, fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setMessage(null)
    fn()
      .then(async () => {
        setMessage(`Sent: ${label}.`)
        await client.invalidateQueries({ queryKey: ['order', hash] })
        await client.invalidateQueries({ queryKey: ['orders'] })
      })
      .catch((e) => setError(describeMarketError(e)))
      .finally(() => setBusy(false))
  }

  return (
    <section className="detail" aria-label="Order details">
      <QueryState query={query} loadingLabel="Loading orders">
        {(view) => {
          const kind = view.order.kind as keyof typeof ORDER_PATTERN
          const pattern = ORDER_PATTERN[kind]
          return (
            <>
              <h3>{KIND_LABEL[kind] ?? view.order.kind} · {view.status}</h3>
              <dl className="status-panel">
                <dt>Buyer</dt><dd><code>{view.order.buyer}</code></dd>
                <dt>Seller</dt><dd><code>{view.order.seller}</code></dd>
                <dt>Order hash</dt><dd><code>{view.orderHash}</code></dd>
                {view.status === 'proposed' && (<><dt>Signatures</dt><dd>so far from {view.signedBy.map(shortAccount).join(', ') || 'no one'}; the order opens after both parties sign</dd></>)}
                {view.order.sampleHash && (<><dt>Sample (hash)</dt><dd><code>{view.order.sampleHash}</code></dd></>)}
                {view.order.target && (<><dt>Target</dt><dd><code>{view.order.target}</code> · {view.targetVerified ? 'ownership proven' : 'ownership not yet proven'}</dd></>)}
                {view.order.proof && (<><dt>Proof</dt><dd><code>{view.order.proof.method}</code>, {formatCredit(view.order.proof.amountPerTx)} credit per {kind === 'delegate' ? 'vote' : 'tx'}</dd></>)}
              </dl>
              {kind === 'delegate' && view.mandate && (
                <dl className="status-panel" aria-label="Mandate" data-testid="order-mandate">
                  <dt>DAO</dt><dd><code>{view.mandate.dao}</code><DaoNote dao={view.mandate.dao} /></dd>
                  <dt>Proposal kinds</dt><dd>{view.mandate.kinds.map((k) => <code key={k}>{k} </code>)}</dd>
                  <dt>Rules (hash)</dt><dd><code>{view.mandate.rulesHash}</code></dd>
                  <dt>Mandate hash</dt><dd><code>{view.order.mandateHash}</code></dd>
                </dl>
              )}
              {view.needsBond && <p className="state state-error" role="status" data-testid="order-bond">This order is at or above the bond threshold: it needs a two-sided bond and an arbiter (CT-094).</p>}
              {KIND_NOTE[kind] && <p className="state" role="note">{KIND_NOTE[kind]}</p>}
              {view.order.target && view.targetVerified === false && (
                <div>
                  <button type="button" disabled={busy} onClick={() => run('target checked', async () => { await api.orderTargetCheck(view.orderHash) })}>Check target ownership</button>
                </div>
              )}
              <div className="table-wrap">
                <table aria-label="Milestones">
                  <thead><tr><th>#</th><th>Amount</th><th>Due</th><th>Status</th><th>Deliverable</th><th /></tr></thead>
                  <tbody>
                    {view.milestones.map((m) => <MilestoneRow key={m.index} view={view} opened={hash} m={m} account={account} voucherKey={voucherKey} busy={busy} run={run} />)}
                  </tbody>
                </table>
              </div>
              {pattern === 'proof' && (
                <div data-testid="order-proofs">
                  <p className="state">Paid per provider transaction visible on chain. The voucher is signed automatically by the buyer agent (payForProofs), not from this page.</p>
                  <QueryState query={proofs} loadingLabel="Loading proofs" isEmpty={(d) => d.length === 0} empty={kind === 'delegate' ? 'No votes claimed yet.' : 'No matching provider transactions yet.'}>
                    {(items) => (
                      <ul aria-label="On-chain proofs">
                        {items.map((p) => (
                          <li key={p.txHash}>
                            <code>{p.txHash}</code> · {p.method} · <code>{shortAccount(p.signer)}</code>
                            {p.proposalId !== undefined && <> · proposal {p.proposalId} · {p.action} · <code>{p.proposalKind}</code></>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </QueryState>
                </div>
              )}
              {kind === 'delegate' && account === view.order.seller && view.status === 'open' && <ClaimVote view={view} hash={hash} voucherKey={voucherKey} busy={busy} run={run} />}
            </>
          )
        }}
      </QueryState>
      {message && <p className="state" role="status">{message}</p>}
      {error && <p className="state state-error" role="alert">{error}</p>}
    </section>
  )
}

export function Orders() {
  const { account } = useWallet()
  const [selected, setSelected] = useState<string | null>(null)
  const [voucherKey, setVoucherKey] = useState('')
  const orders = useOrders(account ? { party: account } : {}, Boolean(account))
  return (
    <>
      <h2>Service orders</h2>
      {!account && <p className="state">Sign in with your wallet to see your orders.</p>}
      {account && (
        <QueryState query={orders} loadingLabel="Loading orders" isEmpty={(d) => d.items.length === 0} empty="No orders for this account yet.">
          {(data) => (
            <div className="table-wrap">
              <table aria-label="Order list">
                <thead><tr><th>Kind</th><th>Buyer</th><th>Seller</th><th>Milestones</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {data.items.map((o) => (
                    <tr key={o.orderHash} aria-selected={selected === o.orderHash}>
                      <td>{KIND_LABEL[o.order.kind as keyof typeof KIND_LABEL] ?? o.order.kind}</td>
                      <td><code>{shortAccount(o.order.buyer)}</code></td>
                      <td><code>{shortAccount(o.order.seller)}</code></td>
                      <td>{o.milestones.length}</td>
                      <td>{o.status}</td>
                      <td><button type="button" aria-label={`Open order ${o.orderHash.slice(0, 8)}`} onClick={() => setSelected(o.orderHash)}>Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      )}
      {selected && <OrderDetail hash={selected} voucherKey={voucherKey} />}
      <CreateOrder voucherKey={voucherKey} onVoucherKey={setVoucherKey} onCreated={setSelected} />
    </>
  )
}
