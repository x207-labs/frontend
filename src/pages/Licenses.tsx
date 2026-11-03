import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import { viewContract } from '../api/chain'
import { usePurchase } from '../api/queries'
import { QueryState } from '../components/QueryState'
import { VoucherKeyField } from '../components/VoucherKeyField'
import { CONTRACT_ID } from '../config'
import {
  LICENSE_ASSET_TYPES, buildKeyRelease, buildPurchase, cipherPostedNotice, prepareLicense, signSellerNotice, proofForApi, purchaseNotice, receiveLicense, signPurchaseNotice, takedownMessage,
  type DownloadResult, type PreparedLicense,
} from '../lib/licenseFlow'
import { describeMarketError } from '../lib/marketError'
import { sha256Hex, signMessageWithVoucher } from '../lib/barter'
import { useWallet } from '../wallet/WalletContext'

// FE-028: lisensi konten (pipeline P7, ADR-46), dari Spec API Backend 5g. Penjual menyiapkan lisensi dari berkas lokal (hash, enkripsi di browser, detail listing); pembeli membeli
// (voucher ditahan backend), mengunduh ciphertext dengan progres, memeriksa hash, dan mengonfirmasi atau menyengketakan dengan bukti curang; pemilik hak mengajukan takedown.
// Berkas dan kunci tidak pernah dikirim ke backend. Batas yang diakui: lisensi eksklusif dicatat per content_hash, dan penjual yang mengubah satu byte tidak terdeteksi otomatis.
const STATUS_LABEL: Record<string, string> = {
  paid_held: 'Dibayar, voucher ditahan', cipher_posted: 'Ciphertext terpasang', key_released: 'Kunci dilepas', confirmed: 'Terkonfirmasi', disputed: 'Disengketakan', refuted: 'Sengketa ditolak', cancelled: 'Dibatalkan',
}
const now = () => Math.floor(Date.now() / 1000)
const download = (name: string, bytes: Uint8Array): string => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  return url
}

function Seller({ voucherKey, onVoucherKey, onPrepared }: { voucherKey: string; onVoucherKey: (v: string) => void; onPrepared: (p: PreparedLicense) => void }) {
  const { account } = useWallet()
  const [file, setFile] = useState<File | null>(null)
  const [assetType, setAssetType] = useState<string>(LICENSE_ASSET_TYPES[0])
  const [licenseId, setLicenseId] = useState('personal')
  const [licenseText, setLicenseText] = useState('')
  const [preview, setPreview] = useState('')
  const [exclusive, setExclusive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<PreparedLicense | null>(null)

  async function prepare() {
    if (!account || !file) return
    setBusy(true)
    setError(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const prepared = await prepareLicense({ circle: CONTRACT_ID, seller: account, bytes, assetType, licenseId, licenseText, previewText: preview, exclusive, nonce: crypto.randomUUID().replaceAll('-', '').slice(0, 24) })
      setDone(prepared)
      onPrepared(prepared)
    } catch (e) {
      setDone(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="form" aria-label="Siapkan lisensi" onSubmit={(e) => { e.preventDefault(); void prepare() }}>
      <h3>Siapkan lisensi (penjual)</h3>
      {!account && <p className="state">Masuk dengan wallet untuk menyiapkan lisensi.</p>}
      <label><span>Berkas (tidak dikirim ke mana pun)</span><input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      <label>
        <span>Jenis aset</span>
        <select value={assetType} onChange={(e) => setAssetType(e.target.value)}>{LICENSE_ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
      </label>
      <label><span>Jenis lisensi (license_id)</span><input value={licenseId} onChange={(e) => setLicenseId(e.target.value)} placeholder="personal" /></label>
      <label><span>Teks lisensi (hanya hash-nya yang dipakai)</span><textarea value={licenseText} onChange={(e) => setLicenseText(e.target.value)} rows={3} /></label>
      <label><span>Preview (opsional, hanya hash-nya yang dipakai)</span><textarea value={preview} onChange={(e) => setPreview(e.target.value)} rows={2} /></label>
      <label className="check"><input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} /><span>Eksklusif (satu pembeli per content_hash; wajib jaminan CT-094)</span></label>
      <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />
      <div><button type="submit" disabled={!account || !file || licenseText.trim() === '' || busy}>{busy ? 'Menghitung…' : 'Hitung hash dan enkripsi'}</button></div>
      {error && <p className="state state-error" role="alert">{error}</p>}
      {done && (
        <div data-testid="license-prepared">
          <dl className="status-panel">
            <dt>content_hash</dt><dd><code>{done.document.content_hash}</code></dd>
            <dt>cipher_hash</dt><dd><code>{done.cipherHash}</code></dd>
            <dt>Resource</dt><dd><code>{done.resource}</code></dd>
          </dl>
          <p className="state">Pasang ciphertext di sumber mana saja (https atau ipfs) lalu catat cipher_hash di pembelian. Simpan kunci berkas: hanya Anda yang memegangnya, dan ia dilepas ke pembeli dalam bentuk tersegel setelah pembeli membayar.</p>
          <p>Detail listing (salin ke kolom Detail listing kelas D):</p>
          <pre data-testid="license-detail">{done.detail}</pre>
          <button type="button" onClick={() => download('license.enc', done.ciphertext)}>Unduh ciphertext</button>
          <details><summary>Kunci berkas (rahasia)</summary><code data-testid="license-key">{done.contentKey}</code></details>
        </div>
      )}
    </form>
  )
}

function Serve({ voucherKey, prepared }: { voucherKey: string; prepared: PreparedLicense | null }) {
  const { account } = useWallet()
  const client = useQueryClient()
  const [id, setId] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [kind, setKind] = useState<'https' | 'ipfs'>('https')
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
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
  const postCipher = () => send('Ciphertext dicatat.', async () => {
    const notice = cipherPostedNotice(CONTRACT_ID, query.data!.purchaseId, account!, now(), { kind, ref: ref.trim() }, prepared!.cipherHash)
    await api.purchaseNotice(query.data!.purchaseId, notice, await signSellerNotice(notice, CONTRACT_ID, voucherKey))
  })
  const releaseKey = () => send('Kunci dilepas ke pembeli (tersegel).', async () => {
    const view = query.data!
    const buyer = await api.member(view.buyer)
    const { release, signature } = buildKeyRelease({
      circle: CONTRACT_ID, licenseDoc: prepared!.documentHash, purchaseId: view.purchaseId, buyer: view.buyer, buyerPublicKey: buyer.pubkeyVoucher, contentHash: prepared!.document.content_hash, prepared: prepared!, at: now(), sellerSecretKey: voucherKey,
    })
    await api.purchaseNotice(view.purchaseId, release, signature)
  })

  return (
    <section className="form" aria-label="Layani pembelian">
      <h3>Layani pembelian (penjual)</h3>
      {!prepared && <p className="state">Siapkan lisensi di atas dulu: kunci berkas dan ciphertext ada di halaman ini, tidak di server.</p>}
      <label><span>Nomor pembelian</span><input value={id} onChange={(e) => setId(e.target.value)} /></label>
      <div><button type="button" disabled={id.trim() === ''} onClick={() => setOpen(id.trim())}>Buka pembelian</button></div>
      {open && (
        <QueryState query={query} loadingLabel="Memuat pembelian">
          {(view) => (
            <div data-testid="serve">
              <p>Status: <strong>{STATUS_LABEL[view.status] ?? view.status}</strong> · pembeli <code>{view.buyer}</code>{view.exclusive && ' · eksklusif'}</p>
              {view.status === 'paid_held' && prepared && (
                <>
                  <p>Pasang ciphertext (<code>{prepared.cipherHash.slice(0, 12)}…</code>) di sumber, lalu catat alamatnya.</p>
                  <label><span>Jenis sumber</span><select value={kind} onChange={(e) => setKind(e.target.value as 'https' | 'ipfs')}><option value="https">https</option><option value="ipfs">ipfs (CIDv1 raw)</option></select></label>
                  <label><span>Alamat atau CID</span><input value={ref} onChange={(e) => setRef(e.target.value)} /></label>
                  <button type="button" disabled={busy || voucherKey.trim() === '' || ref.trim() === ''} onClick={() => void postCipher()}>Catat ciphertext</button>
                </>
              )}
              {view.status === 'cipher_posted' && prepared && (
                <button type="button" disabled={busy || voucherKey.trim() === ''} onClick={() => void releaseKey()}>Lepas kunci ke pembeli</button>
              )}
              {view.status === 'confirmed' && <p className="state" role="status">Terkonfirmasi{view.autoConfirmed ? ' otomatis' : ''}: voucher pembeli sudah dilepas ke Anda untuk didaftarkan.</p>}
            </div>
          )}
        </QueryState>
      )}
      {message && <p className="state" role="status">{message}</p>}
      {error && <p className="state state-error" role="alert">{error}</p>}
    </section>
  )
}

function Buyer({ voucherKey }: { voucherKey: string }) {
  const { account } = useWallet()
  const client = useQueryClient()
  const [id, setId] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [sellerKey, setSellerKey] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [result, setResult] = useState<DownloadResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const query = usePurchase(open)

  async function check() {
    if (!query.data) return
    setBusy(true)
    setError(null)
    setResult(null)
    setProgress(0)
    try {
      setResult(await receiveLicense(query.data, sellerKey.trim(), voucherKey, setProgress))
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
      const notice = purchaseNotice(CONTRACT_ID, query.data.purchaseId, account, action, now(), reason, proof)
      await api.purchaseNotice(query.data.purchaseId, notice, await signPurchaseNotice(notice, voucherKey))
      setMessage(action === 'confirmed' ? 'Dikonfirmasi: voucher akan didaftarkan.' : 'Sengketa dikirim dengan bukti.')
      await client.invalidateQueries({ queryKey: ['purchase', open] })
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="form" aria-label="Pembelian lisensi">
      <h3>Pembelian (pembeli)</h3>
      <BuyForm voucherKey={voucherKey} onBought={(pid) => { setId(pid); setOpen(pid) }} />
      <label><span>Nomor pembelian</span><input value={id} onChange={(e) => setId(e.target.value)} /></label>
      <div><button type="button" disabled={id.trim() === ''} onClick={() => setOpen(id.trim())}>Buka pembelian</button></div>
      {open && (
        <QueryState query={query} loadingLabel="Memuat pembelian">
          {(view) => (
            <div data-testid="purchase">
              <p>Status: <strong>{STATUS_LABEL[view.status] ?? view.status}</strong></p>
              {view.disputeUntil && <p>Jendela sengketa sampai {new Date(view.disputeUntil * 1000).toISOString()}; diam sampai itu berarti konfirmasi otomatis.</p>}
              {view.source && <p>Sumber: <code>{view.source.kind}</code> <code>{view.source.ref}</code></p>}
              {view.status === 'key_released' && (
                <>
                  <label><span>Kunci publik penjual (ed25519:…)</span><input value={sellerKey} onChange={(e) => setSellerKey(e.target.value)} /></label>
                  <button type="button" disabled={busy || voucherKey.trim() === '' || sellerKey.trim() === ''} onClick={() => void check()}>Unduh dan periksa hash</button>
                  {progress !== null && <p data-testid="download-progress" role="status">Diunduh {progress} byte</p>}
                </>
              )}
              {result?.state === 'ok' && (
                <div data-testid="license-ok">
                  <p className="state" role="status">Isi cocok dengan content_hash. Konfirmasi agar voucher didaftarkan.</p>
                  <button type="button" onClick={() => download('license-content', result.content)}>Simpan berkas</button>
                  <button type="button" disabled={busy} onClick={() => void notify('confirmed', null, null)}>Konfirmasi</button>
                </div>
              )}
              {result?.state === 'cheated' && (
                <div data-testid="license-cheated">
                  <p className="state state-error" role="alert">Isi tidak cocok ({result.reason}). Bukti curang siap; berkas yang salah tidak dibayar.</p>
                  <button type="button" disabled={busy} onClick={() => void notify('disputed', 'content_mismatch', proofForApi(result.proof))}>Sengketakan dengan bukti</button>
                </div>
              )}
              {result?.state === 'refused' && <p className="state state-error" role="alert" data-testid="license-refused">{result.reason}</p>}
              {result?.state === 'refused' && view.status === 'key_released' && (
                <button type="button" disabled={busy} onClick={() => void notify('disputed', 'other', null)}>Sengketakan (alasan lain)</button>
              )}
            </div>
          )}
        </QueryState>
      )}
      {message && <p className="state" role="status">{message}</p>}
      {error && <p className="state state-error" role="alert">{error}</p>}
    </section>
  )
}

function BuyForm({ voucherKey, onBought }: { voucherKey: string; onBought: (id: string) => void }) {
  const { account } = useWallet()
  const [hash, setHash] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function buy() {
    if (!account) return
    setBusy(true)
    setError(null)
    try {
      const listing = await api.listing(hash.trim())
      let docHash: string | null = null
      try {
        const parsed: unknown = JSON.parse(listing.detail)
        docHash = typeof parsed === 'object' && parsed !== null && typeof (parsed as { license_doc?: unknown }).license_doc === 'string' ? (parsed as { license_doc: string }).license_doc : null
      } catch {
        docHash = null
      }
      if (docHash === null) throw new Error('Listing ini bukan listing lisensi (detail tidak memuat license_doc).')
      const epochs = await api.epochs()
      const open = epochs.items.find((e) => e.phase === 'open')
      if (!open) throw new Error('Tidak ada epoch open: voucher belum bisa dibuat.')
      const ob = await viewContract<{ cumulative: string; last_seq: number } | null>('obligation', { epoch: open.epoch, debtor: account, creditor: listing.account })
      const built = await buildPurchase({
        circle: CONTRACT_ID, buyer: account, seller: listing.account, epoch: open.epoch, amount: listing.offer.value, state: { seq: ob?.last_seq ?? 0, cumulativeAmount: ob?.cumulative ?? '0' },
        licenseDocHash: docHash, secretKey: voucherKey,
      })
      const created = await api.createPurchase(hash.trim(), built.voucher, built.signature)
      onBought(String(created.purchase_id ?? created.purchaseId ?? ''))
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <label><span>Hash listing lisensi</span><input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="64 heks" /></label>
      <button type="button" disabled={!account || busy || voucherKey.trim() === '' || !/^[0-9a-f]{64}$/.test(hash.trim())} onClick={() => void buy()}>Beli (voucher ditahan backend)</button>
      <small>Voucher tidak diberikan ke penjual: backend mendaftarkannya hanya setelah isi cocok atau konfirmasi otomatis.</small>
      {error && <p className="state state-error" role="alert">{error}</p>}
    </div>
  )
}

function Takedown({ voucherKey }: { voucherKey: string }) {
  const { account } = useWallet()
  const [hash, setHash] = useState('')
  const [claim, setClaim] = useState('')
  const [evidence, setEvidence] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function send() {
    setMessage(null)
    setError(null)
    try {
      const evidenceHash = evidence.trim() === '' ? '' : await sha256Hex(evidence.trim())
      const signature = await signMessageWithVoucher(takedownMessage(CONTRACT_ID, hash.trim(), claim.trim(), evidenceHash), CONTRACT_ID, voucherKey)
      await api.takedown(hash.trim(), claim.trim(), evidenceHash, signature)
      setMessage('Takedown diajukan: listing disembunyikan dan pembelian yang belum dikonfirmasi dibatalkan. Dana yang sudah dikonfirmasi tidak ditarik.')
    } catch (e) {
      setError(describeMarketError(e))
    }
  }
  return (
    <form className="form" aria-label="Takedown" onSubmit={(e) => { e.preventDefault(); void send() }}>
      <h3>Takedown (pemilik hak)</h3>
      <label><span>Hash listing</span><input value={hash} onChange={(e) => setHash(e.target.value)} /></label>
      <label><span>Pernyataan (Anda pemilik hak dan listing melanggarnya)</span><textarea value={claim} onChange={(e) => setClaim(e.target.value)} rows={2} /></label>
      <label><span>Bukti kepemilikan (teks atau tautan; hanya hash-nya yang dikirim)</span><input value={evidence} onChange={(e) => setEvidence(e.target.value)} /></label>
      <div><button type="submit" disabled={!account || voucherKey.trim() === '' || !/^[0-9a-f]{64}$/.test(hash.trim()) || claim.trim() === ''}>Tanda tangani dan ajukan takedown</button></div>
      {message && <p className="state" role="status">{message}</p>}
      {error && <p className="state state-error" role="alert">{error}</p>}
    </form>
  )
}

export function Licenses() {
  const [voucherKey, setVoucherKey] = useState('')
  const [prepared, setPrepared] = useState<PreparedLicense | null>(null)
  return (
    <>
      <h2>Lisensi konten</h2>
      <p className="state">x207 tidak menyimpan berkas. Yang dijual adalah lisensi; ciphertext ada di sumber pilihan penjual, dan kunci dilepas ke pembeli setelah ia membayar (voucher ditahan). Harga lisensi mengikuti nilai di listing.</p>
      <Seller voucherKey={voucherKey} onVoucherKey={setVoucherKey} onPrepared={setPrepared} />
      <Serve voucherKey={voucherKey} prepared={prepared} />
      <Buyer voucherKey={voucherKey} />
      <Takedown voucherKey={voucherKey} />
    </>
  )
}
