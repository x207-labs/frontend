// FE-020: negosiasi dan barter cepat untuk satu listing. Penawaran dan penawaran balik per ronde ditandatangani dengan kunci
// voucher di browser; sebelum menerima, pengguna melihat angka akhir (cashback, diskon, jatah pencari, leg bundle) dari pratinjau
// server, dan pesan yang ditandatangani dicek cocok dengan `terms_hash` yang ditampilkan.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import { useOffers, useProposals } from '../api/queries'
import type { AcceptPreview, AcceptResult, BundleProposal, ListingView, OfferView, QuickBreakdown } from '../api/types'
import { CONTRACT_ID } from '../config'
import { toAtomic } from '../lib/amount'
import { serializeBundleTerms, sha256Hex, signMessageWithVoucher, signOffer, type Offer } from '../lib/barter'
import { formatCredit, formatNumber, formatTime, shortAccount } from '../lib/format'
import { describeMarketError } from '../lib/marketError'
import { useWallet } from '../wallet/WalletContext'
import { ErrorNotice, Loading } from './QueryState'
import { VoucherKeyField } from './VoucherKeyField'

const SECONDS_PER_DAY = 86_400
const MODE_LABEL = { pay: 'Bayar harga diskon', barter: 'Barter' } as const

function Breakdown({ listing, breakdown }: { listing: ListingView; breakdown: QuickBreakdown }) {
  if (breakdown.mode === 'pay') {
    return (
      <dl aria-label="Rincian bayar">
        <dt>Lawan membayar</dt>
        <dd>{formatCredit(breakdown.counterpartyPays)} credit</dd>
        <dt>Penjual menerima</dt>
        <dd>{formatCredit(breakdown.sellerReceives)} credit (nilai kesepakatan {formatCredit(String(BigInt(breakdown.sellerReceives) + BigInt(breakdown.discount)))} dikurangi diskon {formatCredit(breakdown.discount)})</dd>
        <dt>Jatah pencari</dt>
        <dd>{formatCredit(breakdown.searcher)} credit</dd>
      </dl>
    )
  }
  return (
    <dl aria-label="Rincian barter">
      <dt>Lawan menyerahkan</dt>
      <dd>{listing.want.assetType} senilai {formatCredit(breakdown.counterpartyGives)} credit</dd>
      <dt>Lawan menerima</dt>
      <dd>{listing.offer.assetType} ditambah cashback {formatCredit(breakdown.cashback)} credit</dd>
      <dt>Penjual menanggung</dt>
      <dd>{formatCredit(breakdown.sellerBears)} credit (cashback {formatCredit(breakdown.cashback)} + jatah pencari {formatCredit(breakdown.searcher)})</dd>
      <dt>Jatah pencari</dt>
      <dd>{formatCredit(breakdown.searcher)} credit</dd>
    </dl>
  )
}

function OfferForm({ listing, previous, voucherKey, onVoucherKey, onDone }: {
  listing: ListingView
  previous?: OfferView
  voucherKey: string
  onVoucherKey: (v: string) => void
  onDone: () => void
}) {
  const { account } = useWallet()
  const client = useQueryClient()
  const [mode, setMode] = useState<'pay' | 'barter'>(listing.acceptPayment ? previous?.mode ?? 'barter' : 'barter')
  const [value, setValue] = useState('')
  const [quantity, setQuantity] = useState(String(listing.offer.quantity))
  const [days, setDays] = useState('3')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const atomic = toAtomic(value)
  const valid = Boolean(account) && atomic !== null && /^[1-9]\d*$/.test(quantity) && /^[1-9]\d{0,2}$/.test(days) && voucherKey.trim() !== ''

  async function submit() {
    if (!account || !atomic) return
    setBusy(true)
    setError(null)
    try {
      const offer: Offer = {
        circle: CONTRACT_ID, listing_hash: listing.listingHash, proposer: account, round: (previous?.round ?? 0) + 1, mode, value: atomic,
        quantity: Number(quantity), deliver_by: Math.floor(Date.now() / 1000) + Number(days) * SECONDS_PER_DAY,
      }
      await api.postOffer(listing.listingHash, offer, await signOffer(offer, voucherKey), previous?.offerHash)
      await client.invalidateQueries({ queryKey: ['offers', listing.listingHash] })
      onDone()
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }

  const title = previous ? `Penawaran balik ronde ${previous.round + 1}` : 'Ajukan penawaran'
  return (
    <form className="form" aria-label={title} onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <h4>{title}</h4>
      <label>
        <span>Cara</span>
        <select value={mode} onChange={(e) => setMode(e.target.value as 'pay' | 'barter')}>
          <option value="barter">{MODE_LABEL.barter}</option>
          <option value="pay" disabled={!listing.acceptPayment}>{MODE_LABEL.pay}{listing.acceptPayment ? '' : ' (tidak diterima listing ini)'}</option>
        </select>
      </label>
      <label>
        <span>Nilai usulan (credit)</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" />
      </label>
      <label>
        <span>Jumlah</span>
        <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" />
      </label>
      <label>
        <span>Diserahkan dalam (hari)</span>
        <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
      </label>
      <VoucherKeyField value={voucherKey} onChange={onVoucherKey} />
      <div>
        <button type="submit" disabled={!valid || busy}>{busy ? 'Menandatangani…' : 'Tanda tangani dan kirim penawaran'}</button>
      </div>
      {error && <p className="state state-error" role="alert">{error}</p>}
    </form>
  )
}

function AcceptPanel({ listing, offer, voucherKey, onVoucherKey }: {
  listing: ListingView
  offer: OfferView
  voucherKey: string
  onVoucherKey: (v: string) => void
}) {
  const { account } = useWallet()
  const client = useQueryClient()
  const [searcher, setSearcher] = useState('')
  const [share, setShare] = useState('0')
  const [preview, setPreview] = useState<AcceptPreview | null>(null)
  const [result, setResult] = useState<AcceptResult | null>(null)
  const [busy, setBusy] = useState<'preview' | 'sign' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shareOk = /^\d+([.,]\d{1,2})?$/.test(share.trim())
  const shareBps = shareOk ? Math.round(Number(share.replace(',', '.')) * 100) : 0
  const body = {
    account: account ?? '',
    ...(searcher.trim() ? { searcher: searcher.trim(), searcherShareBps: shareBps } : {}),
  }

  async function calculate() {
    setBusy('preview')
    setError(null)
    setPreview(null)
    try {
      setPreview(await api.previewAccept(listing.listingHash, offer.offerHash, body))
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(null)
    }
  }

  async function accept() {
    if (!preview) return
    setBusy('sign')
    setError(null)
    try {
      let signature: string | undefined
      if (preview.bundle) {
        if ((await sha256Hex(preview.bundle.message)) !== preview.bundle.termsHash) {
          throw new Error('Pesan yang akan ditandatangani tidak cocok dengan terms_hash dari server. Dibatalkan.')
        }
        signature = await signMessageWithVoucher(preview.bundle.message, preview.bundle.recipient, voucherKey)
      }
      setResult(await api.accept(listing.listingHash, offer.offerHash, { ...body, epoch: preview.epoch, ...(signature ? { signature } : {}) }))
      await client.invalidateQueries({ queryKey: ['offers', listing.listingHash] })
      await client.invalidateQueries({ queryKey: ['listings'] })
      await client.invalidateQueries({ queryKey: ['proposals'] })
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(null)
    }
  }

  if (result) {
    return result.result.kind === 'payment' ? (
      <p className="state" role="status">
        Disepakati. {shortAccount(result.result.payer)} membayar {formatCredit(result.result.amount)} credit ke {shortAccount(result.result.payee)} dengan voucher biasa; tanpa bundle.
      </p>
    ) : (
      <p className="state" role="status">
        Usulan bundle dibuat untuk epoch {result.result.proposal.epoch}. Menunggu tanda tangan: {result.result.proposal.missing.map(shortAccount).join(', ') || 'tidak ada'}.
      </p>
    )
  }

  const legs = preview?.bundle ? (JSON.parse(preview.bundle.message) as { legs: Array<{ payer: string; payee: string; max_amount: string }> }).legs : []
  return (
    <section className="accept" aria-label="Terima penawaran">
      <h4>Terima penawaran ronde {offer.round}</h4>
      <label>
        <span>Pencari otonom (opsional)</span>
        <input value={searcher} onChange={(e) => setSearcher(e.target.value)} placeholder="scraper.x207-circle.near" />
      </label>
      <label>
        <span>Jatah pencari (% dari nilai listing)</span>
        <input value={share} onChange={(e) => setShare(e.target.value)} inputMode="decimal" disabled={!searcher.trim()} />
        {!shareOk && <small className="state-error">Isi persen dengan maksimal 2 desimal.</small>}
      </label>
      <button type="button" onClick={() => void calculate()} disabled={!account || !shareOk || busy !== null}>
        {busy === 'preview' ? 'Menghitung…' : 'Hitung rincian'}
      </button>
      {preview && (
        <>
          <Breakdown listing={listing} breakdown={preview.breakdown} />
          {preview.bundle ? (
            <>
              <p>Bundle epoch {preview.epoch}, <code>terms_hash</code> <code>{preview.bundle.termsHash.slice(0, 16)}…</code>. Setiap peserta menandatangani.</p>
              <ul aria-label="Leg bundle">
                {legs.map((l) => (
                  <li key={`${l.payer}>${l.payee}`}>{shortAccount(l.payer)} → {shortAccount(l.payee)}: {formatCredit(l.max_amount)} credit</li>
                ))}
              </ul>
              <VoucherKeyField value={voucherKey} onChange={onVoucherKey} />
            </>
          ) : (
            <p>Satu pembayaran voucher: {shortAccount(preview.payment!.payer)} → {shortAccount(preview.payment!.payee)}, {formatCredit(preview.payment!.amount)} credit. Tidak ada tanda tangan bundle.</p>
          )}
          <button type="button" onClick={() => void accept()} disabled={busy !== null || (preview.bundle !== null && voucherKey.trim() === '')}>
            {busy === 'sign' ? 'Menandatangani…' : preview.bundle ? 'Tanda tangani dan terima' : 'Terima'}
          </button>
        </>
      )}
      {error && <p className="state state-error" role="alert">{error}</p>}
    </section>
  )
}

function ProposalSigner({ proposal, voucherKey }: { proposal: BundleProposal; voucherKey: string }) {
  const { account } = useWallet()
  const client = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function sign() {
    if (!account) return
    setBusy(true)
    setError(null)
    try {
      const message = serializeBundleTerms(proposal.terms)
      if ((await sha256Hex(message)) !== proposal.termsHash) throw new Error('Syarat bundle tidak cocok dengan terms_hash. Dibatalkan.')
      await api.signProposal(proposal.termsHash, account, await signMessageWithVoucher(message, proposal.terms.circle, voucherKey))
      await client.invalidateQueries({ queryKey: ['proposals'] })
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li>
      Bundle epoch {proposal.epoch}, <code>{proposal.termsHash.slice(0, 12)}…</code>: {proposal.status === 'ready' ? 'siap dikirim solver' : `menunggu ${proposal.missing.map(shortAccount).join(', ')}`}.
      {account && proposal.missing.includes(account) && (
        <button type="button" onClick={() => void sign()} disabled={busy || voucherKey.trim() === ''}>
          {busy ? 'Menandatangani…' : 'Tanda tangani bundle'}
        </button>
      )}
      {error && <span className="state state-error" role="alert"> {error}</span>}
    </li>
  )
}

export function Negotiation({ listing, voucherKey, onVoucherKey, onClose }: {
  listing: ListingView
  voucherKey: string
  onVoucherKey: (v: string) => void
  onClose: () => void
}) {
  const { account } = useWallet()
  const offers = useOffers(listing.listingHash)
  const proposals = useProposals(account)
  const [replying, setReplying] = useState(false)
  const [accepting, setAccepting] = useState<OfferView | null>(null)
  const owner = account === listing.account
  const mine = (offers.data?.items ?? []).filter((o) => owner || !account || o.counterparty === account)
  const open = listing.status === 'open'
  const waiting = mine.filter((o) => o.status === 'pending' && o.awaiting === account)
  const hasThread = mine.length > 0
  const mineProposals = (proposals.data?.items ?? []).filter((p) => p.listingHash === listing.listingHash)

  return (
    <section className="negotiation" aria-label="Negosiasi">
      <div className="page-title">
        <h3>Negosiasi {listing.offer.assetType} ↔ {listing.want.assetType}</h3>
        <button type="button" onClick={onClose}>Tutup</button>
      </div>
      <p>
        Diskon barter cepat {formatNumber(listing.discountBps / 100)}%, {listing.acceptPayment ? 'lawan boleh membayar harga diskon' : 'hanya barter'}. Berlaku sampai {formatTime(listing.expiresAt)}.
      </p>
      {offers.isError && <ErrorNotice error={offers.error} onRetry={() => offers.refetch()} />}
      {offers.isLoading && <Loading label="Memuat penawaran" />}
      {offers.data && mine.length === 0 && <p className="state">Belum ada penawaran{owner ? '' : ' dari akun ini'}.</p>}
      {mine.length > 0 && (
        <div className="table-wrap">
          <table aria-label="Ronde negosiasi">
            <thead>
              <tr><th>Ronde</th><th>Dari</th><th>Cara</th><th>Nilai</th><th>Jumlah</th><th>Diserahkan</th><th>Status</th></tr>
            </thead>
            <tbody>
              {mine.map((o) => (
                <tr key={o.offerHash}>
                  <td>{o.round}</td>
                  <td><code>{shortAccount(o.proposer)}</code></td>
                  <td>{MODE_LABEL[o.mode]}</td>
                  <td>{formatCredit(o.value)}</td>
                  <td>{formatNumber(o.quantity, 0)}</td>
                  <td>{formatTime(o.deliverBy)}</td>
                  <td>{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!account && <p className="state">Masuk dengan wallet untuk menawar.</p>}
      {account && !open && <p className="state">Listing sudah tidak terbuka ({listing.status}).</p>}
      {account && open && !owner && !hasThread && (
        <OfferForm listing={listing} voucherKey={voucherKey} onVoucherKey={onVoucherKey} onDone={() => undefined} />
      )}
      {account && open && waiting.map((o) => (
        <div key={o.offerHash} className="actions">
          <p>Penawaran ronde {o.round} dari {shortAccount(o.proposer)} menunggu jawaban Anda.</p>
          <button type="button" onClick={() => { setReplying(true); setAccepting(null) }}>Penawaran balik</button>
          <button type="button" onClick={() => { setAccepting(o); setReplying(false) }}>Terima</button>
          {replying && <OfferForm listing={listing} previous={o} voucherKey={voucherKey} onVoucherKey={onVoucherKey} onDone={() => setReplying(false)} />}
          {accepting?.offerHash === o.offerHash && <AcceptPanel listing={listing} offer={o} voucherKey={voucherKey} onVoucherKey={onVoucherKey} />}
        </div>
      ))}
      {account && open && hasThread && waiting.length === 0 && <p className="state">Menunggu jawaban pihak lawan.</p>}
      {mineProposals.length > 0 && (
        <>
          <h4>Usulan bundle</h4>
          {account && mineProposals.some((p) => p.missing.includes(account)) && <VoucherKeyField value={voucherKey} onChange={onVoucherKey} />}
          <ul aria-label="Usulan bundle">
            {mineProposals.map((p) => <ProposalSigner key={p.termsHash} proposal={p} voucherKey={voucherKey} />)}
          </ul>
        </>
      )}
    </section>
  )
}
