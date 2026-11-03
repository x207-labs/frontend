import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import { viewContract } from '../api/chain'
import { useInvoice, useInvoices } from '../api/queries'
import type { InstallmentReason, InstallmentView, InvoiceStatus, InvoiceView } from '../api/types'
import { QueryState } from '../components/QueryState'
import { VoucherKeyField } from '../components/VoucherKeyField'
import { CONTRACT_ID } from '../config'
import { assertInvoiceHash, buildApproval, buildCatchUp, buildCreateInvoice, buildRejection } from '../lib/invoiceFlow'
import { describeMarketError } from '../lib/marketError'
import { formatCredit, shortAccount } from '../lib/format'
import { useWallet } from '../wallet/WalletContext'

// FE-025: invoice dan cicilan (pipeline P8, ADR-44), dibangun dari Spec API Backend 5e. Issuer mengajukan, debtor menyetujui dengan menandatangani semua voucher cicilan
// sekaligus (seq 1 di epochnya) atau menolak; cicilan yang gagal digeser sekali dengan voucher susulan yang ditandatangani setelah gagal. Tanda tangan di depan adalah bukti,
// bukan jaminan pembayaran (ADR-44): halaman memberi tahu itu di tempat yang dilihat debtor.
const STATUS_LABEL: Record<InvoiceStatus, string> = {
  requested: 'Requested', approved: 'Approved', registered: 'Registered', rejected: 'Rejected', expired: 'Expired', missed: 'Missed',
}
const REASON_LABEL: Record<InstallmentReason, string> = {
  headroom: 'debtor headroom exhausted',
  blocked_by_debtor: 'blocked by the debtor (a voucher with a higher seq was registered first)',
}
const STATUS_FILTERS = ['', 'requested', 'approved', 'registered', 'rejected', 'expired', 'missed'] as const

type Obligation = { cumulative: string; last_seq: number } | null

function CreateInvoice({ voucherKey, onVoucherKey, onCreated }: { voucherKey: string; onVoucherKey: (v: string) => void; onCreated: (hash: string) => void }) {
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
      <h3>Request an invoice (issuer)</h3>
      {!account && <p className="state">Sign in with your wallet to request an invoice.</p>}
      <label><span>Debtor (the account that pays the issuer)</span><input value={debtor} onChange={(e) => setDebtor(e.target.value)} placeholder="maker.x207-circle.near" /></label>
      <label><span>Invoice number</span><input value={id} onChange={(e) => setId(e.target.value)} placeholder="INV-2026-001" /></label>
      <label><span>Amount (credit)</span><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>
      <label><span>Memo</span><input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={256} /></label>
      <label><span>Number of installments (1 to 24, one per epoch)</span><input value={installments} onChange={(e) => setInstallments(e.target.value)} inputMode="numeric" /></label>
      <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />
      <div><button type="submit" disabled={!ready || busy}>{busy ? 'Signing…' : 'Sign and request'}</button></div>
      {error && <p className="state state-error" role="alert">{error}</p>}
    </form>
  )
}

function InstallmentRow({ item, canCatchUp, onCatchUp, busy }: { item: InstallmentView; canCatchUp: boolean; onCatchUp: () => void; busy: boolean }) {
  return (
    <tr>
      <td>{item.index}</td>
      <td>{item.epoch}</td>
      <td>{formatCredit(item.amount)}</td>
      <td>{item.status}{item.shifted && item.voucherEpoch !== null ? ` (shifted to epoch ${item.voucherEpoch})` : ''}</td>
      <td>{item.reason ? REASON_LABEL[item.reason] : '-'}</td>
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

function InvoiceDetail({ hash, voucherKey }: { hash: string; voucherKey: string }) {
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
    return `Approved: ${vouchers.length} installment vouchers signed, one per epoch.`
  })
  const reject = () => act(async (view) => {
    await assertInvoiceHash(view, hash)
    const { notice, signature } = await buildRejection(CONTRACT_ID, view, account!, '', Math.floor(Date.now() / 1000), voucherKey)
    await api.rejectInvoice(hash, notice, signature)
    return 'Invoice rejected.'
  })
  const catchUp = (item: InstallmentView) => act(async (view) => {
    // keadaan pasangan di epoch tujuan dari kontrak, bukan tebakan: voucher susulan melanjutkannya
    const target = item.epoch + 1
    const ob = await viewContract<Obligation>('obligation', { epoch: target, debtor: view.document.debtor, creditor: view.document.issuer })
    const state = { seq: ob?.last_seq ?? 0, cumulativeAmount: ob?.cumulative ?? '0' }
    const built = await buildCatchUp(CONTRACT_ID, view, item.index, state, item.shifted, voucherKey)
    if (typeof built === 'string') return fail(built)
    await api.catchUpInstallment(hash, item.index, built.voucher, built.signature)
    return `Catch-up voucher for installment ${item.index} signed for epoch ${target}.`
  })

  return (
    <section className="detail" aria-label="Invoice details">
      <QueryState query={query} loadingLabel="Loading invoices">
        {(view) => {
          const isDebtor = account === view.document.debtor
          const isIssuer = account === view.document.issuer
          return (
            <>
              <h3>{view.document.id} · {STATUS_LABEL[view.status]}</h3>
              <dl className="status-panel">
                <dt>Issuer (collector)</dt><dd><code>{view.document.issuer}</code></dd>
                <dt>Debtor</dt><dd><code>{view.document.debtor}</code></dd>
                <dt>Amount</dt><dd>{formatCredit(view.document.amount)} credit</dd>
                <dt>Memo</dt><dd>{view.document.memo || '-'}</dd>
                <dt>Hash</dt><dd><code>{view.invoiceHash}</code></dd>
              </dl>
              {view.rejectReason && <p className="state" role="status">Rejection reason: {view.rejectReason}</p>}
              {view.needsBond && <p className="state state-error" role="status" data-testid="invoice-bond">This invoice is at or above the bond threshold: it needs a two-sided bond (CT-094) before it is registered.</p>}
              <div className="table-wrap">
                <table aria-label="Installment schedule">
                  <thead><tr><th>#</th><th>Epoch</th><th>Amount</th><th>Status</th><th>Reason</th><th /></tr></thead>
                  <tbody>
                    {view.installments.map((item) => (
                      <InstallmentRow
                        key={item.index}
                        item={item}
                        busy={busy}
                        canCatchUp={isDebtor && item.reason === 'headroom' && item.status === 'scheduled' && !item.shifted}
                        onCatchUp={() => void catchUp(item)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {view.installments.some((i) => i.reason === 'blocked_by_debtor') && (
                <p className="state state-error" role="status" data-testid="invoice-blocked">
                  An installment was blocked by the debtor. There is no catch-up voucher for this; only reputation and the CT-094 bond answer it.
                </p>
              )}
              {isDebtor && view.status === 'requested' && (
                <>
                  <p className="state" data-testid="invoice-advance-note">
                    Approving means signing {view.installments.length} vouchers now, one per epoch. It is proof that you acknowledge the invoice, not a guarantee for the issuer: the contract
                    allows a voucher with a higher seq to go first. There are no spare vouchers; if an installment fails, a catch-up voucher is signed only after the failure.
                  </p>
                  <div className="actions">
                    <button type="button" disabled={busy || voucherKey.trim() === ''} onClick={() => void approve()}>
                      Approve and sign {view.installments.length} installments: {formatCredit(view.document.amount)} credit to {view.document.issuer}
                    </button>
                    <button type="button" disabled={busy || voucherKey.trim() === ''} onClick={() => void reject()}>Reject invoice {formatCredit(view.document.amount)} credit from {view.document.issuer}</button>
                  </div>
                </>
              )}
              {isIssuer && view.status === 'requested' && <p className="state">Waiting for the debtor to approve.</p>}
            </>
          )
        }}
      </QueryState>
      {message && <p className="state" role="status">{message}</p>}
      {error && <p className="state state-error" role="alert">{error}</p>}
    </section>
  )
}

export function Invoices() {
  const { account } = useWallet()
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [voucherKey, setVoucherKey] = useState('')
  const query: Record<string, string> = { ...(account ? { party: account } : {}), ...(status ? { status } : {}) }
  const invoices = useInvoices(query, Boolean(account))

  return (
    <>
      <h2>Invoices and installments</h2>
      {!account && <p className="state">Sign in with your wallet to see your invoices.</p>}
      <div className="filters">
        <label>
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === '' ? 'All' : STATUS_LABEL[s]}</option>)}
          </select>
        </label>
      </div>
      {account && (
        <QueryState query={invoices} loadingLabel="Loading invoices" isEmpty={(d) => d.items.length === 0} empty="No invoices for this account yet.">
          {(data) => (
            <div className="table-wrap">
              <table aria-label="Invoice list">
                <thead><tr><th>Number</th><th>Issuer</th><th>Debtor</th><th>Amount</th><th>Installments</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {data.items.map((i) => (
                    <tr key={i.invoiceHash} aria-selected={selected === i.invoiceHash}>
                      <td>{i.document.id}</td>
                      <td><code>{shortAccount(i.document.issuer)}</code></td>
                      <td><code>{shortAccount(i.document.debtor)}</code></td>
                      <td>{formatCredit(i.document.amount)}</td>
                      <td>{i.installments.length}</td>
                      <td>{STATUS_LABEL[i.status]}</td>
                      <td><button type="button" aria-label={`Open ${i.document.id}`} onClick={() => setSelected(i.invoiceHash)}>Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      )}
      {selected && <InvoiceDetail hash={selected} voucherKey={voucherKey} />}
      <CreateInvoice voucherKey={voucherKey} onVoucherKey={setVoucherKey} onCreated={setSelected} />
    </>
  )
}
