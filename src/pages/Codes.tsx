import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { viewContract } from '../api/chain'
import { usePurchase } from '../api/queries'
import type { ListingView } from '../api/types'
import { QueryState } from '../components/QueryState'
import { VoucherKeyField } from '../components/VoucherKeyField'
import { CONTRACT_ID } from '../config'
import { keyFingerprint } from '../lib/barter'
import {
  CODE_DISPUTE_WINDOW_SECONDS, UNVERIFIABLE_CODE_LIMIT, buildCodeKeyRelease, buildCodePurchase, codeCheckNotice, disputeSecondsLeft, parseCodeListing, prepareCode, receiveCode,
  type CodeListing, type CodeReceive, type PreparedCode,
} from '../lib/codeFlow'
import { formatCredit } from '../lib/format'
import { toAtomic } from '../lib/amount'
import { cipherPostedNotice, proofForApi, purchaseNotice, signPurchaseNotice, signSellerNotice } from '../lib/licenseFlow'
import { checkListingToBuy, memberOnChain } from '../lib/listingCheck'
import { describeMarketError } from '../lib/marketError'
import { useWallet } from '../wallet/WalletContext'

// FE-032: kode sekali tukar (pipeline P3, ADR-48). Kode dijual lewat pertukaran adil P7 (SD-076, SD-070): kode terenkripsi, kunci dilepas ke pembeli setelah ia membayar (voucher
// ditahan), dan kode yang salah dibuktikan dengan bukti curang. Kode tidak tampil di listing dan baru terbuka di browser pembeli setelah ia memintanya. Sengketa dibuka satu jam
// setelah kunci dilepas; diam sampai itu berarti konfirmasi otomatis. Kode yang penerbitnya tidak punya API cek dibatasi 20 credit kecuali ada jaminan.
const STATUS_LABEL: Record<string, string> = {
  paid_held: 'Dibayar, voucher ditahan', cipher_posted: 'Ciphertext terpasang', key_released: 'Kunci dilepas', confirmed: 'Terkonfirmasi', disputed: 'Disengketakan', refuted: 'Sengketa ditolak', cancelled: 'Dibatalkan',
}
const now = () => Math.floor(Date.now() / 1000)
const minutes = (seconds: number): string => `${Math.floor(seconds / 60)} menit ${seconds % 60} detik`

function Seller({ voucherKey, onVoucherKey, onPrepared }: { voucherKey: string; onVoucherKey: (v: string) => void; onPrepared: (p: PreparedCode) => void }) {
  const { account } = useWallet()
  const [code, setCode] = useState('')
  const [issuer, setIssuer] = useState('none')
  const [verifiable, setVerifiable] = useState(false)
  const [value, setValue] = useState('')
  const [arbiter, setArbiter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<PreparedCode | null>(null)
  const atomic = toAtomic(value)
  const needsBond = atomic !== null && !verifiable && BigInt(atomic) > BigInt(UNVERIFIABLE_CODE_LIMIT) && arbiter.trim() === ''

  function prepare() {
    if (!account || atomic === null) return
    setError(null)
    try {
      const prepared = prepareCode({ circle: CONTRACT_ID, seller: account, code, issuer, verifiable, value: atomic, arbiter, nonce: crypto.randomUUID().replaceAll('-', '').slice(0, 24) })
      setDone(prepared)
      onPrepared(prepared)
    } catch (e) {
      setDone(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <form className="form" aria-label="Siapkan kode" onSubmit={(e) => { e.preventDefault(); prepare() }}>
      <h3>Jual kode (penjual)</h3>
      {!account && <p className="state">Masuk dengan wallet untuk menyiapkan kode.</p>}
      <label><span>Kode (tidak dikirim ke mana pun; hanya komitmen berhash-nya di listing)</span><input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" /></label>
      <small>Kode paling sedikit 8 karakter. Listing hanya memuat komitmen dengan salt acak, jadi kode yang pendek pun tidak bisa ditebak dari listing.</small>
      <label><span>Penerbit (nama layanan, atau none)</span><input value={issuer} onChange={(e) => setIssuer(e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={verifiable} onChange={(e) => setVerifiable(e.target.checked)} /><span>Penerbit punya API cek (kode dicek sebelum kunci dilepas)</span></label>
      <label><span>Nilai (credit)</span><input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="5" /></label>
      <label><span>Arbiter jaminan CT-094 (opsional)</span><input value={arbiter} onChange={(e) => setArbiter(e.target.value)} placeholder="arbiter.near" /></label>
      {needsBond && <p className="state state-warn" role="note">Kode yang tidak bisa dicek dibatasi {formatCredit(UNVERIFIABLE_CODE_LIMIT)} credit. Di atas itu wajib jaminan: isi arbiter.</p>}
      <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />
      <div><button type="submit" disabled={!account || code.trim() === '' || atomic === null || needsBond}>Hash dan enkripsi kode</button></div>
      {error && <p className="state state-error" role="alert">{error}</p>}
      {done && (
        <div data-testid="code-prepared">
          <dl className="status-panel">
            <dt>code_commitment</dt><dd><code>{done.document.code_commitment}</code></dd>
            <dt>cipher_hash</dt><dd><code>{done.cipherHash}</code></dd>
            <dt>Resource</dt><dd><code>{done.resource}</code></dd>
          </dl>
          <p className="state state-warn" data-testid="code-keep-page" role="note">Kode, salt, dan kunci hanya ada di halaman ini. Menutup atau memuat ulang tab menghilangkannya: Anda tidak bisa melepas kunci ke pembeli, dan voucher yang ditahan dibatalkan. Satu kode hanya boleh dijual sekali; listing ganda untuk kode yang sama tidak terdeteksi lewat hash, jadi penjual yang menjualnya dua kali dikenali dari cek penerbit, sengketa, dan reputasi.</p>
          <p>Detail listing (salin ke kolom Detail listing kelas D):</p>
          <pre data-testid="code-detail">{done.detail}</pre>
        </div>
      )}
    </form>
  )
}

function Serve({ voucherKey, onVoucherKey, prepared }: { voucherKey: string; onVoucherKey: (v: string) => void; prepared: PreparedCode | null }) {
  const { account } = useWallet()
  const client = useQueryClient()
  const [id, setId] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [kind, setKind] = useState<'https' | 'ipfs'>('https')
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [buyerKey, setBuyerKey] = useState<{ buyer: string; publicKey: string; fingerprint: string } | null>(null)
  // BE-069: the verdict of the issuer for this listing and until when the book takes it (600 seconds)
  const [verdict, setVerdict] = useState<{ listingHash: string; verdict: 'valid' | 'used' | 'unknown'; validUntilMs: number | null } | null>(null)
  const query = usePurchase(open)

  async function send(label: string, fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await fn()
      setMessage(label)
      await client.invalidateQueries({ queryKey: ['purchase', open] })
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }
  const sameId = (answered: string): void => {
    if (answered !== open) throw new Error(`Jawaban server untuk pembelian ${answered}, bukan ${open} yang Anda buka: tidak ditandatangani.`)
  }
  const postCipher = () => send('Ciphertext dicatat.', async () => {
    sameId(query.data!.purchaseId)
    const notice = cipherPostedNotice(CONTRACT_ID, query.data!.purchaseId, account!, now(), { kind, ref: ref.trim() }, prepared!.cipherHash)
    await api.purchaseNotice(query.data!.purchaseId, notice, await signSellerNotice(notice, CONTRACT_ID, voucherKey))
  })
  const checkWithIssuer = () => send('Penerbit sudah dicek.', async () => {
    const view = query.data!
    sameId(view.purchaseId)
    const notice = codeCheckNotice(CONTRACT_ID, view.listingHash, account!, now())
    const answer = await api.codeCheck(view.listingHash, notice, await signSellerNotice(notice, CONTRACT_ID, voucherKey), prepared!.code, prepared!.salt)
    setVerdict({ listingHash: view.listingHash, verdict: answer.verdict, validUntilMs: answer.validUntilMs })
  })
  async function checkBuyer() {
    setError(null)
    setBuyerKey(null)
    try {
      const view = query.data!
      const member = await memberOnChain(view.buyer)
      if (member === null || member.status !== 'active') throw new Error(`${view.buyer} bukan anggota aktif di kontrak: kunci tidak dilepas.`)
      setBuyerKey({ buyer: view.buyer, publicKey: member.pubkey_voucher, fingerprint: await keyFingerprint(member.pubkey_voucher) })
    } catch (e) {
      setError(describeMarketError(e))
    }
  }
  const releaseKey = () => send('Kunci dilepas ke pembeli (tersegel). Jendela sengketa satu jam dimulai.', async () => {
    const view = query.data!
    sameId(view.purchaseId)
    if (buyerKey === null || buyerKey.buyer !== view.buyer) throw new Error('Periksa kunci pembeli dulu.')
    const { release, signature } = buildCodeKeyRelease({ prepared: prepared!, purchaseId: view.purchaseId, buyer: view.buyer, buyerPublicKey: buyerKey.publicKey, at: now(), sellerSecretKey: voucherKey })
    await api.purchaseNotice(view.purchaseId, release, signature)
    setBuyerKey(null)
    onVoucherKey('')
  })

  return (
    <section className="form" aria-label="Layani pembelian kode">
      <h3>Layani pembelian (penjual)</h3>
      {!prepared && <p className="state">Siapkan kode di atas dulu: kode, kunci, dan ciphertext ada di halaman ini, tidak di server.</p>}
      <label><span>Nomor pembelian</span><input value={id} onChange={(e) => setId(e.target.value)} /></label>
      <div><button type="button" disabled={id.trim() === ''} onClick={() => setOpen(id.trim())}>Buka pembelian</button></div>
      {open && (
        <QueryState query={query} loadingLabel="Memuat pembelian">
          {(view) => (
            <div data-testid="serve">
              <p>Status: <strong>{STATUS_LABEL[view.status] ?? view.status}</strong> · pembeli <code>{view.buyer}</code></p>
              {view.status === 'paid_held' && prepared && (
                <>
                  <p>Pasang ciphertext (<code>{prepared.cipherHash.slice(0, 12)}…</code>) di sumber, lalu catat alamatnya.</p>
                  <label><span>Jenis sumber</span><select value={kind} onChange={(e) => setKind(e.target.value as 'https' | 'ipfs')}><option value="https">https</option><option value="ipfs">ipfs (CIDv1 raw)</option></select></label>
                  <label><span>Alamat atau CID</span><input value={ref} onChange={(e) => setRef(e.target.value)} /></label>
                  <button type="button" disabled={busy || voucherKey.trim() === '' || ref.trim() === ''} onClick={() => void postCipher()}>Catat ciphertext</button>
                </>
              )}
              {view.status === 'cipher_posted' && prepared && prepared.document.verifiable && (
                <div data-testid="issuer-check">
                  <p className="state state-warn" role="note" data-testid="check-disclosure">
                    Untuk kode yang bisa dicek, backend melihat kode dan salt satu kali saat pengecekan: keduanya dikirim ke backend, diteruskan ke penerbit <code>{prepared.document.issuer}</code>, dan tidak disimpan.
                    Backend hanya menyimpan vonis dan waktunya. Backend yang tidak jujur bisa menebus kode itu lebih dulu; bila Anda tidak mempercayai backend ini, jangan jual kode yang bisa dicek di sini.
                    Vonis berlaku 10 menit; kunci tidak dilepas tanpa vonis <em>valid</em> yang masih berlaku.
                  </p>
                  <button type="button" disabled={busy || voucherKey.trim() === ''} onClick={() => void checkWithIssuer()}>Tunjukkan kode ke backend untuk dicek penerbit</button>
                  {verdict && verdict.listingHash === view.listingHash && (
                    <p className={verdict.verdict === 'valid' ? 'state' : 'state state-error'} role={verdict.verdict === 'valid' ? 'status' : 'alert'} data-testid="issuer-verdict">
                      {verdict.verdict === 'valid' && 'Penerbit menyatakan kode sah. Kunci boleh dilepas dalam 10 menit.'}
                      {verdict.verdict === 'used' && 'Penerbit menyatakan kode sudah terpakai: pembelian dan listing dibatalkan, kunci tidak dilepas, voucher pembeli tidak berpindah.'}
                      {verdict.verdict === 'unknown' && 'Penerbit tidak mengenal kode ini: kunci tidak dilepas.'}
                    </p>
                  )}
                </div>
              )}
              {view.status === 'cipher_posted' && prepared && !prepared.document.verifiable && (
                <p className="state state-warn" role="note" data-testid="no-check-note">Kode ini tidak bisa dicek: backend tidak melihat kodenya, dan tidak ada yang memastikan kode belum terpakai sebelum kunci dilepas. Pembeli hanya terlindungi sengketa satu jam dan batas nilai.</p>
              )}
              {view.status === 'cipher_posted' && prepared && (
                <>
                  <button type="button" disabled={busy} onClick={() => void checkBuyer()}>Periksa kunci pembeli di kontrak</button>
                  {buyerKey && (
                    <div data-testid="buyer-key">
                      <p>Kunci akan disegel ke kunci voucher <code>{buyerKey.buyer}</code> menurut kontrak, sidik jari <code data-testid="buyer-fingerprint">{buyerKey.fingerprint}</code>.</p>
                      <button type="button" disabled={busy || voucherKey.trim() === '' || (prepared.document.verifiable && !(verdict !== null && verdict.listingHash === view.listingHash && verdict.verdict === 'valid' && (verdict.validUntilMs === null || verdict.validUntilMs > Date.now())))} onClick={() => void releaseKey()}>Lepas kunci ke {buyerKey.buyer} (sidik jari {buyerKey.fingerprint})</button>
                    </div>
                  )}
                </>
              )}
              {view.status === 'confirmed' && <p className="state" role="status">Terkonfirmasi{view.autoConfirmed ? ' otomatis' : ''}: voucher pembeli dilepas ke Anda.</p>}
            </div>
          )}
        </QueryState>
      )}
      {message && <p className="state" role="status">{message}</p>}
      {error && <p className="state state-error" role="alert">{error}</p>}
    </section>
  )
}

function Warnings({ listing }: { listing: CodeListing }) {
  return (
    <>
      {!listing.verifiable && (
        <p className="state state-warn" role="note" data-testid="unverifiable-warning">
          Kode ini tidak bisa dicek: penerbit <code>{listing.issuer}</code> tidak punya API cek, jadi tidak ada yang memastikan kode belum terpakai sebelum Anda membayar.
          Perlindungan Anda hanya sengketa satu jam setelah kunci dilepas{listing.bonded ? ' dan jaminan penjual' : ''}. Nilai kode dibatasi {formatCredit(UNVERIFIABLE_CODE_LIMIT)} credit kecuali ada jaminan.
        </p>
      )}
      {!listing.verifiable && listing.overLimit && (
        <p className="state state-error" role="alert" data-testid="over-limit">Nilai {formatCredit(listing.value)} credit di atas batas {formatCredit(UNVERIFIABLE_CODE_LIMIT)} untuk kode yang tidak bisa dicek, dan listing tidak punya jaminan. Jangan dibeli.</p>
      )}
    </>
  )
}

function BuyForm({ voucherKey, onBought }: { voucherKey: string; onBought: (id: string) => void }) {
  const { account } = useWallet()
  const [hash, setHash] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState<{ view: ListingView; listing: CodeListing; fingerprint: string } | null>(null)

  async function check() {
    setBusy(true)
    setError(null)
    setChecked(null)
    try {
      const typed = hash.trim()
      const view = await api.listing(typed)
      const listing = parseCodeListing(view)
      if (listing === null) throw new Error('Listing ini bukan listing kode (detail tidak memuat kind code dan code_doc).')
      const result = await checkListingToBuy(view, typed)
      if (!result.ok) throw new Error(result.reason)
      setChecked({ view, listing, fingerprint: result.sellerFingerprint })
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }
  async function buy() {
    if (!account || !checked) return
    setBusy(true)
    setError(null)
    try {
      const { view, listing } = checked
      const epochs = await api.epochs()
      const open = epochs.items.find((e) => e.phase === 'open')
      if (!open) throw new Error('Tidak ada epoch open: voucher belum bisa dibuat.')
      const ob = await viewContract<{ cumulative: string; last_seq: number } | null>('obligation', { epoch: open.epoch, debtor: account, creditor: view.account })
      const built = await buildCodePurchase({
        circle: CONTRACT_ID, buyer: account, seller: view.account, epoch: open.epoch, amount: view.offer.value, state: { seq: ob?.last_seq ?? 0, cumulativeAmount: ob?.cumulative ?? '0' },
        codeDocHash: listing.docHash, secretKey: voucherKey,
      })
      const created = await api.createPurchase(hash.trim(), built.voucher, built.signature)
      setChecked(null)
      onBought(String(created.purchase_id ?? created.purchaseId ?? ''))
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <label><span>Hash listing kode</span><input value={hash} onChange={(e) => { setHash(e.target.value); setChecked(null) }} placeholder="64 heks" /></label>
      <button type="button" disabled={!account || busy || !/^[0-9a-f]{64}$/.test(hash.trim())} onClick={() => void check()}>Periksa listing</button>
      {checked && (
        <div data-testid="code-summary">
          <dl className="status-panel">
            <dt>Kode</dt><dd data-testid="code-hidden">disembunyikan sampai dibeli; komitmen <code>{checked.listing.codeCommitment}</code></dd>
            <dt>Nilai</dt><dd>{formatCredit(checked.listing.value)} credit</dd>
            <dt>Penerbit</dt><dd><code>{checked.listing.issuer}</code> · {checked.listing.verifiable ? 'bisa dicek' : 'tidak bisa dicek'}{checked.listing.bonded ? ' · dengan jaminan' : ''}</dd>
            <dt>Dibayar kepada</dt><dd><code>{checked.view.account}</code> · sidik jari kunci penjual <code>{checked.fingerprint}</code></dd>
            <dt>Harga</dt><dd>{formatCredit(checked.view.offer.value)} credit</dd>
          </dl>
          <Warnings listing={checked.listing} />
          <button type="button" disabled={busy || voucherKey.trim() === '' || (!checked.listing.verifiable && checked.listing.overLimit)} onClick={() => void buy()}>
            Beli {formatCredit(checked.view.offer.value)} credit dari {checked.view.account} (voucher ditahan backend)
          </button>
        </div>
      )}
      <small>Voucher tidak diberikan ke penjual: backend mendaftarkannya hanya setelah kode cocok atau konfirmasi otomatis. Penjual yang menjual kode yang sama dua kali tidak terdeteksi lewat hash: lindungi diri dengan sengketa satu jam.</small>
      {error && <p className="state state-error" role="alert">{error}</p>}
    </div>
  )
}

function Buyer({ voucherKey }: { voucherKey: string }) {
  const { account } = useWallet()
  const client = useQueryClient()
  const [id, setId] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [sellerKey, setSellerKey] = useState('')
  const [result, setResult] = useState<CodeReceive | null>(null)
  const [shown, setShown] = useState(false)
  const [tick, setTick] = useState(now())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const query = usePurchase(open)
  useEffect(() => {
    const timer = setInterval(() => setTick(now()), 1000)
    return () => clearInterval(timer)
  }, [])

  async function receive() {
    if (!query.data) return
    setBusy(true)
    setError(null)
    setResult(null)
    setShown(false)
    try {
      setResult(await receiveCode(query.data, sellerKey.trim(), voucherKey, () => undefined))
    } finally {
      setBusy(false)
    }
  }
  async function notify(action: 'confirmed' | 'disputed', reason: string | null, proof: ReturnType<typeof proofForApi> | null) {
    if (!query.data || !account) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (query.data.purchaseId !== open) throw new Error(`Jawaban server untuk pembelian ${query.data.purchaseId}, bukan ${open} yang Anda buka: tidak ditandatangani.`)
      const notice = purchaseNotice(CONTRACT_ID, query.data.purchaseId, account, action, now(), reason, proof)
      await api.purchaseNotice(query.data.purchaseId, notice, await signPurchaseNotice(notice, voucherKey))
      setMessage(action === 'confirmed' ? 'Dikonfirmasi: voucher akan didaftarkan.' : 'Sengketa dikirim.')
      await client.invalidateQueries({ queryKey: ['purchase', open] })
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="form" aria-label="Pembelian kode">
      <h3>Pembelian (pembeli)</h3>
      <BuyForm voucherKey={voucherKey} onBought={(pid) => { setId(pid); setOpen(pid) }} />
      <label><span>Nomor pembelian</span><input value={id} onChange={(e) => setId(e.target.value)} /></label>
      <div><button type="button" disabled={id.trim() === ''} onClick={() => setOpen(id.trim())}>Buka pembelian</button></div>
      {open && (
        <QueryState query={query} loadingLabel="Memuat pembelian">
          {(view) => {
            const left = disputeSecondsLeft(view.disputeUntil, tick)
            const canDispute = view.status === 'key_released' && (left === null || left > 0)
            return (
              <div data-testid="purchase">
                <p>Status: <strong>{STATUS_LABEL[view.status] ?? view.status}</strong></p>
                {left !== null && view.status === 'key_released' && (
                  <p data-testid="dispute-window" role="status">
                    {left > 0 ? `Sengketa dibuka ${minutes(left)} lagi (jendela ${CODE_DISPUTE_WINDOW_SECONDS / 60} menit); diam sampai itu berarti konfirmasi otomatis.` : 'Jendela sengketa sudah lewat: pembelian dikonfirmasi otomatis.'}
                  </p>
                )}
                {view.source && <p>Sumber: <code>{view.source.kind}</code> <code>{view.source.ref}</code></p>}
                {view.status === 'key_released' && (
                  <>
                    <label><span>Kunci publik penjual (ed25519:…)</span><input value={sellerKey} onChange={(e) => setSellerKey(e.target.value)} /></label>
                    <button type="button" disabled={busy || voucherKey.trim() === '' || sellerKey.trim() === ''} onClick={() => void receive()}>Unduh dan periksa kode</button>
                  </>
                )}
                {result?.state === 'ok' && (
                  <div data-testid="code-ok">
                    <p className="state" role="status">Kode cocok dengan code_commitment. Coba tebus di penerbit sebelum menutup jendela sengketa; bila ditolak karena sudah terpakai, sengketakan.</p>
                    {shown ? <p>Kode: <code data-testid="code-value">{result.code}</code></p> : <button type="button" onClick={() => setShown(true)}>Tampilkan kode</button>}
                    <button type="button" disabled={busy} onClick={() => void notify('confirmed', null, null)}>Konfirmasi</button>
                  </div>
                )}
                {result?.state === 'cheated' && (
                  <div data-testid="code-cheated">
                    <p className="state state-error" role="alert">Kode tidak cocok ({result.reason}). Bukti curang siap; kode yang salah tidak dibayar.</p>
                    <button type="button" disabled={busy || !canDispute} onClick={() => void notify('disputed', 'content_mismatch', proofForApi(result.proof))}>Sengketakan dengan bukti</button>
                  </div>
                )}
                {result?.state === 'refused' && <p className="state state-error" role="alert" data-testid="code-refused">{result.reason}</p>}
                {view.status === 'key_released' && (
                  <button type="button" disabled={busy || !canDispute} onClick={() => void notify('disputed', 'other', null)}>Sengketakan: kode sudah terpakai atau ditolak penerbit</button>
                )}
              </div>
            )
          }}
        </QueryState>
      )}
      {message && <p className="state" role="status">{message}</p>}
      {error && <p className="state state-error" role="alert">{error}</p>}
    </section>
  )
}

export function Codes() {
  const [voucherKey, setVoucherKey] = useState('')
  const [prepared, setPrepared] = useState<PreparedCode | null>(null)
  return (
    <>
      <h2>Kode sekali tukar</h2>
      <p className="state">Yang dijual adalah satu kode yang hanya bisa dipakai sekali. Kode terenkripsi dan tersembunyi sampai dibeli; kunci dilepas ke pembeli setelah ia membayar (voucher ditahan), dan sengketa dibuka satu jam setelah itu.</p>
      <Seller voucherKey={voucherKey} onVoucherKey={setVoucherKey} onPrepared={setPrepared} />
      <Serve voucherKey={voucherKey} onVoucherKey={setVoucherKey} prepared={prepared} />
      <Buyer voucherKey={voucherKey} />
    </>
  )
}
