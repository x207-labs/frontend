import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import { useOrder, useOrderProofs, useOrders } from '../api/queries'
import type { OrderMilestoneView, OrderView } from '../api/types'
import { QueryState } from '../components/QueryState'
import { VoucherKeyField } from '../components/VoucherKeyField'
import { CONTRACT_ID } from '../config'
import { formatCredit, formatTime, shortAccount } from '../lib/format'
import { describeMarketError } from '../lib/marketError'
import {
  CREATABLE_KINDS, EMPTY_ORDER, KIND_LABEL, assertOrderHash, KIND_NOTE, ORDER_PATTERN, PROOF_METHODS, buildCreateOrder, milestoneNotice, orderHashOf, signNotice, toOrderDocument,
  type MilestoneAction, type OrderForm, type OutcomeAction,
} from '../lib/orderFlow'
import { useWallet } from '../wallet/WalletContext'

// FE-027: pesanan jasa (pipeline P6, ADR-45), dibangun dari Spec API Backend 5f. Pembeli membuat pesanan dengan tonggak; penjual mengirim, pembeli mengonfirmasi atau
// menyengketakan di jendela (ADR-42); lead dan bug dibayar per hasil; keeper dan solver dibayar per tx yang terlihat di rantai oleh agent pembeli (halaman hanya menampilkan buktinya).
const MILESTONE_LABEL: Record<string, string> = { open: 'Terbuka', delivered: 'Terkirim', confirmed: 'Terkonfirmasi', disputed: 'Disengketakan', paid: 'Dibayar', cancelled: 'Dibatalkan' }
const REASONS = [['not_received', 'Tidak diterima'], ['not_as_described', 'Tidak sesuai uraian'], ['other', 'Lainnya']] as const
const now = () => Math.floor(Date.now() / 1000)

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
      const doc = await toOrderDocument(form, CONTRACT_ID, account, crypto.randomUUID().replaceAll('-', '').slice(0, 24))
      if (typeof doc === 'string') {
        setError(doc)
        return
      }
      const body = await buildCreateOrder(doc, account, voucherKey, counterparty.trim() === '' ? undefined : parseCounterparty(counterparty, form.seller))
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
    <form className="form" aria-label="Buat pesanan" onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <h3>Buat pesanan jasa (pembeli)</h3>
      {!account && <p className="state">Masuk dengan wallet untuk membuat pesanan.</p>}
      <label>
        <span>Jenis jasa</span>
        <select value={form.kind} onChange={(e) => setForm({ ...EMPTY_ORDER, seller: form.seller, kind: e.target.value as OrderForm['kind'] })}>
          <option value="">Pilih jenis</option>
          {CREATABLE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </label>
      {form.kind !== '' && KIND_NOTE[form.kind] && <p className="state" role="note" data-testid="order-note">{KIND_NOTE[form.kind]}</p>}
      <label><span>Penjual</span><input value={form.seller} onChange={(e) => set('seller', e.target.value)} placeholder="audit.x207-circle.near" /></label>
      <label><span>Spesifikasi kerja (hanya hash-nya yang dikirim)</span><textarea value={form.spec} onChange={(e) => set('spec', e.target.value)} rows={3} /></label>
      {form.kind === 'prompt' && (
        <label><span>Contoh hasil (wajib; hanya hash-nya yang dikirim)</span><textarea value={form.sample} onChange={(e) => set('sample', e.target.value)} rows={2} /></label>
      )}
      {form.kind === 'loadtest' && (
        <label><span>Target uji beban (nama host)</span><input value={form.target} onChange={(e) => set('target', e.target.value)} placeholder="shop.example.com" /></label>
      )}
      {pattern === 'proof' && form.kind !== '' && (
        <>
          <label>
            <span>Method yang dihitung sebagai bukti</span>
            <select value={form.proofMethod} onChange={(e) => set('proofMethod', e.target.value)}>
              <option value="">Pilih method</option>
              {PROOF_METHODS[form.kind as 'keeper' | 'solver'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label><span>Bayaran per transaksi (credit)</span><input value={form.proofAmount} onChange={(e) => set('proofAmount', e.target.value)} inputMode="decimal" /></label>
        </>
      )}
      <fieldset>
        <legend>{pattern === 'outcome' ? 'Tempat hasil (satu tonggak per hasil)' : pattern === 'proof' ? 'Anggaran' : 'Tonggak'}</legend>
        {form.milestones.map((m, k) => (
          <div key={k} className="side">
            <label><span>Jumlah {k + 1} (credit)</span><input value={m.amount} onChange={(e) => setMilestone(k, 'amount', e.target.value)} inputMode="decimal" /></label>
            <label><span>Tenggat {k + 1} (UTC)</span><input type="datetime-local" value={m.due} onChange={(e) => setMilestone(k, 'due', e.target.value)} /></label>
          </div>
        ))}
        <button type="button" disabled={form.milestones.length >= 24} onClick={() => set('milestones', [...form.milestones, { amount: '', due: '' }])}>Tambah tonggak</button>
      </fieldset>
      <label><span>Tanda tangan penjual (opsional): akun dan tanda tangan, dipisah spasi</span><input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="audit.x207-circle.near ed25519:…" /></label>
      <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />
      <div><button type="submit" disabled={!account || form.kind === '' || voucherKey.trim() === '' || busy}>{busy ? 'Menandatangani…' : 'Tanda tangani dan buat pesanan'}</button></div>
      {error && <p className="state state-error" role="alert">{error}</p>}
    </form>
  )
}

function parseCounterparty(text: string, seller: string): { account: string; signature: string } {
  const [account, signature] = text.trim().split(/\s+/)
  if (account !== seller.trim() || !signature?.startsWith('ed25519:')) throw new Error('Tanda tangan penjual harus berformat "<akun penjual> ed25519:…".')
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
  const outcome = (action: OutcomeAction) => run(`hasil ${action}`, async () => {
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
        {m.autoConfirmed && ' (otomatis setelah jendela sengketa)'}
        {m.outcome && ` · hasil ${m.outcome}`}
        {m.disputeReason && ` · ${m.disputeReason}`}
      </td>
      <td>{m.deliverableHash ? <code>{m.deliverableHash.slice(0, 12)}</code> : '-'}</td>
      <td>
        {pattern !== 'proof' && isSeller && m.status === 'open' && (
          <>
            <input aria-label={`Hash kiriman ${m.index}`} value={deliverable} onChange={(e) => setDeliverable(e.target.value)} placeholder="sha256 kiriman atau hasil (heks)" />
            {pattern === 'milestone' ? (
              <button type="button" disabled={busy || keyless || !goodHash} onClick={() => act('delivered')}>Tandai terkirim</button>
            ) : (
              <button type="button" disabled={busy || keyless || !goodHash} onClick={() => outcome('proposed')}>Ajukan hasil</button>
            )}
          </>
        )}
        {pattern === 'milestone' && isBuyer && m.status === 'delivered' && (
          <>
            <button type="button" disabled={busy || keyless} onClick={() => act('confirmed')} aria-label={`Konfirmasi ${m.index}`}>Konfirmasi</button>
            <select aria-label={`Alasan sengketa ${m.index}`} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="button" disabled={busy || keyless} onClick={() => act('disputed')} aria-label={`Sengketakan ${m.index}`}>Sengketakan</button>
          </>
        )}
        {pattern === 'outcome' && isBuyer && m.status === 'delivered' && (
          <>
            <button type="button" disabled={busy || keyless} onClick={() => outcome('accepted')} aria-label={`Terima hasil ${m.index}`}>Terima hasil</button>
            <button type="button" disabled={busy || keyless} onClick={() => outcome('rejected')} aria-label={`Tolak hasil ${m.index}`}>Tolak hasil</button>
            <small>Pembeli diam tidak membayar: hasil lead dan bug tidak dikonfirmasi otomatis.</small>
          </>
        )}
        {pattern !== 'proof' && canCancel && <button type="button" disabled={busy || keyless} onClick={() => act('cancelled')} aria-label={`Batalkan ${m.index}`}>Batalkan</button>}
      </td>
    </tr>
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
        setMessage(`Terkirim: ${label}.`)
        await client.invalidateQueries({ queryKey: ['order', hash] })
        await client.invalidateQueries({ queryKey: ['orders'] })
      })
      .catch((e) => setError(describeMarketError(e)))
      .finally(() => setBusy(false))
  }

  return (
    <section className="detail" aria-label="Rincian pesanan">
      <QueryState query={query} loadingLabel="Memuat pesanan">
        {(view) => {
          const kind = view.order.kind as keyof typeof ORDER_PATTERN
          const pattern = ORDER_PATTERN[kind]
          return (
            <>
              <h3>{KIND_LABEL[kind] ?? view.order.kind} · {view.status}</h3>
              <dl className="status-panel">
                <dt>Pembeli</dt><dd><code>{view.order.buyer}</code></dd>
                <dt>Penjual</dt><dd><code>{view.order.seller}</code></dd>
                <dt>Hash pesanan</dt><dd><code>{view.orderHash}</code></dd>
                {view.status === 'proposed' && (<><dt>Tanda tangan</dt><dd>baru dari {view.signedBy.map(shortAccount).join(', ') || 'siapa pun'}; pesanan terbuka setelah kedua pihak menandatangani</dd></>)}
                {view.order.sampleHash && (<><dt>Contoh (hash)</dt><dd><code>{view.order.sampleHash}</code></dd></>)}
                {view.order.target && (<><dt>Target</dt><dd><code>{view.order.target}</code> · {view.targetVerified ? 'kepemilikan terbukti' : 'kepemilikan belum terbukti'}</dd></>)}
                {view.order.proof && (<><dt>Bukti</dt><dd><code>{view.order.proof.method}</code>, {formatCredit(view.order.proof.amountPerTx)} credit per tx</dd></>)}
              </dl>
              {view.needsBond && <p className="state state-error" role="status" data-testid="order-bond">Pesanan ini sebesar atau di atas ambang jaminan: perlu jaminan dua sisi dan arbiter (CT-094).</p>}
              {KIND_NOTE[kind] && <p className="state" role="note">{KIND_NOTE[kind]}</p>}
              {view.order.target && view.targetVerified === false && (
                <div>
                  <button type="button" disabled={busy} onClick={() => run('target diperiksa', async () => { await api.orderTargetCheck(view.orderHash) })}>Periksa kepemilikan target</button>
                </div>
              )}
              <div className="table-wrap">
                <table aria-label="Tonggak">
                  <thead><tr><th>#</th><th>Jumlah</th><th>Tenggat</th><th>Status</th><th>Kiriman</th><th /></tr></thead>
                  <tbody>
                    {view.milestones.map((m) => <MilestoneRow key={m.index} view={view} opened={hash} m={m} account={account} voucherKey={voucherKey} busy={busy} run={run} />)}
                  </tbody>
                </table>
              </div>
              {pattern === 'proof' && (
                <div data-testid="order-proofs">
                  <p className="state">Dibayar per transaksi penyedia yang terlihat di rantai. Voucher ditandatangani otomatis oleh agent pembeli (payForProofs), bukan dari halaman ini.</p>
                  <QueryState query={proofs} loadingLabel="Memuat bukti" isEmpty={(d) => d.length === 0} empty="Belum ada transaksi penyedia yang cocok.">
                    {(items) => <ul aria-label="Bukti on-chain">{items.map((p) => <li key={p.txHash}><code>{p.txHash}</code> · {p.method} · <code>{shortAccount(p.signer)}</code></li>)}</ul>}
                  </QueryState>
                </div>
              )}
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
      <h2>Pesanan jasa</h2>
      {!account && <p className="state">Masuk dengan wallet untuk melihat pesanan Anda.</p>}
      {account && (
        <QueryState query={orders} loadingLabel="Memuat pesanan" isEmpty={(d) => d.items.length === 0} empty="Belum ada pesanan untuk akun ini.">
          {(data) => (
            <div className="table-wrap">
              <table aria-label="Daftar pesanan">
                <thead><tr><th>Jenis</th><th>Pembeli</th><th>Penjual</th><th>Tonggak</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {data.items.map((o) => (
                    <tr key={o.orderHash} aria-selected={selected === o.orderHash}>
                      <td>{KIND_LABEL[o.order.kind as keyof typeof KIND_LABEL] ?? o.order.kind}</td>
                      <td><code>{shortAccount(o.order.buyer)}</code></td>
                      <td><code>{shortAccount(o.order.seller)}</code></td>
                      <td>{o.milestones.length}</td>
                      <td>{o.status}</td>
                      <td><button type="button" aria-label={`Buka pesanan ${o.orderHash.slice(0, 8)}`} onClick={() => setSelected(o.orderHash)}>Buka</button></td>
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
