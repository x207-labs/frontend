import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { viewContract } from '../api/chain'
import { useInvoice, useInvoices } from '../api/queries'
import type { InstallmentReason, InstallmentStatus, InstallmentView, InvoiceStatus, InvoiceView } from '../api/types'
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
import { AgentText } from '../ds/components'
import { assertInvoiceHash, buildApproval, buildCatchUp, buildCreateInvoice, buildRejection } from '../lib/invoiceFlow'
import { describeMarketError } from '../lib/marketError'
import { formatCredit } from '../lib/format'
import { useWallet } from '../wallet/WalletContext'

// FE-025: invoices and installments (pipeline P8, ADR-44), built from Backend API Spec 5e. The issuer requests, the debtor approves by signing all installment vouchers
// at once (seq 1 in their epoch) or declines; a failed installment is shifted once with a follow-up voucher signed after the failure. An upfront signature is evidence,
// not a payment guarantee (ADR-44): the page says so where the debtor can see it.
// FE-057: the invoice list can be filtered and sorted on what the reader sees.
// FE-073: one role at a time (your invoices, one invoice, request a new one). The panes stay in the DOM and only hide in CSS. The voucher key field exists once: in the form,
// or in the open invoice when it has something to sign.
type Tone = 'ok' | 'warn' | 'bad' | 'info'
type View = 'list' | 'detail' | 'request'

const INVOICE_COLUMNS: Column<InvoiceView>[] = [
  { key: 'number', label: 'Number', sortValue: (i) => i.document.id },
  { key: 'parties', label: 'Issuer, debtor', sortValue: (i) => i.document.issuer },
  { key: 'amount', label: 'Amount (credit)', sortValue: (i) => BigInt(i.document.amount), className: 'num' },
  { key: 'installments', label: 'Installments', sortValue: (i) => i.installments.length },
  { key: 'status', label: 'Status', sortValue: (i) => i.status },
  { key: 'open', label: '' },
]
const invoiceText = (i: InvoiceView) => `${i.document.id} ${i.document.issuer} ${i.document.debtor} ${i.status} ${i.invoiceHash.slice(0, 8)}`

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  requested: 'Requested', approved: 'Approved', registered: 'Registered', rejected: 'Rejected', expired: 'Expired', missed: 'Missed',
}
/** FE-081: how one installment shows in the list bar. A registered installment is paid; a shifted one waits one epoch more. */
const INSTALLMENT_STEP: Record<InstallmentStatus, StepTone> = { scheduled: 'todo', registered: 'done', shifted: 'active', missed: 'bad' }
// v4: the tone is the x207 result code (ok 200, info 202, warn 402, bad 409): approved is accepted (202), only a registered invoice is settled (200); a request that waits, or has expired, is no result code
const STATUS_TONE: Record<InvoiceStatus, Tone | undefined> = { requested: undefined, approved: 'info', registered: 'ok', rejected: 'bad', expired: undefined, missed: 'bad' }
const INSTALLMENT_LABEL: Record<InstallmentStatus, string> = { scheduled: 'Scheduled', registered: 'Registered', shifted: 'Shifted', missed: 'Missed' }
const INSTALLMENT_TONE: Record<InstallmentStatus, Tone> = { scheduled: 'info', registered: 'ok', shifted: 'warn', missed: 'bad' }
const REASON_LABEL: Record<InstallmentReason, string> = {
  headroom: 'debtor headroom exhausted',
  blocked_by_debtor: 'blocked by the debtor',
}
const STATUS_FILTERS = ['', 'requested', 'approved', 'registered', 'rejected', 'expired', 'missed'] as const

type Obligation = { cumulative: string; last_seq: number } | null

const Pill = ({ tone, children }: { tone?: Tone; children: ReactNode }) => <span className="pill" data-tone={tone}>{children}</span>
/** A failed installment the debtor may still shift once (a catch-up voucher is signed after the failure). */
const canShift = (item: InstallmentView) => item.reason === 'headroom' && item.status === 'scheduled' && !item.shifted

function CreateInvoice({ voucherKey, onVoucherKey, showKey, onCreated }: { voucherKey: string; onVoucherKey: (v: string) => void; showKey: boolean; onCreated: (hash: string) => void }) {
  const { account } = useWallet()
  const client = useQueryClient()
  const [debtor, setDebtor] = useState('')
  const [id, setId] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [installments, setInstallments] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = Boolean(account) && debtor.trim() !== '' && id.trim() !== '' && amount.trim() !== '' && voucherKey.trim() !== ''

  async function submit() {
    if (!account) return
    setBusy(true)
    setError(null)
    try {
      const built = await buildCreateInvoice({ circle: CONTRACT_ID, issuer: account, debtor, id, amount, memo, installments, secretKey: voucherKey, now: Math.floor(Date.now() / 1000) })
      if (typeof built === 'string') {
        setError(built)
        return
      }
      await api.createInvoice(built.body)
      await client.invalidateQueries({ queryKey: ['invoices'] })
      onCreated(built.invoiceHash)
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" aria-label="Request invoice" onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <label><span>Debtor (who pays you)</span><input value={debtor} onChange={(e) => setDebtor(e.target.value)} placeholder="maker.x207-circle.near" /></label>
      <div className="field-pair">
        <label><span>Invoice number</span><input value={id} onChange={(e) => setId(e.target.value)} placeholder="INV-2026-001" /></label>
        <label><span>Amount (credit)</span><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>
      </div>
      <div className="field-pair">
        <label><span>Number of installments (1 to 24)</span><input value={installments} onChange={(e) => setInstallments(e.target.value)} inputMode="numeric" /></label>
        <label><span>Memo (optional)</span><input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={256} /></label>
      </div>
      {showKey && <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />}
      <div><button type="submit" disabled={!ready || busy}>{busy ? 'Signing…' : 'Sign and request'}</button></div>
      {error && <p className="state state-error" role="alert">{error}</p>}
    </form>
  )
}

function InstallmentRow({ item, canCatchUp, onCatchUp, busy }: { item: InstallmentView; canCatchUp: boolean; onCatchUp: () => void; busy: boolean }) {
  const moved = item.shifted && item.voucherEpoch !== null
  return (
    <tr>
      <td className="ms-index" data-label="Installment">{item.index}</td>
      <td data-label="Epoch">{item.epoch}</td>
      <td className="num" data-label="Amount (credit)">{formatCredit(item.amount)}</td>
      <td data-label="Status">
        {!(moved && item.status === 'shifted') && <Pill tone={INSTALLMENT_TONE[item.status]}>{INSTALLMENT_LABEL[item.status]}</Pill>}
        {moved && <p className="item-meta">shifted to epoch {item.voucherEpoch}</p>}
        {item.reason && <p className="item-meta">{REASON_LABEL[item.reason]}</p>}
      </td>
      <td>
        {canCatchUp && (
          <button type="button" disabled={busy} onClick={onCatchUp} aria-label={`Catch-up installment ${item.index}`}>
            Sign catch-up
          </button>
        )}
      </td>
    </tr>
  )
}

function InvoiceDetail({ hash, voucherKey, onVoucherKey, showKey }: { hash: string; voucherKey: string; onVoucherKey: (v: string) => void; showKey: boolean }) {
  const { account } = useWallet()
  const client = useQueryClient()
  const query = useInvoice(hash)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function act(run: (view: InvoiceView) => Promise<string | null>) {
    if (!query.data) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const done = await run(query.data)
      if (done !== null) setMessage(done)
      await client.invalidateQueries({ queryKey: ['invoice', hash] })
      await client.invalidateQueries({ queryKey: ['invoices'] })
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }
  const fail = (text: string): null => (setError(text), null)

  const approve = () => act(async (view) => {
    const vouchers = await buildApproval(CONTRACT_ID, view, voucherKey, hash)
    if (typeof vouchers === 'string') return fail(vouchers)
    await api.approveInvoice(hash, vouchers)
    return `Approved. ${vouchers.length} installment vouchers signed, one per epoch.`
  })
  const reject = () => act(async (view) => {
    await assertInvoiceHash(view, hash)
    const { notice, signature } = await buildRejection(CONTRACT_ID, view, account!, '', Math.floor(Date.now() / 1000), voucherKey)
    await api.rejectInvoice(hash, notice, signature)
    return 'Invoice rejected.'
  })
  const catchUp = (item: InstallmentView) => act(async (view) => {
    // pair state in the target epoch from the contract, not a guess: the follow-up voucher continues it
    const target = item.epoch + 1
    const ob = await viewContract<Obligation>('obligation', { epoch: target, debtor: view.document.debtor, creditor: view.document.issuer })
    const state = { seq: ob?.last_seq ?? 0, cumulativeAmount: ob?.cumulative ?? '0' }
    const built = await buildCatchUp(CONTRACT_ID, view, item.index, state, item.shifted, voucherKey)
    if (typeof built === 'string') return fail(built)
    await api.catchUpInstallment(hash, item.index, built.voucher, built.signature)
    return `Catch-up voucher for installment ${item.index} signed for epoch ${target}.`
  })

  return (
    <section aria-label="Invoice details">
      <QueryState query={query} loadingLabel="Loading invoices">
        {(view) => {
          const doc = view.document
          const isDebtor = account === doc.debtor
          const isIssuer = account === doc.issuer
          const requested = view.status === 'requested'
          const needsKey = isDebtor && (requested || view.installments.some(canShift))
          const amount = formatCredit(doc.amount)
          return (
            <>
              <h2>{doc.id} <Pill tone={STATUS_TONE[view.status]}>{STATUS_LABEL[view.status]}</Pill></h2>
              <dl className="figures">
                <div><dt>Amount</dt><dd>{amount} credit</dd></div>
                <div><dt>Installments</dt><dd>{view.installments.length}</dd></div>
              </dl>
              <dl className="status-panel kv">
                <dt>Issuer</dt><dd><code>{doc.issuer}</code>{isIssuer && <> <Pill>You</Pill></>}</dd>
                <dt>Debtor</dt><dd><code>{doc.debtor}</code>{isDebtor && <> <Pill>You</Pill></>}</dd>
                {doc.memo && <><dt>Memo</dt><dd><AgentText>{doc.memo}</AgentText></dd></>}
              </dl>
              {view.rejectReason && <p className="state" role="status">Rejection reason: <AgentText>{view.rejectReason}</AgentText></p>}
              {view.needsBond && <p className="state state-warn" role="status" data-testid="invoice-bond">Needs a two-sided bond before it is registered (CT-094).</p>}
              <h3>Installments</h3>
              <div className="table-wrap">
                <table aria-label="Installment schedule">
                  <thead><tr><th>#</th><th>Epoch</th><th className="num">Amount (credit)</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {view.installments.map((item) => (
                      <InstallmentRow
                        key={item.index}
                        item={item}
                        busy={busy}
                        canCatchUp={isDebtor && canShift(item)}
                        onCatchUp={() => void catchUp(item)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {view.installments.some((i) => i.reason === 'blocked_by_debtor') && (
                <p className="state state-error" role="status" data-testid="invoice-blocked">
                  Blocked by the debtor: no catch-up is possible. Only reputation and the bond (CT-094) answer it.
                </p>
              )}
              {isDebtor && requested && (
                <>
                  <p className="state" data-testid="invoice-advance-note">
                    Approving signs {view.installments.length} vouchers now, one per epoch. It proves you accept the invoice, not a guarantee of payment.
                  </p>
                  <details className="tech">
                    <summary>How approval works</summary>
                    <p>
                      The contract lets a voucher with a higher seq go first, so an upfront signature is evidence, not a guarantee for the issuer. There are no spare vouchers:
                      if an installment fails, a catch-up voucher is signed only after the failure.
                    </p>
                  </details>
                </>
              )}
              {showKey && (needsKey || voucherKey !== '') && <div className="form"><VoucherKeyField value={voucherKey} onChange={onVoucherKey} /></div>}
              {isDebtor && requested && (
                <div>
                  <button type="button" className="glow" disabled={busy || voucherKey.trim() === ''} onClick={() => void approve()} aria-label={`Approve and sign ${view.installments.length} installments: ${amount} credit to ${doc.issuer}`}>
                    Approve and sign {view.installments.length} installments
                  </button>{' '}
                  <button type="button" className="quiet" disabled={busy || voucherKey.trim() === ''} onClick={() => void reject()} aria-label={`Reject invoice ${amount} credit from ${doc.issuer}`}>
                    Reject
                  </button>
                </div>
              )}
              {isIssuer && requested && <p className="state">Waiting for the debtor to approve.</p>}
              <details className="tech">
                <summary>Technical details</summary>
                <dl className="kv">
                  <dt>Invoice hash</dt><dd><code>{view.invoiceHash}</code><CopyButton value={view.invoiceHash} label="invoice hash" /></dd>
                </dl>
              </details>
            </>
          )
        }}
      </QueryState>
      {/* the key field must stay mounted while a key is held (it clears the key after idle), also while the invoice is loading or failed */}
      {showKey && voucherKey !== '' && query.data === undefined && <div className="form"><VoucherKeyField value={voucherKey} onChange={onVoucherKey} /></div>}
      {message && <p className="state" role="status">{message}</p>}
      {error && <p className="state state-error" role="alert">{error}</p>}
    </section>
  )
}

export function Invoices() {
  const { account } = useWallet()
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [voucherKey, setVoucherKey] = useState(demoVoucherKey)
  const [picked, setPicked] = useState<View | null>(null)
  const query: Record<string, string> = { ...(account ? { party: account } : {}), ...(status ? { status } : {}) }
  const invoices = useInvoices(query, Boolean(account))
  // A first visit with nothing to list starts on the request form; everything else starts on the list.
  const nothingYet = status === '' && invoices.data !== undefined && invoices.data.items.length === 0
  const shown: View = picked ?? (account && !nothingYet ? 'list' : 'request')
  const open = (hash: string) => { setSelected(hash); setPicked('detail') }

  return (
    <div className="mk" data-mk="invoices">
      <div className="page-lead">
        <span className="tone-tile" aria-hidden="true" style={{ ['--tone' as string]: PAGE_HUE['/invoices'] }}>
          <NavIcon name="/invoices" size={22} />
        </span>
        <p>Ask a customer to pay in installments, or approve an invoice sent to you.</p>
        <ol className="lead-steps" aria-label="How it works">
          <li>Issuer requests</li>
          <li>Debtor approves</li>
          <li>Paid each epoch</li>
        </ol>
      </div>
      {!account && <SignInPrompt action="see your invoices" />}
      <div className="views" data-view={shown}>
        <div className="view-tabs">
          <div className="segmented" role="group" aria-label="Invoice view">
            <button type="button" aria-pressed={shown !== 'request'} onClick={() => setPicked('list')}>Your invoices</button>
            <button type="button" aria-pressed={shown === 'request'} onClick={() => setPicked('request')}>Request</button>
          </div>
        </div>
        <section className="views-pane" data-pane="list" data-active={shown === 'list'} aria-label="Your invoices">
          <div className="filters">
            <label>
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === '' ? 'All' : STATUS_LABEL[s]}</option>)}
              </select>
            </label>
          </div>
          {account && (
            <QueryState
              query={invoices}
              loadingLabel="Loading invoices"
              isEmpty={(d) => d.items.length === 0}
              empty={<>No invoices yet. <button type="button" className="quiet" onClick={() => setPicked('request')}>Request one</button></>}
            >
              {(data) => (
                <SortableTable
                  label="Invoice list"
                  filterLabel="Filter the invoices shown"
                  rows={data.items}
                  columns={INVOICE_COLUMNS}
                  searchText={invoiceText}
                  renderRow={(i) => (
                    <tr key={i.invoiceHash} aria-selected={selected === i.invoiceHash}>
                      <td><ItemTitle icon="/invoices" hue={PAGE_HUE['/invoices']} title={i.document.id} sub={i.document.memo ? <AgentText>{i.document.memo}</AgentText> : undefined} /></td>
                      <td data-label="Issuer, debtor"><PartyPair from={i.document.issuer} to={i.document.debtor} account={account} joint="bills" /></td>
                      <td className="num" data-label="Amount (credit)"><span className="amount">{formatCredit(i.document.amount)}</span></td>
                      <td data-label="Installments"><StepBar steps={i.installments.map((s) => INSTALLMENT_STEP[s.status])} doneLabel="installments paid" /></td>
                      <td data-label="Status"><Pill tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</Pill></td>
                      <td><button type="button" className="quiet" aria-label={`Open ${i.document.id}`} onClick={() => open(i.invoiceHash)}>Open</button></td>
                    </tr>
                  )}
                />
              )}
            </QueryState>
          )}
        </section>
        <section className="views-pane" data-pane="detail" data-active={shown === 'detail'} aria-label="Selected invoice">
          <button type="button" className="quiet" onClick={() => setPicked('list')}>Back to your invoices</button>
          {selected && <InvoiceDetail hash={selected} voucherKey={voucherKey} onVoucherKey={setVoucherKey} showKey={shown === 'detail'} />}
        </section>
        <section className="views-pane" data-pane="request" data-active={shown === 'request'} aria-label="Request an invoice">
          <CreateInvoice voucherKey={voucherKey} onVoucherKey={setVoucherKey} showKey={shown !== 'detail'} onCreated={open} />
        </section>
      </div>
    </div>
  )
}
