import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { viewContract } from '../api/chain'
import { usePurchase } from '../api/queries'
import type { ListingView, PurchaseView } from '../api/types'
import { DealTrack } from '../components/DealTrack'
import { p7Position, p7Stops } from '../components/dealSteps'
import { NavIcon } from '../components/icons'
import { PAGE_HUE } from '../components/pageHue'
import { QueryState } from '../components/QueryState'
import { SignInPrompt } from '../components/SignInPrompt'
import { VoucherKeyField } from '../components/VoucherKeyField'
import { CONTRACT_ID } from '../config'
import { demoVoucherKey } from '../demo/mode'
import {
  LICENSE_ASSET_TYPES, buildKeyRelease, buildPurchase, cipherPostedNotice, prepareLicense, signSellerNotice, proofForApi, purchaseNotice, receiveLicense, signPurchaseNotice, sourceUrl, takedownMessage,
  type DownloadResult, type PreparedLicense,
} from '../lib/licenseFlow'
import { formatCredit } from '../lib/format'
import { checkListingToBuy, memberOnChain } from '../lib/listingCheck'
import { describeMarketError } from '../lib/marketError'
import { keyFingerprint, sha256Hex, signMessageWithVoucher } from '../lib/barter'
import { useWallet } from '../wallet/WalletContext'
import { FilePicker } from '../components/FilePicker'

// FE-028: content licenses (pipeline P7, ADR-46), from Backend API Spec 5g. The seller prepares a license from a local file (hash, encryption in the browser, listing detail); the buyer buys
// (voucher held by the backend), downloads the ciphertext with progress, checks the hash, and confirms or disputes with a cheating proof; the rights holder files a takedown.
// The file and key are never sent to the backend. Acknowledged limit: exclusive licenses are recorded per content_hash, and a seller who changes one byte is not detected automatically.
// Presentation: one role at a time (Buy, Sell, Deliver, Takedown) with the voucher key entered once for the page; hashes, listing detail and sources sit in "Technical details".
type Tone = 'ok' | 'warn' | 'bad' | 'info'
const STATUS_LABEL: Record<string, string> = {
  paid_held: 'Paid', cipher_posted: 'File posted', key_released: 'Key released', confirmed: 'Confirmed', disputed: 'Disputed', refuted: 'Dispute rejected', cancelled: 'Cancelled',
}
const STATUS_TONE: Record<string, Tone> = { paid_held: 'info', cipher_posted: 'info', key_released: 'warn', confirmed: 'ok', disputed: 'bad', refuted: 'warn', cancelled: 'bad' }
const BUYER_HINT: Record<string, string> = { paid_held: 'Waiting for the seller to post the file.', cipher_posted: 'Waiting for the seller to release the key.' }
// Cards in a view are spaced with a grid gap; the hidden panes stay display:none from the stylesheet.
// The layout header already carries the page h1, so each card title is an h2 (.card-title) sized like a card title.
const now = () => Math.floor(Date.now() / 1000)
const utc = (seconds: number) => `${new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`
const download = (name: string, bytes: Uint8Array): string => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  return url
}

const Pill = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className="pill" data-tone={tone}>{children}</span>

/** One purchase drawn as the path of the buyer's voucher (FE-084): buyer, the four steps of the exchange, seller; the status as a pill; one line of what comes next. */
function PurchaseCard({ view, children }: { view: PurchaseView; children?: ReactNode }) {
  const { account } = useWallet()
  return (
    <DealTrack
      tile={{ nav: '/licenses' }} hue={PAGE_HUE['/licenses']} title={`Purchase ${view.purchaseId}`}
      pill={{ tone: STATUS_TONE[view.status] ?? 'info', label: STATUS_LABEL[view.status] ?? view.status }}
      buyer={view.buyer} seller={view.seller} account={account} stops={p7Stops('File posted')} {...p7Position(view.status)}
    >
      {children && <p className="deal-note">{children}</p>}
    </DealTrack>
  )
}

function Seller({ onPrepared, onDeliver }: { onPrepared: (p: PreparedLicense) => void; onDeliver: () => void }) {
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
      <h2 className="card-title">Prepare a license</h2>
      <p className="state">The file is encrypted here and never leaves this browser.</p>
      <FilePicker label="File" file={file} onFile={setFile} hint="A dataset, a model, a document: any type, read only in this browser" />
      <div className="field-pair">
        <label>
          <span>Asset type</span>
          <select value={assetType} onChange={(e) => setAssetType(e.target.value)}>{LICENSE_ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        </label>
        <label><span>License type</span><input value={licenseId} onChange={(e) => setLicenseId(e.target.value)} placeholder="personal" /></label>
      </div>
      <label><span>License text</span><textarea value={licenseText} onChange={(e) => setLicenseText(e.target.value)} rows={3} placeholder="What the buyer may do with the file" /></label>
      <details className="tech">
        <summary>Add a preview</summary>
        <label><span>Preview (optional)</span><textarea value={preview} onChange={(e) => setPreview(e.target.value)} rows={2} /></label>
      </details>
      <div className="switches">
        <label className="check"><span>Exclusive (one buyer, bond required)</span><input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} /></label>
      </div>
      <div><button type="submit" disabled={!account || !file || licenseText.trim() === '' || busy}>{busy ? 'Preparing…' : 'Encrypt and prepare'}</button></div>
      {error && <p className="state state-error" role="alert">{error}</p>}
      {done && (
        <div data-testid="license-prepared" className="stack">
          <p className="state"><Pill tone="ok">Ready</Pill> Post the encrypted file anywhere, then serve each buyer.</p>
          <p className="state state-warn" data-testid="license-keep-page" role="note">The file key and the original file exist only on this page. Close the tab and buyers lose their key, and their held payment is cancelled.</p>
          <div className="actions">
            <button type="button" onClick={() => download('license.enc', done.ciphertext)}>Download encrypted file</button>
            <button type="button" className="quiet" onClick={onDeliver}>Serve a purchase</button>
          </div>
          <details className="tech">
            <summary>Technical details</summary>
            <dl className="status-panel kv">
              <dt>content_hash</dt><dd><code>{done.document.content_hash}</code></dd>
              <dt>cipher_hash</dt><dd><code>{done.cipherHash}</code></dd>
              <dt>Resource</dt><dd><code>{done.resource}</code></dd>
            </dl>
            <p>Listing detail (copy into the class D Listing detail field):</p>
            <pre data-testid="license-detail">{done.detail}</pre>
          </details>
          <details className="tech"><summary>File key (secret)</summary><code data-testid="license-key">{done.contentKey}</code></details>
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
  const postCipher = () => send('Location saved.', async () => {
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
  const releaseKey = () => send('Key released to the buyer.', async () => {
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
      <h2 className="card-title">Serve a purchase</h2>
      {!prepared && <p className="state state-warn">Prepare a license in Sell first. The file key lives on this page.</p>}
      <label><span>Purchase number</span><input value={id} onChange={(e) => setId(e.target.value)} /></label>
      <div><button type="button" disabled={id.trim() === ''} onClick={() => setOpen(id.trim())}>Open purchase</button></div>
      {open && (
        <QueryState query={query} loadingLabel="Loading purchase">
          {(view) => (
            <div data-testid="serve" className="stack">
              <PurchaseCard view={view}>{view.exclusive && 'Exclusive license.'}</PurchaseCard>
              {view.status === 'paid_held' && prepared && (
                <>
                  <p className="state">Post the encrypted file, then say where it is.</p>
                  <div className="field-pair">
                    <label><span>Source type</span><select value={kind} onChange={(e) => setKind(e.target.value as 'https' | 'ipfs')}><option value="https">https</option><option value="ipfs">ipfs (CIDv1 raw)</option></select></label>
                    <label><span>Address or CID</span><input value={ref} onChange={(e) => setRef(e.target.value)} /></label>
                  </div>
                  <div><button type="button" disabled={busy || voucherKey.trim() === '' || ref.trim() === ''} onClick={() => void postCipher()}>Save location</button></div>
                </>
              )}
              {view.status === 'cipher_posted' && prepared && (
                <>
                  <div><button type="button" disabled={busy} onClick={() => void checkBuyer()}>Check buyer key</button></div>
                  {buyerKey && (
                    <div data-testid="buyer-key" className="stack">
                      <dl className="figures"><div><dt>Buyer key fingerprint</dt><dd data-testid="buyer-fingerprint">{buyerKey.fingerprint}</dd></div></dl>
                      <p className="state">The key will be sealed to <code>{buyerKey.buyer}</code>. Match this fingerprint with the one the buyer sent you.</p>
                      <div><button type="button" disabled={busy || voucherKey.trim() === ''} onClick={() => void releaseKey()}>Release key to buyer</button></div>
                    </div>
                  )}
                </>
              )}
              {view.status === 'confirmed' && <p className="state" role="status">Confirmed{view.autoConfirmed ? ' automatically' : ''}. The buyer&apos;s voucher is yours to register.</p>}
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
  const [saved, setSaved] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [result, setResult] = useState<DownloadResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const query = usePurchase(open)

  async function check(file?: File) {
    if (!query.data) return
    setBusy(true)
    setError(null)
    setResult(null)
    setProgress(file ? null : 0)
    try {
      const bytes = file ? new Uint8Array(await file.arrayBuffer()) : undefined
      setResult(await receiveLicense(query.data, sellerKey.trim(), voucherKey, setProgress, bytes))
    } catch (e) {
      setResult({ state: 'refused', reason: e instanceof Error && file ? 'That file could not be read. Choose it again.' : describeMarketError(e) })
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
    <section aria-label="License purchase" className="stack">
      <BuyForm voucherKey={voucherKey} onBought={(pid) => { setId(pid); setOpen(pid) }} />
      <div className="form">
        <h2 className="card-title">Your purchase</h2>
        <label><span>Purchase number</span><input value={id} onChange={(e) => setId(e.target.value)} /></label>
        <div><button type="button" disabled={id.trim() === ''} onClick={() => setOpen(id.trim())}>Open purchase</button></div>
        {open && (
          <QueryState query={query} loadingLabel="Loading purchase">
            {(view) => (
              <div data-testid="purchase" className="stack">
                <PurchaseCard view={view}>
                  {[BUYER_HINT[view.status], view.disputeUntil ? `Dispute window ends ${utc(view.disputeUntil)}. No reply by then confirms automatically.` : null].filter(Boolean).join(' ')}
                </PurchaseCard>
                {view.status === 'key_released' && (
                  <>
                    {view.source && <p className="state" data-testid="download-host">Downloads from <strong>{sourceHost(view.source)}</strong>. Its owner sees your IP and the time; continue only if you trust it.</p>}
                    <label><span>Seller public key</span><input value={sellerKey} onChange={(e) => setSellerKey(e.target.value)} placeholder="ed25519:…" /></label>
                    <div><button type="button" disabled={busy || voucherKey.trim() === '' || sellerKey.trim() === ''} onClick={() => void check()}>Download and check hash</button></div>
                    {progress !== null && <p className="state" data-testid="download-progress" role="status">Downloaded {progress} bytes</p>}
                    {view.source && (
                      <div className="stack" data-testid="saved-file">
                        <FilePicker
                          label="Or check a file you saved"
                          file={saved}
                          onFile={setSaved}
                          hint="If the download is blocked, open the source, save the file, then choose it here. It is checked against cipher_hash like a download."
                        />
                        <div className="actions">
                          <button type="button" disabled={busy || saved === null || voucherKey.trim() === '' || sellerKey.trim() === ''} onClick={() => saved && void check(saved)}>Check saved file</button>
                          {sourceUrl(view.source) && <a href={sourceUrl(view.source) ?? undefined} target="_blank" rel="noopener noreferrer">Open the source</a>}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {result?.state === 'ok' && (
                  <div data-testid="license-ok" className="stack">
                    <p className="state" role="status"><Pill tone="ok">Matches</Pill> The content matches the listing. Confirm to release your payment.</p>
                    <div className="actions">
                      <button type="button" className="glow" disabled={busy} onClick={() => void notify('confirmed', null, null)}>Confirm</button>
                      <button type="button" className="quiet" onClick={() => download('license-content', result.content)}>Save file</button>
                    </div>
                  </div>
                )}
                {result?.state === 'cheated' && (
                  <div data-testid="license-cheated" className="stack">
                    <p className="state state-error" role="alert">Wrong content ({result.reason}). The proof is ready, so a wrong file is not paid for.</p>
                    <div><button type="button" disabled={busy} onClick={() => void notify('disputed', 'content_mismatch', proofForApi(result.proof))}>Dispute with proof</button></div>
                  </div>
                )}
                {result?.state === 'refused' && <p className="state state-error" role="alert" data-testid="license-refused">{result.reason}</p>}
                {result?.state === 'refused' && view.status === 'key_released' && (
                  <div><button type="button" className="quiet" disabled={busy} onClick={() => void notify('disputed', 'other', null)}>Dispute (other reason)</button></div>
                )}
                {view.source && (
                  <details className="tech">
                    <summary>Technical details</summary>
                    <dl className="status-panel kv">
                      <dt>Source</dt><dd><code>{view.source.kind}</code> <code>{view.source.ref}</code></dd>
                      {view.cipherHash && <><dt>cipher_hash</dt><dd><code>{view.cipherHash}</code></dd></>}
                    </dl>
                  </details>
                )}
              </div>
            )}
          </QueryState>
        )}
        {message && <p className="state" role="status">{message}</p>}
        {error && <p className="state state-error" role="alert">{error}</p>}
      </div>
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
    <div className="form">
      <h2 className="card-title">Buy a license</h2>
      <label><span>License listing hash</span><input value={hash} onChange={(e) => { setHash(e.target.value); setChecked(null) }} placeholder="64 hex" /></label>
      <div><button type="button" disabled={!account || busy || !/^[0-9a-f]{64}$/.test(hash.trim())} onClick={() => void check()}>Check listing</button></div>
      {checked && (
        <div data-testid="buy-summary" className="stack">
          <dl className="figures">
            <div><dt>Price</dt><dd>{formatCredit(checked.view.offer.value)} credit</dd></div>
            <div><dt>Seller signature</dt><dd>Verified</dd></div>
          </dl>
          <p className="state">You pay <code>{checked.view.account}</code>. Your payment is held until the file checks out.</p>
          <div><button type="button" className="glow" disabled={busy || voucherKey.trim() === ''} onClick={() => void buy()}>Buy for {formatCredit(checked.view.offer.value)} credit</button></div>
          <details className="tech">
            <summary>Technical details</summary>
            <dl className="status-panel kv">
              <dt>Seller key fingerprint</dt><dd><code>{checked.fingerprint}</code></dd>
              <dt>License document</dt><dd><code>{checked.docHash}</code></dd>
              <dt>Checks</dt><dd>hash matches the one typed; signature matches the seller key in the contract</dd>
            </dl>
            <p>The voucher is not given to the seller: the backend registers it only after the content matches or on automatic confirmation.</p>
          </details>
        </div>
      )}
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
      setMessage('Takedown filed. The listing is hidden and unconfirmed purchases are cancelled; confirmed payments stay. Your voucher key was cleared.')
      onVoucherKey('')
    } catch (e) {
      setError(describeMarketError(e))
    }
  }
  return (
    <form className="form" aria-label="Takedown" onSubmit={(e) => { e.preventDefault(); void send() }}>
      <h2 className="card-title">File a takedown</h2>
      <p className="state">Hide a listing that infringes your rights.</p>
      <label><span>Listing hash</span><input value={hash} onChange={(e) => setHash(e.target.value)} /></label>
      <label><span>Statement</span><textarea value={claim} onChange={(e) => setClaim(e.target.value)} rows={2} placeholder="I hold the rights and this listing infringes them" /></label>
      <label><span>Proof of ownership (only its hash is sent)</span><input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Text or link" /></label>
      <div><button type="submit" disabled={!account || voucherKey.trim() === '' || !/^[0-9a-f]{64}$/.test(hash.trim()) || claim.trim() === ''}>File takedown</button></div>
      {message && <p className="state" role="status">{message}</p>}
      {error && <p className="state state-error" role="alert">{error}</p>}
    </form>
  )
}

type View = 'buy' | 'sell' | 'deliver' | 'takedown'
const VIEWS: ReadonlyArray<readonly [View, string]> = [['buy', 'Buy'], ['sell', 'Sell'], ['deliver', 'Deliver'], ['takedown', 'Takedown']]

export function Licenses() {
  const { account } = useWallet()
  const [voucherKey, setVoucherKey] = useState(demoVoucherKey)
  const [prepared, setPrepared] = useState<PreparedLicense | null>(null)
  const [view, setView] = useState<View>('buy')
  return (
    <div className="mk" data-mk="licenses">
      <div className="page-lead">
        <span className="tone-tile" aria-hidden="true" style={{ ['--tone' as string]: PAGE_HUE['/licenses'] }}>
          <NavIcon name="/licenses" size={22} />
        </span>
        <p>Sell or buy a license for a file. The file never touches our servers.</p>
        <ol className="lead-steps" aria-label="How it works">
          <li>Seller prepares</li>
          <li>Buyer pays</li>
          <li>Key released</li>
          <li>Buyer confirms</li>
        </ol>
      </div>
      {!account && <SignInPrompt action="buy or sell licenses" />}
      <div className="views" data-view={view}>
        <div className="view-tabs">
          <div className="segmented views-toggle" role="group" aria-label="License view">
            {VIEWS.map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
          </div>
        </div>
        <div className="form key-strip">
          <VoucherKeyField value={voucherKey} onChange={setVoucherKey} disabled={!account} />
        </div>
        <section className="views-pane" data-pane="buy" data-active={view === 'buy'} aria-label="Buy a license">
          <Buyer voucherKey={voucherKey} />
        </section>
        <section className="views-pane" data-pane="sell" data-active={view === 'sell'} aria-label="Sell a license">
          <Seller onPrepared={setPrepared} onDeliver={() => setView('deliver')} />
        </section>
        <section className="views-pane" data-pane="deliver" data-active={view === 'deliver'} aria-label="Deliver a sale">
          <Serve voucherKey={voucherKey} onVoucherKey={setVoucherKey} prepared={prepared} />
        </section>
        <section className="views-pane" data-pane="takedown" data-active={view === 'takedown'} aria-label="File a takedown">
          <Takedown voucherKey={voucherKey} onVoucherKey={setVoucherKey} />
        </section>
      </div>
    </div>
  )
}
