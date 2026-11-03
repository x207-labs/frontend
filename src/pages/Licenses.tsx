import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import { viewContract } from '../api/chain'
import { usePurchase } from '../api/queries'
import type { ListingView } from '../api/types'
import { QueryState } from '../components/QueryState'
import { VoucherKeyField } from '../components/VoucherKeyField'
import { CONTRACT_ID } from '../config'
import {
  LICENSE_ASSET_TYPES, buildKeyRelease, buildPurchase, cipherPostedNotice, prepareLicense, signSellerNotice, proofForApi, purchaseNotice, receiveLicense, signPurchaseNotice, takedownMessage,
  type DownloadResult, type PreparedLicense,
} from '../lib/licenseFlow'
import { formatCredit } from '../lib/format'
import { checkListingToBuy, memberOnChain } from '../lib/listingCheck'
import { describeMarketError } from '../lib/marketError'
import { keyFingerprint, sha256Hex, signMessageWithVoucher } from '../lib/barter'
import { useWallet } from '../wallet/WalletContext'

// FE-028: lisensi konten (pipeline P7, ADR-46), dari Spec API Backend 5g. Penjual menyiapkan lisensi dari berkas lokal (hash, enkripsi di browser, detail listing); pembeli membeli
// (voucher ditahan backend), mengunduh ciphertext dengan progres, memeriksa hash, dan mengonfirmasi atau menyengketakan dengan bukti curang; pemilik hak mengajukan takedown.
// Berkas dan kunci tidak pernah dikirim ke backend. Batas yang diakui: lisensi eksklusif dicatat per content_hash, dan penjual yang mengubah satu byte tidak terdeteksi otomatis.
const STATUS_LABEL: Record<string, string> = {
  paid_held: 'Paid, voucher held', cipher_posted: 'Ciphertext posted', key_released: 'Key released', confirmed: 'Confirmed', disputed: 'Disputed', refuted: 'Dispute rejected', cancelled: 'Cancelled',
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
    <form className="form" aria-label="Prepare license" onSubmit={(e) => { e.preventDefault(); void prepare() }}>
      <h3>Prepare a license (seller)</h3>
      {!account && <p className="state">Sign in with your wallet to prepare a license.</p>}
      <label><span>File (sent nowhere)</span><input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      <label>
        <span>Asset type</span>
        <select value={assetType} onChange={(e) => setAssetType(e.target.value)}>{LICENSE_ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
      </label>
      <label><span>License type (license_id)</span><input value={licenseId} onChange={(e) => setLicenseId(e.target.value)} placeholder="personal" /></label>
      <label><span>License text (only its hash is used)</span><textarea value={licenseText} onChange={(e) => setLicenseText(e.target.value)} rows={3} /></label>
      <label><span>Preview (optional, only its hash is used)</span><textarea value={preview} onChange={(e) => setPreview(e.target.value)} rows={2} /></label>
      <label className="check"><input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} /><span>Exclusive (one buyer per content_hash; bond required, CT-094)</span></label>
      <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />
      <div><button type="submit" disabled={!account || !file || licenseText.trim() === '' || busy}>{busy ? 'Computing…' : 'Compute hash and encrypt'}</button></div>
      {error && <p className="state state-error" role="alert">{error}</p>}
      {done && (
        <div data-testid="license-prepared">
          <dl className="status-panel">
            <dt>content_hash</dt><dd><code>{done.document.content_hash}</code></dd>
            <dt>cipher_hash</dt><dd><code>{done.cipherHash}</code></dd>
            <dt>Resource</dt><dd><code>{done.resource}</code></dd>
          </dl>
          <p className="state">Post the ciphertext at any source (https or ipfs), then record the cipher_hash in the purchase. Keep the file key: only you hold it, and it is released to the buyer in sealed form after the buyer pays.</p>
          <p className="state state-warn" data-testid="license-keep-page" role="note">The file key and the original file exist only on this page. Closing or reloading the tab loses them: you cannot release the key to the buyer, and the held voucher is cancelled. Keep the tab open until every buyer is served, and store the file key somewhere safe.</p>
          <p>Listing detail (copy into the class D Listing detail field):</p>
          <pre data-testid="license-detail">{done.detail}</pre>
          <button type="button" onClick={() => download('license.enc', done.ciphertext)}>Download ciphertext</button>
          <details><summary>File key (secret)</summary><code data-testid="license-key">{done.contentKey}</code></details>
        </div>
      )}
    </form>
  )
}

// Batch 3 F6: the buyer sees which host the download will contact before it starts; the seller chose the address.
function sourceHost(source: { kind: string; ref: string }): string {
  if (source.kind === 'ipfs') return `IPFS gateway for ${source.ref}`
  try {
    return new URL(source.ref).host
  } catch {
    return source.ref
  }
}

function Serve({ voucherKey, onVoucherKey, prepared }: { voucherKey: string; onVoucherKey: (value: string) => void; prepared: PreparedLicense | null }) {
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
  // Batch 3 F3: a notice is signed only for the purchase that the user opened, not for the id the API answers with
  const sameId = (answered: string): void => {
    if (answered !== open) throw new Error(`The server answered for purchase ${answered}, not ${open} which you opened: not signed.`)
  }
  const postCipher = () => send('Ciphertext recorded.', async () => {
    sameId(query.data!.purchaseId)
    const notice = cipherPostedNotice(CONTRACT_ID, query.data!.purchaseId, account!, now(), { kind, ref: ref.trim() }, prepared!.cipherHash)
    await api.purchaseNotice(query.data!.purchaseId, notice, await signSellerNotice(notice, CONTRACT_ID, voucherKey))
  })
  // Batch 3 F2: the key of the buyer is read from the contract, never from the read API, and its fingerprint is shown before the key of the file is sealed to it.
  const [buyerKey, setBuyerKey] = useState<{ buyer: string; publicKey: string; fingerprint: string } | null>(null)
  async function checkBuyer() {
    setError(null)
    setBuyerKey(null)
    try {
      const view = query.data!
      const member = await memberOnChain(view.buyer)
      if (member === null || member.status !== 'active') throw new Error(`${view.buyer} is not an active member in the contract: key not released.`)
      setBuyerKey({ buyer: view.buyer, publicKey: member.pubkey_voucher, fingerprint: await keyFingerprint(member.pubkey_voucher) })
    } catch (e) {
      setError(describeMarketError(e))
    }
  }
  const releaseKey = () => send('Key released to the buyer (sealed).', async () => {
    const view = query.data!
    sameId(view.purchaseId)
    if (buyerKey === null || buyerKey.buyer !== view.buyer) throw new Error('Check the buyer key first.')
    const { release, signature } = buildKeyRelease({
      circle: CONTRACT_ID, licenseDoc: prepared!.documentHash, purchaseId: view.purchaseId, buyer: view.buyer, buyerPublicKey: buyerKey.publicKey, contentHash: prepared!.document.content_hash,
      prepared: prepared!, at: now(), sellerSecretKey: voucherKey,
    })
    await api.purchaseNotice(view.purchaseId, release, signature)
    setBuyerKey(null)
    // Batch 3 F5: the release is the last signature of a sale; the key leaves the page and is typed again for the next one.
    onVoucherKey('')
  })

  return (
    <section className="form" aria-label="Serve purchase">
      <h3>Serve a purchase (seller)</h3>
      {!prepared && <p className="state">Prepare the license above first: the file key and ciphertext live on this page, not on the server.</p>}
      <label><span>Purchase number</span><input value={id} onChange={(e) => setId(e.target.value)} /></label>
      <div><button type="button" disabled={id.trim() === ''} onClick={() => setOpen(id.trim())}>Open purchase</button></div>
      {open && (
        <QueryState query={query} loadingLabel="Loading purchase">
          {(view) => (
            <div data-testid="serve">
              <p>Status: <strong>{STATUS_LABEL[view.status] ?? view.status}</strong> · buyer <code>{view.buyer}</code>{view.exclusive && ' · exclusive'}</p>
              {view.status === 'paid_held' && prepared && (
                <>
                  <p>Post the ciphertext (<code>{prepared.cipherHash.slice(0, 12)}…</code>) at the source, then record its address.</p>
                  <label><span>Source type</span><select value={kind} onChange={(e) => setKind(e.target.value as 'https' | 'ipfs')}><option value="https">https</option><option value="ipfs">ipfs (CIDv1 raw)</option></select></label>
                  <label><span>Address or CID</span><input value={ref} onChange={(e) => setRef(e.target.value)} /></label>
                  <button type="button" disabled={busy || voucherKey.trim() === '' || ref.trim() === ''} onClick={() => void postCipher()}>Record ciphertext</button>
                </>
              )}
              {view.status === 'cipher_posted' && prepared && (
                <>
                  <button type="button" disabled={busy} onClick={() => void checkBuyer()}>Check the buyer key in the contract</button>
                  {buyerKey && (
                    <div data-testid="buyer-key">
                      <p>The file key will be sealed to the voucher key of <code>{buyerKey.buyer}</code> per the contract, fingerprint <code data-testid="buyer-fingerprint">{buyerKey.fingerprint}</code>. Match it against the fingerprint the buyer sent through another channel.</p>
                      <button type="button" disabled={busy || voucherKey.trim() === ''} onClick={() => void releaseKey()}>Release key to {buyerKey.buyer} (fingerprint {buyerKey.fingerprint})</button>
                    </div>
                  )}
                </>
              )}
              {view.status === 'confirmed' && <p className="state" role="status">Confirmed{view.autoConfirmed ? ' automatically' : ''}: the buyer voucher has been released to you to be registered.</p>}
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
      if (query.data.purchaseId !== open) throw new Error(`The server answered for purchase ${query.data.purchaseId}, not ${open} which you opened: not signed.`)
      const notice = purchaseNotice(CONTRACT_ID, query.data.purchaseId, account, action, now(), reason, proof)
      await api.purchaseNotice(query.data.purchaseId, notice, await signPurchaseNotice(notice, voucherKey))
      setMessage(action === 'confirmed' ? 'Confirmed: the voucher will be registered.' : 'Dispute sent with proof.')
      await client.invalidateQueries({ queryKey: ['purchase', open] })
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="form" aria-label="License purchase">
      <h3>Purchase (buyer)</h3>
      <BuyForm voucherKey={voucherKey} onBought={(pid) => { setId(pid); setOpen(pid) }} />
      <label><span>Purchase number</span><input value={id} onChange={(e) => setId(e.target.value)} /></label>
      <div><button type="button" disabled={id.trim() === ''} onClick={() => setOpen(id.trim())}>Open purchase</button></div>
      {open && (
        <QueryState query={query} loadingLabel="Loading purchase">
          {(view) => (
            <div data-testid="purchase">
              <p>Status: <strong>{STATUS_LABEL[view.status] ?? view.status}</strong></p>
              {view.disputeUntil && <p>Dispute window until {new Date(view.disputeUntil * 1000).toISOString()}; staying silent until then means automatic confirmation.</p>}
              {view.source && <p>Source: <code>{view.source.kind}</code> <code>{view.source.ref}</code></p>}
              {view.status === 'key_released' && (
                <>
                  {view.source && <p className="state" data-testid="download-host">The button below contacts <strong>{sourceHost(view.source)}</strong> from this browser; the owner of that address sees your IP and the time. Continue only if you know them.</p>}
                  <label><span>Seller public key (ed25519:…)</span><input value={sellerKey} onChange={(e) => setSellerKey(e.target.value)} /></label>
                  <button type="button" disabled={busy || voucherKey.trim() === '' || sellerKey.trim() === ''} onClick={() => void check()}>Download and check hash</button>
                  {progress !== null && <p data-testid="download-progress" role="status">Downloaded {progress} bytes</p>}
                </>
              )}
              {result?.state === 'ok' && (
                <div data-testid="license-ok">
                  <p className="state" role="status">The content matches content_hash. Confirm so the voucher is registered.</p>
                  <button type="button" onClick={() => download('license-content', result.content)}>Save file</button>
                  <button type="button" disabled={busy} onClick={() => void notify('confirmed', null, null)}>Confirm</button>
                </div>
              )}
              {result?.state === 'cheated' && (
                <div data-testid="license-cheated">
                  <p className="state state-error" role="alert">The content does not match ({result.reason}). Cheat proof is ready; a wrong file is not paid for.</p>
                  <button type="button" disabled={busy} onClick={() => void notify('disputed', 'content_mismatch', proofForApi(result.proof))}>Dispute with proof</button>
                </div>
              )}
              {result?.state === 'refused' && <p className="state state-error" role="alert" data-testid="license-refused">{result.reason}</p>}
              {result?.state === 'refused' && view.status === 'key_released' && (
                <button type="button" disabled={busy} onClick={() => void notify('disputed', 'other', null)}>Dispute (other reason)</button>
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
  // The voucher is signed only after the listing is checked (batch 3 F1): the hash typed, the signature of the seller against the key in the contract, and the payee and price shown.
  const [checked, setChecked] = useState<{ view: ListingView; docHash: string; fingerprint: string } | null>(null)

  async function check() {
    setBusy(true)
    setError(null)
    setChecked(null)
    try {
      const typed = hash.trim()
      const view = await api.listing(typed)
      let docHash: string | null = null
      try {
        const parsed: unknown = JSON.parse(view.detail)
        docHash = typeof parsed === 'object' && parsed !== null && typeof (parsed as { license_doc?: unknown }).license_doc === 'string' ? (parsed as { license_doc: string }).license_doc : null
      } catch {
        docHash = null
      }
      if (docHash === null) throw new Error('This listing is not a license listing (its detail does not contain license_doc).')
      const result = await checkListingToBuy(view, typed)
      if (!result.ok) throw new Error(result.reason)
      setChecked({ view, docHash, fingerprint: result.sellerFingerprint })
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
      const { view, docHash } = checked
      const epochs = await api.epochs()
      const open = epochs.items.find((e) => e.phase === 'open')
      if (!open) throw new Error('No open epoch: the voucher cannot be created yet.')
      const ob = await viewContract<{ cumulative: string; last_seq: number } | null>('obligation', { epoch: open.epoch, debtor: account, creditor: view.account })
      const built = await buildPurchase({
        circle: CONTRACT_ID, buyer: account, seller: view.account, epoch: open.epoch, amount: view.offer.value, state: { seq: ob?.last_seq ?? 0, cumulativeAmount: ob?.cumulative ?? '0' },
        licenseDocHash: docHash, secretKey: voucherKey,
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
      <label><span>License listing hash</span><input value={hash} onChange={(e) => { setHash(e.target.value); setChecked(null) }} placeholder="64 hex" /></label>
      <button type="button" disabled={!account || busy || !/^[0-9a-f]{64}$/.test(hash.trim())} onClick={() => void check()}>Check listing</button>
      {checked && (
        <div data-testid="buy-summary">
          <dl className="status-panel">
            <dt>Paid to</dt><dd><code>{checked.view.account}</code> · seller key fingerprint <code>{checked.fingerprint}</code></dd>
            <dt>Price</dt><dd>{formatCredit(checked.view.offer.value)} credit</dd>
            <dt>License document</dt><dd><code>{checked.docHash}</code></dd>
            <dt>Checks</dt><dd>hash matches the one typed; signature matches the seller key in the contract</dd>
          </dl>
          <button type="button" disabled={busy || voucherKey.trim() === ''} onClick={() => void buy()}>
            Buy for {formatCredit(checked.view.offer.value)} credit from {checked.view.account} (voucher held by the backend)
          </button>
        </div>
      )}
      <small>The voucher is not given to the seller: the backend registers it only after the content matches or on automatic confirmation.</small>
      {error && <p className="state state-error" role="alert">{error}</p>}
    </div>
  )
}

function Takedown({ voucherKey, onVoucherKey }: { voucherKey: string; onVoucherKey: (value: string) => void }) {
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
      setMessage('Takedown filed: the listing is hidden and unconfirmed purchases are cancelled. Funds already confirmed are not pulled back. The voucher key was removed from the page.')
      onVoucherKey('')
    } catch (e) {
      setError(describeMarketError(e))
    }
  }
  return (
    <form className="form" aria-label="Takedown" onSubmit={(e) => { e.preventDefault(); void send() }}>
      <h3>Takedown (rights holder)</h3>
      <label><span>Listing hash</span><input value={hash} onChange={(e) => setHash(e.target.value)} /></label>
      <label><span>Statement (you hold the rights and the listing infringes them)</span><textarea value={claim} onChange={(e) => setClaim(e.target.value)} rows={2} /></label>
      <label><span>Proof of ownership (text or link; only its hash is sent)</span><input value={evidence} onChange={(e) => setEvidence(e.target.value)} /></label>
      <div><button type="submit" disabled={!account || voucherKey.trim() === '' || !/^[0-9a-f]{64}$/.test(hash.trim()) || claim.trim() === ''}>Sign and file takedown</button></div>
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
      <h2>Content licenses</h2>
      <p className="state">x207 does not store files. What is sold is a license; the ciphertext sits at a source the seller chooses, and the key is released to the buyer after they pay (voucher held). The license price follows the value in the listing.</p>
      <Seller voucherKey={voucherKey} onVoucherKey={setVoucherKey} onPrepared={setPrepared} />
      <Serve voucherKey={voucherKey} onVoucherKey={setVoucherKey} prepared={prepared} />
      <Buyer voucherKey={voucherKey} />
      <Takedown voucherKey={voucherKey} onVoucherKey={setVoucherKey} />
    </>
  )
}
