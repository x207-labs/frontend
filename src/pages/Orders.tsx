import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { ApiError, api } from '../api/client'
import { useDaoRegistry, useOrder, useOrderProofs, useOrders } from '../api/queries'
import type { MilestoneStatus, OrderMilestoneView, OrderView } from '../api/types'
import { CopyButton } from '../components/CopyButton'
import { NavIcon } from '../components/icons'
import { PAGE_HUE } from '../components/pageHue'
import { ItemTitle, PartyPair, StepBar, type StepTone } from '../components/ListBits'
import { QueryState } from '../components/QueryState'
import { SignInPrompt } from '../components/SignInPrompt'
import { SortableTable, type Column } from '../components/SortableTable'
import { VoucherKeyField } from '../components/VoucherKeyField'
import { CONTRACT_ID } from '../config'
import { demoVoucherKey } from '../demo/mode'
import { formatCredit, formatTime, shortAccount } from '../lib/format'
import { describeMarketError } from '../lib/marketError'
import {
  CLAIM_REASON, CREATABLE_KINDS, EMPTY_ORDER, KIND_LABEL, assertMandate, assertOrderHash, KIND_NOTE, ORDER_PATTERN, PROOF_METHODS, buildCreateOrder, mandateHashOf, milestoneNotice, orderHashOf, signClaim, signNotice, toMandate, toOrderDocument,
  type MilestoneAction, type OrderForm, type OutcomeAction,
} from '../lib/orderFlow'
import { useWallet } from '../wallet/WalletContext'

// FE-027: service orders (pipeline P6, ADR-45), built from Backend API Spec 5f. The buyer creates an order with milestones; the seller delivers, the buyer confirms or
// disputes within the window (ADR-42); leads and bugs are paid per result; keeper and solver are paid per tx the buyer's agent sees on-chain (the page only shows the proof).
// FE-073: one thing at a time (your orders, one order, a new order). The panes stay in the DOM and only hide in CSS. The voucher key field exists once: in the form,
// or in the open order when the viewer has something to sign.
type Tone = 'ok' | 'warn' | 'bad' | 'info'
type View = 'list' | 'detail' | 'new'

const MILESTONE_LABEL: Record<string, string> = { open: 'Open', delivered: 'Delivered', confirmed: 'Confirmed', disputed: 'Disputed', paid: 'Paid', cancelled: 'Cancelled' }
const MILESTONE_TONE: Record<string, Tone | undefined> = { open: 'info', delivered: 'warn', confirmed: 'ok', paid: 'ok', disputed: 'bad' }
/** FE-081: how one milestone shows in the list bar. Paid is done; delivered or confirmed waits on payment; a dispute is red; cancelled counts as not done. */
const MILESTONE_STEP: Record<MilestoneStatus, StepTone> = { open: 'todo', delivered: 'active', confirmed: 'active', disputed: 'bad', paid: 'done', cancelled: 'todo' }
const ORDER_TONE: Record<string, Tone | undefined> ={ proposed: 'warn', open: 'info', completed: 'ok', settled: 'ok', disputed: 'bad' }
const REASONS = [['not_received', 'Not received'], ['not_as_described', 'Not as described'], ['other', 'Other']] as const
/** Kinds whose note is a warning the buyer must see before ordering: shown open. */
const WARN_KINDS: readonly string[] = ['scraping', 'loadtest']
const now = () => Math.floor(Date.now() / 1000)

const Pill = ({ tone, children }: { tone?: Tone; children: ReactNode }) => <span className="pill" data-tone={tone}>{children}</span>
/** The catalogue number in front of a kind ("39. Prompt…") is for the docs, not for the reader. */
const plainKind = (label: string) => label.replace(/^\d+\. /, '')
const titleCase = (text: string) => {
  const spaced = text.replaceAll('_', ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
/** A long transaction hash is shortened on the card; a short one is shown whole. */
const shortTx = (hash: string) => (hash.length > 20 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash)

/** B5-F4 (review BE-062): the backend only checks that the account answers `get_policy`; whether it is the DAO that the buyer means is the buyer's to check, so the page says whether the circle knows the account. */
function DaoNote({ dao }: { dao: string }) {
  const registry = useDaoRegistry()
  if (dao.trim() === '') return null
  if (registry.isPending) return null
  if (registry.data === null || registry.data === undefined) return <p className="state" role="note" data-testid="dao-note">The circle DAO registry is unavailable. Check the DAO address yourself.</p>
  if (registry.data.includes(dao.trim())) return <p className="state" role="note" data-testid="dao-note">This DAO is in the circle registry.</p>
  return <p className="state state-error" role="note" data-testid="dao-note">This DAO is not in the circle registry. Check the address before you sign.</p>
}

function CreateOrder({ voucherKey, onVoucherKey, showKey, onCreated }: { voucherKey: string; onVoucherKey: (v: string) => void; showKey: boolean; onCreated: (hash: string) => void }) {
  const { account } = useWallet()
  const client = useQueryClient()
  const [form, setForm] = useState<OrderForm>(EMPTY_ORDER)
  const [counterparty, setCounterparty] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof OrderForm>(key: K, value: OrderForm[K]) => setForm((prev) => ({ ...prev, [key]: value }))
  const pattern = form.kind === '' ? null : ORDER_PATTERN[form.kind]
  const note = form.kind === '' ? undefined : KIND_NOTE[form.kind]
  const warning = WARN_KINDS.includes(form.kind)
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
      <label>
        <span>Service kind</span>
        <select value={form.kind} onChange={(e) => setForm({ ...EMPTY_ORDER, seller: form.seller, kind: e.target.value as OrderForm['kind'] })}>
          <option value="">Choose a kind</option>
          {CREATABLE_KINDS.map((k) => <option key={k} value={k}>{plainKind(KIND_LABEL[k])}</option>)}
        </select>
      </label>
      {note && (
        <details className="tech" key={form.kind} open={warning} data-testid="order-note">
          <summary>{warning ? 'Read this first' : 'About this kind of order'}</summary>
          <p>{note}</p>
        </details>
      )}
      <label><span>Seller</span><input value={form.seller} onChange={(e) => set('seller', e.target.value)} placeholder="audit.x207-circle.near" /></label>
      <label><span>Work specification</span><textarea value={form.spec} onChange={(e) => set('spec', e.target.value)} rows={3} placeholder="What should be done? Only a hash of this text is sent." /></label>
      {form.kind === 'prompt' && (
        <label><span>Sample result</span><textarea value={form.sample} onChange={(e) => set('sample', e.target.value)} rows={2} placeholder="Required. Only a hash of this text is sent." /></label>
      )}
      {form.kind === 'loadtest' && (
        <label><span>Load test target</span><input value={form.target} onChange={(e) => set('target', e.target.value)} placeholder="shop.example.com" /></label>
      )}
      {form.kind === 'delegate' && (
        <fieldset aria-label="Mandate">
          <legend>Public mandate</legend>
          <label><span>DAO account</span><input value={form.dao} onChange={(e) => set('dao', e.target.value)} placeholder="gauge.sputnik-dao.near" /></label>
          <DaoNote dao={form.dao} />
          <label><span>Paid proposal kinds</span><input value={form.kinds} onChange={(e) => set('kinds', e.target.value)} placeholder="transfer, function_call" /></label>
          <label><span>Rules text</span><textarea value={form.rules} onChange={(e) => set('rules', e.target.value)} rows={3} placeholder="When the delegate votes what. Only a hash of this text is locked." /></label>
        </fieldset>
      )}
      {pattern === 'proof' && form.kind !== '' && (
        <div className="field-pair">
          <label>
            <span>Method counted as proof</span>
            <select value={form.proofMethod} onChange={(e) => set('proofMethod', e.target.value)}>
              <option value="">Choose a method</option>
              {PROOF_METHODS[form.kind as 'keeper' | 'solver' | 'delegate'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label><span>{form.kind === 'delegate' ? 'Payment per vote (credit)' : 'Payment per transaction (credit)'}</span><input value={form.proofAmount} onChange={(e) => set('proofAmount', e.target.value)} inputMode="decimal" /></label>
        </div>
      )}
      <fieldset>
        <legend>{pattern === 'outcome' ? 'Results to pay for (credit, due times in UTC)' : pattern === 'proof' ? 'Budget (credit, due times in UTC)' : 'Milestones (credit, due times in UTC)'}</legend>
        {form.milestones.map((m, k) => (
          <div key={k} className="side">
            <div className="field-pair">
              <label><span>Amount</span><input aria-label={`Amount ${k + 1} (credit)`} value={m.amount} onChange={(e) => setMilestone(k, 'amount', e.target.value)} inputMode="decimal" /></label>
              <label><span>Due</span><input aria-label={`Due ${k + 1} (UTC)`} type="datetime-local" value={m.due} onChange={(e) => setMilestone(k, 'due', e.target.value)} /></label>
            </div>
          </div>
        ))}
        <button type="button" className="quiet" disabled={form.milestones.length >= 24} onClick={() => set('milestones', [...form.milestones, { amount: '', due: '' }])}>Add milestone</button>
      </fieldset>
      <details className="tech">
        <summary>The seller already signed? Add their signature</summary>
        <label><span>Seller signature (optional)</span><input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="audit.x207-circle.near ed25519:…" /></label>
      </details>
      {showKey && <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />}
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
        <Pill tone={MILESTONE_TONE[m.status]}>{MILESTONE_LABEL[m.status] ?? m.status}</Pill>
        {m.autoConfirmed && <p className="item-meta">Confirmed automatically after the dispute window</p>}
        {m.outcome && <p className="item-meta">Outcome: {m.outcome}</p>}
        {m.disputeReason && <p className="item-meta">Reason: {titleCase(m.disputeReason)}</p>}
      </td>
      <td>{m.deliverableHash ? <code>{m.deliverableHash.slice(0, 12)}</code> : '-'}</td>
      <td>
        {pattern !== 'proof' && isSeller && m.status === 'open' && (
          <div>
            <input aria-label={`Deliverable hash ${m.index}`} value={deliverable} onChange={(e) => setDeliverable(e.target.value)} placeholder="64-character hex hash" />{' '}
            {pattern === 'milestone' ? (
              <button type="button" disabled={busy || keyless || !goodHash} onClick={() => act('delivered')}>Mark delivered</button>
            ) : (
              <button type="button" disabled={busy || keyless || !goodHash} onClick={() => outcome('proposed')}>Propose outcome</button>
            )}
          </div>
        )}
        {pattern === 'milestone' && isBuyer && m.status === 'delivered' && (
          <div>
            <button type="button" disabled={busy || keyless} onClick={() => act('confirmed')} aria-label={`Confirm ${m.index}`}>Confirm</button>{' '}
            <select aria-label={`Dispute reason ${m.index}`} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>{' '}
            <button type="button" className="quiet" disabled={busy || keyless} onClick={() => act('disputed')} aria-label={`Dispute ${m.index}`}>Dispute</button>
          </div>
        )}
        {pattern === 'outcome' && isBuyer && m.status === 'delivered' && (
          <div>
            <button type="button" disabled={busy || keyless} onClick={() => outcome('accepted')} aria-label={`Accept outcome ${m.index}`}>Accept</button>{' '}
            <button type="button" className="quiet" disabled={busy || keyless} onClick={() => outcome('rejected')} aria-label={`Reject outcome ${m.index}`}>Reject</button>
          </div>
        )}
        {pattern !== 'proof' && canCancel && <div><button type="button" className="quiet" disabled={busy || keyless} onClick={() => act('cancelled')} aria-label={`Cancel ${m.index}`}>Cancel</button></div>}
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
      <label><span>Hash of the vote transaction</span><input value={tx} onChange={(e) => setTx(e.target.value)} placeholder="Base58 transaction hash" /></label>
      <div><button type="button" disabled={busy || voucherKey.trim() === '' || tx.trim() === ''} onClick={claim}>Sign and claim</button></div>
    </div>
  )
}

function OrderDetail({ hash, voucherKey, onVoucherKey, showKey }: { hash: string; voucherKey: string; onVoucherKey: (v: string) => void; showKey: boolean }) {
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
    <section aria-label="Order details">
      <QueryState query={query} loadingLabel="Loading orders">
        {(view) => {
          const kind = view.order.kind as keyof typeof ORDER_PATTERN
          const pattern = ORDER_PATTERN[kind]
          const isBuyer = account === view.order.buyer
          const isSeller = account === view.order.seller
          // the viewer has something to sign: a milestone to act on, or (delegate seller) a vote to claim
          const actionable = pattern === 'proof' ? kind === 'delegate' && isSeller && view.status === 'open' : view.milestones.some((m) => m.status === 'open' || m.status === 'delivered')
          const needsKey = (isBuyer || isSeller) && actionable
          const total = view.milestones.reduce((sum, m) => sum + (/^\d+$/.test(m.amount) ? BigInt(m.amount) : BigInt(0)), BigInt(0))
          const note = KIND_NOTE[kind]
          return (
            <>
              <h2>{plainKind(KIND_LABEL[kind] ?? view.order.kind)} <Pill tone={ORDER_TONE[view.status]}>{titleCase(view.status)}</Pill></h2>
              <dl className="figures">
                <div><dt>Total</dt><dd>{formatCredit(total.toString())} credit</dd></div>
                <div><dt>Milestones</dt><dd>{view.milestones.length}</dd></div>
              </dl>
              <dl className="status-panel">
                <dt>Buyer</dt><dd><code>{view.order.buyer}</code>{isBuyer && <> <Pill tone="info">You</Pill></>}</dd>
                <dt>Seller</dt><dd><code>{view.order.seller}</code>{isSeller && <> <Pill tone="info">You</Pill></>}</dd>
                {view.order.target && (<><dt>Target</dt><dd><code>{view.order.target}</code> <Pill tone={view.targetVerified ? 'ok' : 'warn'}>{view.targetVerified ? 'Ownership proven' : 'Ownership not yet proven'}</Pill></dd></>)}
                {view.order.proof && (<><dt>Payment</dt><dd>{formatCredit(view.order.proof.amountPerTx)} credit per {kind === 'delegate' ? 'vote' : 'transaction'}</dd></>)}
              </dl>
              {view.status === 'proposed' && <p className="state" role="status">Waiting for a signature: the order opens after both parties sign.</p>}
              {view.needsBond && <p className="state state-warn" role="status" data-testid="order-bond">Needs a two-sided bond and an arbiter (CT-094).</p>}
              {kind === 'delegate' && view.mandate && (
                <section aria-label="Mandate" data-testid="order-mandate">
                  <h3>Mandate</h3>
                  <dl className="status-panel">
                    <dt>DAO</dt><dd><code>{view.mandate.dao}</code><DaoNote dao={view.mandate.dao} /></dd>
                    <dt>Paid proposal kinds</dt><dd>{view.mandate.kinds.map((k) => <span key={k}><Pill>{k}</Pill>{' '}</span>)}</dd>
                  </dl>
                  <details className="tech">
                    <summary>Mandate hashes</summary>
                    <dl>
                      <dt>Rules (hash)</dt><dd><code>{view.mandate.rulesHash}</code></dd>
                      <dt>Mandate hash</dt><dd><code>{view.order.mandateHash}</code></dd>
                    </dl>
                  </details>
                </section>
              )}
              {view.order.target && view.targetVerified === false && (
                <div>
                  <button type="button" className="quiet" disabled={busy} onClick={() => run('target checked', async () => { await api.orderTargetCheck(view.orderHash) })}>Check target ownership</button>
                </div>
              )}
              {showKey && (needsKey || voucherKey !== '') && <div className="form"><VoucherKeyField value={voucherKey} onChange={onVoucherKey} /></div>}
              <h3>Milestones</h3>
              <div className="table-wrap">
                <table aria-label="Milestones">
                  <thead><tr><th>#</th><th>Amount</th><th>Due</th><th>Status</th><th>Deliverable</th><th /></tr></thead>
                  <tbody>
                    {view.milestones.map((m) => <MilestoneRow key={m.index} view={view} opened={hash} m={m} account={account} voucherKey={voucherKey} busy={busy} run={run} />)}
                  </tbody>
                </table>
              </div>
              {pattern === 'outcome' && isBuyer && view.milestones.some((m) => m.status === 'delivered') && (
                <p className="state">A silent buyer does not pay: lead and bug outcomes are not confirmed automatically.</p>
              )}
              {pattern === 'proof' && (
                <div data-testid="order-proofs">
                  <h3>Paid transactions</h3>
                  <p className="state">Each matching transaction on chain is paid automatically.</p>
                  <details className="tech">
                    <summary>How payment works</summary>
                    <p>The voucher is signed by the buyer agent (payForProofs), not from this page.</p>
                  </details>
                  <QueryState query={proofs} loadingLabel="Loading proofs" isEmpty={(d) => d.length === 0} empty={kind === 'delegate' ? 'No votes claimed yet.' : 'No matching provider transactions yet.'}>
                    {(items) => (
                      <ul className="item-cards" aria-label="On-chain proofs">
                        {items.map((p) => (
                          <li key={p.txHash} className="item-card">
                            <span className="tone-tile" aria-hidden="true" style={{ ['--tone' as string]: PAGE_HUE['/orders'] }}><NavIcon name="/orders" size={18} /></span>
                            <p className="item-title"><code>{shortTx(p.txHash)}</code></p>
                            <Pill tone="ok">{p.method}</Pill>
                            <p className="item-meta">Signed by <code>{shortAccount(p.signer)}</code></p>
                            {p.proposalId !== undefined && <p className="item-meta">Voted on proposal {p.proposalId}: {p.action}{p.proposalKind && <>, <code>{p.proposalKind}</code></>}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </QueryState>
                </div>
              )}
              {kind === 'delegate' && isSeller && view.status === 'open' && <ClaimVote view={view} hash={hash} voucherKey={voucherKey} busy={busy} run={run} />}
              <details className="tech">
                <summary>Technical details</summary>
                <dl>
                  <dt>Order hash</dt><dd><code>{view.orderHash}</code><CopyButton value={view.orderHash} label="order hash" /></dd>
                  <dt>Signed by</dt><dd>{view.signedBy.map(shortAccount).join(', ') || 'no one'}</dd>
                  {view.order.sampleHash && (<><dt>Sample (hash)</dt><dd><code>{view.order.sampleHash}</code></dd></>)}
                  {view.order.proof && (<><dt>Proof method</dt><dd><code>{view.order.proof.method}</code></dd></>)}
                </dl>
                {note && <p>{note}</p>}
              </details>
            </>
          )
        }}
      </QueryState>
      {/* the key field must stay mounted while a key is held (it clears the key after idle), also while the order is loading or failed */}
      {showKey && voucherKey !== '' && query.data === undefined && <div className="form"><VoucherKeyField value={voucherKey} onChange={onVoucherKey} /></div>}
      {message && <p className="state" role="status">{message}</p>}
      {error && <p className="state state-error" role="alert">{error}</p>}
    </section>
  )
}

// FE-057: the order list can be filtered and sorted on what the reader sees.
const kindLabel = (o: OrderView) => plainKind(KIND_LABEL[o.order.kind as keyof typeof KIND_LABEL] ?? o.order.kind)
const ORDER_COLUMNS: Column<OrderView>[] = [
  { key: 'kind', label: 'Kind', sortValue: kindLabel },
  { key: 'parties', label: 'Buyer, seller', sortValue: (o) => o.order.buyer },
  { key: 'milestones', label: 'Milestones', sortValue: (o) => o.milestones.length },
  { key: 'status', label: 'Status', sortValue: (o) => o.status },
  { key: 'open', label: '' },
]
const orderText = (o: OrderView) => `${kindLabel(o)} ${o.order.buyer} ${o.order.seller} ${o.status} ${o.orderHash.slice(0, 8)}`

export function Orders() {
  const { account } = useWallet()
  const [selected, setSelected] = useState<string | null>(null)
  const [voucherKey, setVoucherKey] = useState(demoVoucherKey)
  const [picked, setPicked] = useState<View | null>(null)
  const orders = useOrders(account ? { party: account } : {}, Boolean(account))
  // A first visit with nothing to list starts on the new order form; everything else starts on the list.
  const nothingYet = orders.data !== undefined && orders.data.items.length === 0
  const shown: View = picked ?? (account && !nothingYet ? 'list' : 'new')
  const open = (hash: string) => { setSelected(hash); setPicked('detail') }

  return (
    <>
      <div className="page-lead">
        <span className="tone-tile" aria-hidden="true" style={{ ['--tone' as string]: PAGE_HUE['/orders'] }}>
          <NavIcon name="/orders" size={22} />
        </span>
        <p>Order work as a buyer, or deliver and get paid as a seller.</p>
        <ol className="lead-steps" aria-label="How it works">
          <li>Buyer orders</li>
          <li>Seller delivers</li>
          <li>Buyer confirms</li>
        </ol>
      </div>
      {!account && <SignInPrompt action="see and create orders" />}
      <div className="views" data-view={shown}>
        <div className="view-tabs">
          <div className="segmented" role="group" aria-label="Order view">
            <button type="button" aria-pressed={shown !== 'new'} onClick={() => setPicked('list')}>Your orders</button>
            <button type="button" aria-pressed={shown === 'new'} onClick={() => setPicked('new')}>New order</button>
          </div>
        </div>
        <section className="views-pane" data-pane="list" data-active={shown === 'list'} aria-label="Your orders">
          {account && (
            <QueryState
              query={orders}
              loadingLabel="Loading orders"
              isEmpty={(d) => d.items.length === 0}
              empty={<>No orders yet. <button type="button" className="quiet" onClick={() => setPicked('new')}>Create one</button></>}
            >
              {(data) => (
                <SortableTable
                  label="Order list"
                  filterLabel="Filter the orders shown"
                  rows={data.items}
                  columns={ORDER_COLUMNS}
                  searchText={orderText}
                  renderRow={(o) => (
                    <tr key={o.orderHash} aria-selected={selected === o.orderHash}>
                      <td><ItemTitle icon="/orders" hue={PAGE_HUE['/orders']} title={kindLabel(o)} sub={`Order ${o.orderHash.slice(0, 8)}`} /></td>
                      <td><PartyPair from={o.order.buyer} to={o.order.seller} account={account} joint="buys from" /></td>
                      <td><StepBar steps={o.milestones.map((m) => MILESTONE_STEP[m.status])} doneLabel="milestones paid" /></td>
                      <td><Pill tone={ORDER_TONE[o.status]}>{titleCase(o.status)}</Pill></td>
                      <td><button type="button" className="quiet" aria-label={`Open order ${o.orderHash.slice(0, 8)}`} onClick={() => open(o.orderHash)}>Open</button></td>
                    </tr>
                  )}
                />
              )}
            </QueryState>
          )}
        </section>
        <section className="views-pane" data-pane="detail" data-active={shown === 'detail'} aria-label="Selected order">
          <button type="button" className="quiet" onClick={() => setPicked('list')}>Back to your orders</button>
          {selected && <OrderDetail hash={selected} voucherKey={voucherKey} onVoucherKey={setVoucherKey} showKey={shown === 'detail'} />}
        </section>
        <section className="views-pane" data-pane="new" data-active={shown === 'new'} aria-label="New order">
          <CreateOrder voucherKey={voucherKey} onVoucherKey={setVoucherKey} showKey={shown !== 'detail'} onCreated={open} />
        </section>
      </div>
    </>
  )
}
