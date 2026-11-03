import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import { viewContract } from '../api/chain'
import { useInvoice, useInvoices } from '../api/queries'
import type { InstallmentReason, InstallmentView, InvoiceStatus, InvoiceView } from '../api/types'
import { QueryState } from '../components/QueryState'
import { VoucherKeyField } from '../components/VoucherKeyField'
import { CONTRACT_ID } from '../config'
import { buildApproval, buildCatchUp, buildCreateInvoice, buildRejection } from '../lib/invoiceFlow'
import { describeMarketError } from '../lib/marketError'
import { formatCredit, shortAccount } from '../lib/format'
import { useWallet } from '../wallet/WalletContext'

// FE-025: invoice dan cicilan (pipeline P8, ADR-44), dibangun dari Spec API Backend 5e. Issuer mengajukan, debtor menyetujui dengan menandatangani semua voucher cicilan
// sekaligus (seq 1 di epochnya) atau menolak; cicilan yang gagal digeser sekali dengan voucher susulan yang ditandatangani setelah gagal. Tanda tangan di depan adalah bukti,
// bukan jaminan pembayaran (ADR-44): halaman memberi tahu itu di tempat yang dilihat debtor.
const STATUS_LABEL: Record<InvoiceStatus, string> = {
  requested: 'Diajukan', approved: 'Disetujui', registered: 'Terdaftar', rejected: 'Ditolak', expired: 'Kedaluwarsa', missed: 'Meleset',
}
const REASON_LABEL: Record<InstallmentReason, string> = {
  headroom: 'headroom debtor habis',
  blocked_by_debtor: 'diblokir debtor (voucher ber-seq lebih tinggi didaftarkan lebih dulu)',
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
    <form className="form" aria-label="Ajukan invoice" onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <h3>Ajukan invoice (issuer)</h3>
      {!account && <p className="state">Masuk dengan wallet untuk mengajukan invoice.</p>}
      <label><span>Debtor (akun penagih dibayar oleh)</span><input value={debtor} onChange={(e) => setDebtor(e.target.value)} placeholder="maker.x207-circle.near" /></label>
      <label><span>Nomor invoice</span><input value={id} onChange={(e) => setId(e.target.value)} placeholder="INV-2026-001" /></label>
      <label><span>Jumlah (credit)</span><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>
      <label><span>Keterangan</span><input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={256} /></label>
      <label><span>Jumlah cicilan (1 sampai 24, satu per epoch)</span><input value={installments} onChange={(e) => setInstallments(e.target.value)} inputMode="numeric" /></label>
      <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />
      <div><button type="submit" disabled={!ready || busy}>{busy ? 'Menandatangani…' : 'Tanda tangani dan ajukan'}</button></div>
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
      <td>{item.status}</td>
      <td>{item.reason ? REASON_LABEL[item.reason] : '-'}</td>
      <td>
        {canCatchUp && (
          <button type="button" disabled={busy} onClick={onCatchUp} aria-label={`Susulan cicilan ${item.index}`}>
            Tandatangani susulan
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
    const vouchers = await buildApproval(CONTRACT_ID, view, voucherKey)
    if (typeof vouchers === 'string') return fail(vouchers)
    await api.approveInvoice(hash, vouchers)
    return `Disetujui: ${vouchers.length} voucher cicilan ditandatangani, satu per epoch.`
  })
  const reject = () => act(async (view) => {
    const { notice, signature } = await buildRejection(CONTRACT_ID, view, account!, '', Math.floor(Date.now() / 1000), voucherKey)
    await api.rejectInvoice(hash, notice, signature)
    return 'Invoice ditolak.'
  })
  const catchUp = (item: InstallmentView) => act(async (view) => {
    // keadaan pasangan di epoch tujuan dari kontrak, bukan tebakan: voucher susulan melanjutkannya
    const target = item.epoch + 1
    const ob = await viewContract<Obligation>('obligation', { epoch: target, debtor: view.document.debtor, creditor: view.document.issuer })
    const state = { seq: ob?.last_seq ?? 0, cumulativeAmount: ob?.cumulative ?? '0' }
    const built = await buildCatchUp(CONTRACT_ID, view, item.index, state, item.status === 'shifted', voucherKey)
    if (typeof built === 'string') return fail(built)
    await api.catchUpInstallment(hash, item.index, built.voucher, built.signature)
    return `Voucher susulan cicilan ${item.index} ditandatangani untuk epoch ${target}.`
  })

  return (
    <section className="detail" aria-label="Rincian invoice">
      <QueryState query={query} loadingLabel="Memuat invoice">
        {(view) => {
          const isDebtor = account === view.document.debtor
          const isIssuer = account === view.document.issuer
          return (
            <>
              <h3>{view.document.id} · {STATUS_LABEL[view.status]}</h3>
              <dl className="status-panel">
                <dt>Penagih (issuer)</dt><dd><code>{view.document.issuer}</code></dd>
                <dt>Debtor</dt><dd><code>{view.document.debtor}</code></dd>
                <dt>Jumlah</dt><dd>{formatCredit(view.document.amount)} credit</dd>
                <dt>Keterangan</dt><dd>{view.document.memo || '-'}</dd>
                <dt>Hash</dt><dd><code>{view.invoiceHash}</code></dd>
              </dl>
              {view.needsBond && <p className="state state-error" role="status" data-testid="invoice-bond">Invoice ini sebesar atau di atas ambang jaminan: perlu jaminan dua sisi (CT-094) sebelum didaftarkan.</p>}
              <div className="table-wrap">
                <table aria-label="Jadwal cicilan">
                  <thead><tr><th>#</th><th>Epoch</th><th>Jumlah</th><th>Status</th><th>Alasan</th><th /></tr></thead>
                  <tbody>
                    {view.installments.map((item) => (
                      <InstallmentRow
                        key={item.index}
                        item={item}
                        busy={busy}
                        canCatchUp={isDebtor && item.reason === 'headroom' && item.status !== 'shifted' && item.status !== 'registered'}
                        onCatchUp={() => void catchUp(item)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {view.installments.some((i) => i.reason === 'blocked_by_debtor') && (
                <p className="state state-error" role="status" data-testid="invoice-blocked">
                  Cicilan diblokir debtor. Tidak ada voucher susulan untuk ini; hanya reputasi dan jaminan CT-094 yang menjawabnya.
                </p>
              )}
              {isDebtor && view.status === 'requested' && (
                <>
                  <p className="state" data-testid="invoice-advance-note">
                    Menyetujui berarti menandatangani sekarang {view.installments.length} voucher, satu per epoch. Itu bukti bahwa Anda mengakui tagihan, bukan jaminan bagi penagih: kontrak
                    membolehkan voucher ber-seq lebih tinggi mendahului. Tidak ada voucher cadangan; bila cicilan gagal, voucher susulan baru ditandatangani setelah gagal.
                  </p>
                  <div className="actions">
                    <button type="button" disabled={busy || voucherKey.trim() === ''} onClick={() => void approve()}>Setujui dan tandatangani cicilan</button>
                    <button type="button" disabled={busy || voucherKey.trim() === ''} onClick={() => void reject()}>Tolak</button>
                  </div>
                </>
              )}
              {isIssuer && view.status === 'requested' && <p className="state">Menunggu persetujuan debtor.</p>}
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
      <h2>Invoice dan cicilan</h2>
      {!account && <p className="state">Masuk dengan wallet untuk melihat invoice Anda.</p>}
      <div className="filters">
        <label>
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === '' ? 'Semua' : STATUS_LABEL[s]}</option>)}
          </select>
        </label>
      </div>
      {account && (
        <QueryState query={invoices} loadingLabel="Memuat invoice" isEmpty={(d) => d.items.length === 0} empty="Belum ada invoice untuk akun ini.">
          {(data) => (
            <div className="table-wrap">
              <table aria-label="Daftar invoice">
                <thead><tr><th>Nomor</th><th>Penagih</th><th>Debtor</th><th>Jumlah</th><th>Cicilan</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {data.items.map((i) => (
                    <tr key={i.invoiceHash} aria-selected={selected === i.invoiceHash}>
                      <td>{i.document.id}</td>
                      <td><code>{shortAccount(i.document.issuer)}</code></td>
                      <td><code>{shortAccount(i.document.debtor)}</code></td>
                      <td>{formatCredit(i.document.amount)}</td>
                      <td>{i.installments.length}</td>
                      <td>{STATUS_LABEL[i.status]}</td>
                      <td><button type="button" aria-label={`Buka ${i.document.id}`} onClick={() => setSelected(i.invoiceHash)}>Buka</button></td>
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
