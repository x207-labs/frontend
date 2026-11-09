import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { viewContract } from '../api/chain'
import { usePurchase } from '../api/queries'
import type { ListingView } from '../api/types'
import { NavIcon } from '../components/icons'
import { QueryState } from '../components/QueryState'
import { SignInPrompt } from '../components/SignInPrompt'
import { VoucherKeyField } from '../components/VoucherKeyField'
import { CONTRACT_ID } from '../config'
import { keyFingerprint } from '../lib/barter'
import {
  UNVERIFIABLE_CODE_LIMIT, VERIFIABLE_CODE_LIMIT, buildCodeKeyRelease, buildCodePurchase, codeCheckNotice, codeDocumentOfListing, codeOverLimit, disputeSecondsLeft, pairStateWithHeld, parseCodeListing, prepareCode, receiveCode, recallHeld, rememberHeld,
  type CodeListing, type CodeReceive, type HeldVoucher, type PreparedCode,
} from '../lib/codeFlow'
import { formatCredit } from '../lib/format'
import { toAtomic } from '../lib/amount'
import { cipherPostedNotice, proofForApi, purchaseNotice, signPurchaseNotice, signSellerNotice } from '../lib/licenseFlow'
import { checkListingToBuy, memberOnChain } from '../lib/listingCheck'
import { describeMarketError } from '../lib/marketError'
import { useWallet } from '../wallet/WalletContext'

// FE-032: single-use exchange codes (pipeline P3, ADR-48). Codes are sold via the P7 fair exchange (SD-076, SD-070): the code is encrypted, the key is released to the buyer after they pay (voucher
// held), and a wrong code is proven with a cheating proof. The code does not appear in the listing and is only revealed in the buyer's browser after they request it. A dispute opens one hour
// after the key is released; silence until then means automatic confirmation. Codes whose issuer has no check API are capped at 20 credit.
// Presentation: one role at a time (Buy, Sell, Deliver) with the voucher key entered once for the page; commitments, hashes and listing detail sit in "Technical details".
type Tone = 'ok' | 'warn' | 'bad' | 'info'
const STATUS_LABEL: Record<string, string> = {
  paid_held: 'Paid', cipher_posted: 'Code posted', key_released: 'Key released', confirmed: 'Confirmed', disputed: 'Disputed', refuted: 'Dispute rejected', cancelled: 'Cancelled',
}
const STATUS_TONE: Record<string, Tone> = { paid_held: 'info', cipher_posted: 'info', key_released: 'warn', confirmed: 'ok', disputed: 'bad', refuted: 'warn', cancelled: 'bad' }
const BUYER_HINT: Record<string, string> = { paid_held: 'Waiting for the seller to post the code.', cipher_posted: 'Waiting for the seller to release the key.' }
// Cards in a view are spaced with a grid gap; the hidden panes stay display:none from the stylesheet.
// The layout header already carries the page h1, so each card title is an h2 (.card-title) sized like a card title.
const now = () => Math.floor(Date.now() / 1000)
const minutes = (seconds: number): string => `${Math.floor(seconds / 60)} min ${seconds % 60} s`

const Pill = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className="pill" data-tone={tone}>{children}</span>
const Tile = () => (
  <span className="tone-tile" aria-hidden="true" style={{ ['--tone' as string]: '#e2801f' }}>
    <NavIcon name="/codes" size={18} />
  </span>
)

/** One purchase as a card: its number, its status as a pill, and one line of what comes next. */
function PurchaseCard({ id, status, children }: { id: string; status: string; children?: ReactNode }) {
  return (
    <ul className="item-cards">
      <li className="item-card">
        <Tile />
        <p className="item-title">Purchase {id}</p>
        <Pill tone={STATUS_TONE[status] ?? 'info'}>{STATUS_LABEL[status] ?? status}</Pill>
        {children && <p className="item-meta">{children}</p>}
      </li>
    </ul>
  )
}

function Seller({ onPrepared, onDeliver }: { onPrepared: (p: PreparedCode) => void; onDeliver: () => void }) {
  const { account } = useWallet()
  const [code, setCode] = useState('')
  const [issuer, setIssuer] = useState('none')
  const [verifiable, setVerifiable] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<PreparedCode | null>(null)
  const atomic = toAtomic(value)
  const overCap = atomic !== null && codeOverLimit({ value: atomic, verifiable })
  const cap = verifiable ? VERIFIABLE_CODE_LIMIT : UNVERIFIABLE_CODE_LIMIT

  function prepare() {
    if (!account || atomic === null) return
    setError(null)
    try {
      const prepared = prepareCode({ circle: CONTRACT_ID, seller: account, code, issuer, verifiable, value: atomic, nonce: crypto.randomUUID().replaceAll('-', '').slice(0, 24) })
      setDone(prepared)
      onPrepared(prepared)
    } catch (e) {
      setDone(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <form className="form" aria-label="Prepare code" onSubmit={(e) => { e.preventDefault(); prepare() }}>
      <h2 className="card-title">Prepare a code</h2>
      <label><span>Code</span><input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" placeholder="At least 8 characters" /></label>
      <p className="state">A checkable code is sent once to the backend during the issuer check. Otherwise it stays in this browser.</p>
      <div className="field-pair">
        <label><span>Issuer</span><input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="Service name, or none" /></label>
        <label><span>Value (credit)</span><input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="5" /></label>
      </div>
      <div className="switches">
        <label className="check"><span>The issuer has a check API</span><input type="checkbox" checked={verifiable} onChange={(e) => setVerifiable(e.target.checked)} /></label>
      </div>
      {overCap && <p className="state state-warn" role="note">A code that {verifiable ? 'can' : 'cannot'} be checked is limited to {formatCredit(cap)} credit.{verifiable ? '' : ` For more, use an issuer with a check API (limit ${formatCredit(VERIFIABLE_CODE_LIMIT)} credit).`}</p>}
      <div><button type="submit" disabled={!account || code.trim() === '' || atomic === null || overCap}>Encrypt and prepare</button></div>
      {error && <p className="state state-error" role="alert">{error}</p>}
      {done && (
        <div data-testid="code-prepared" className="stack">
          <p className="state"><Pill tone="ok">Ready</Pill> Post the encrypted code anywhere, then serve each buyer.</p>
          <p className="state state-warn" data-testid="code-keep-page" role="note">The code, salt, and key exist only on this page. Close the tab and buyers lose their key, and their held payment is cancelled.</p>
          <div><button type="button" className="quiet" onClick={onDeliver}>Serve a purchase</button></div>
          <details className="tech">
            <summary>Technical details</summary>
            <dl className="status-panel">
              <dt>code_commitment</dt><dd><code>{done.document.code_commitment}</code></dd>
              <dt>cipher_hash</dt><dd><code>{done.cipherHash}</code></dd>
              <dt>Resource</dt><dd><code>{done.resource}</code></dd>
            </dl>
            <p>The listing holds only a commitment with a random salt, so even a short code cannot be guessed from it.</p>
            <p>Sell each code once. A repeat sale is not detected by hash; it is caught through the issuer check, disputes, and reputation.</p>
            <p>Listing detail (copy into the class D Listing detail field):</p>
            <pre data-testid="code-detail">{done.detail}</pre>
          </details>
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
    if (answered !== open) throw new Error(`The server answered for purchase ${answered}, not ${open} which you opened: not signed.`)
  }
  const postCipher = () => send('Location saved.', async () => {
    sameId(query.data!.purchaseId)
    const notice = cipherPostedNotice(CONTRACT_ID, query.data!.purchaseId, account!, now(), { kind, ref: ref.trim() }, prepared!.cipherHash)
    await api.purchaseNotice(query.data!.purchaseId, notice, await signSellerNotice(notice, CONTRACT_ID, voucherKey))
  })
  const checkWithIssuer = () => send('Issuer checked.', async () => {
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
      if (member === null || member.status !== 'active') throw new Error(`${view.buyer} is not an active member in the contract: key not released.`)
      setBuyerKey({ buyer: view.buyer, publicKey: member.pubkey_voucher, fingerprint: await keyFingerprint(member.pubkey_voucher) })
    } catch (e) {
      setError(describeMarketError(e))
    }
  }
  const releaseKey = () => send('Key released to the buyer. The one-hour dispute window starts.', async () => {
    const view = query.data!
    sameId(view.purchaseId)
    if (buyerKey === null || buyerKey.buyer !== view.buyer) throw new Error('Check the buyer key first.')
    const { release, signature } = buildCodeKeyRelease({ prepared: prepared!, purchaseId: view.purchaseId, buyer: view.buyer, buyerPublicKey: buyerKey.publicKey, at: now(), sellerSecretKey: voucherKey })
    await api.purchaseNotice(view.purchaseId, release, signature)
    setBuyerKey(null)
    onVoucherKey('')
  })

  return (
    <section className="form" aria-label="Serve code purchase">
      <h2 className="card-title">Serve a purchase</h2>
      {!prepared && <p className="state state-warn">Prepare a code in Sell first. The code and key live on this page.</p>}
      <label><span>Purchase number</span><input value={id} onChange={(e) => setId(e.target.value)} /></label>
      <div><button type="button" disabled={id.trim() === ''} onClick={() => setOpen(id.trim())}>Open purchase</button></div>
      {open && (
        <QueryState query={query} loadingLabel="Loading purchase">
          {(view) => (
            <div data-testid="serve" className="stack">
              <PurchaseCard id={view.purchaseId} status={view.status}>
                Buyer <code>{view.buyer}</code>
              </PurchaseCard>
              {view.status === 'paid_held' && prepared && (
                <>
                  <p className="state">Post the encrypted code, then say where it is.</p>
                  <div className="field-pair">
                    <label><span>Source type</span><select value={kind} onChange={(e) => setKind(e.target.value as 'https' | 'ipfs')}><option value="https">https</option><option value="ipfs">ipfs (CIDv1 raw)</option></select></label>
                    <label><span>Address or CID</span><input value={ref} onChange={(e) => setRef(e.target.value)} /></label>
                  </div>
                  <div><button type="button" disabled={busy || voucherKey.trim() === '' || ref.trim() === ''} onClick={() => void postCipher()}>Save location</button></div>
                </>
              )}
              {view.status === 'cipher_posted' && prepared && prepared.document.verifiable && (
                <div data-testid="issuer-check" className="stack">
                  <p className="state state-warn" role="note" data-testid="check-disclosure">
                    During the check, the backend sees the code and salt once. It forwards them to the issuer <code>{prepared.document.issuer}</code>; they are not stored.
                    If you do not trust this backend, do not sell a checkable code here.
                  </p>
                  <div><button type="button" disabled={busy || voucherKey.trim() === ''} onClick={() => void checkWithIssuer()}>Send code for issuer check</button></div>
                  {verdict && verdict.listingHash === view.listingHash && (
                    <p className="state" role={verdict.verdict === 'valid' ? 'status' : 'alert'} data-testid="issuer-verdict">
                      <Pill tone={verdict.verdict === 'valid' ? 'ok' : 'bad'}>{verdict.verdict === 'valid' ? 'Valid' : verdict.verdict === 'used' ? 'Used' : 'Unknown'}</Pill>
                      {verdict.verdict === 'valid' && 'The issuer says the code is valid. Release the key within 10 minutes.'}
                      {verdict.verdict === 'used' && 'The issuer says the code is already used. The purchase and listing are cancelled, the key is not released, and the buyer voucher does not move.'}
                      {verdict.verdict === 'unknown' && 'The issuer does not recognize this code: key not released.'}
                    </p>
                  )}
                  <details className="tech">
                    <summary>More about the check</summary>
                    <p>The backend stores only the verdict and its time. A dishonest backend could redeem the code first.</p>
                    <p>The verdict is valid for 10 minutes; the key is not released without a still-valid valid verdict.</p>
                  </details>
                </div>
              )}
              {view.status === 'cipher_posted' && prepared && !prepared.document.verifiable && (
                <p className="state state-warn" role="note" data-testid="no-check-note">This code cannot be checked: the backend does not see the code, and nothing confirms it is unused. The buyer relies on the one-hour dispute and the value limit.</p>
              )}
              {view.status === 'cipher_posted' && prepared && (
                <>
                  <div><button type="button" disabled={busy} onClick={() => void checkBuyer()}>Check buyer key</button></div>
                  {buyerKey && (
                    <div data-testid="buyer-key" className="stack">
                      <dl className="figures"><div><dt>Buyer key fingerprint</dt><dd data-testid="buyer-fingerprint">{buyerKey.fingerprint}</dd></div></dl>
                      <p className="state">The key will be sealed to <code>{buyerKey.buyer}</code>, read from the contract.</p>
                      <div><button type="button" disabled={busy || voucherKey.trim() === '' || (prepared.document.verifiable && !(verdict !== null && verdict.listingHash === view.listingHash && verdict.verdict === 'valid' && (verdict.validUntilMs === null || verdict.validUntilMs > Date.now())))} onClick={() => void releaseKey()}>Release key to buyer</button></div>
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

function Warnings({ listing }: { listing: CodeListing }) {
  return (
    <>
      {!listing.verifiable && (
        <p className="state state-warn" role="note" data-testid="unverifiable-warning">
          This code cannot be checked: nothing confirms it is unused before you pay. You can dispute wrong content for one hour after the key arrives. A used code can only be reported, and payment still goes through.
        </p>
      )}
      {listing.overLimit && (
        <p className="state state-error" role="alert" data-testid="over-limit">Value {formatCredit(listing.value)} credit is above the {formatCredit(listing.verifiable ? VERIFIABLE_CODE_LIMIT : UNVERIFIABLE_CODE_LIMIT)} limit for a code that {listing.verifiable ? 'can' : 'cannot'} be checked. Do not buy.</p>
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
      if (listing === null) throw new Error('This listing is not a code listing (its detail does not contain kind code and code_doc).')
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
      if (!open) throw new Error('No open epoch: the voucher cannot be created yet.')
      const ob = await viewContract<{ cumulative: string; last_seq: number } | null>('obligation', { epoch: open.epoch, debtor: account, creditor: view.account })
      // vouchers of earlier purchases from this seller that the seller has not registered: the backend counts them, so the next voucher continues from the highest (B7-C3)
      const live: HeldVoucher[] = []
      for (const h of recallHeld(view.account, open.epoch)) {
        try {
          if ((await api.purchase(h.purchaseId)).status !== 'cancelled') live.push(h)
        } catch {
          live.push(h) // a purchase that cannot be read is kept: a too-high voucher is refused by the backend, a too-low one is refused too
        }
      }
      const built = await buildCodePurchase({
        circle: CONTRACT_ID, buyer: account, seller: view.account, epoch: open.epoch, amount: view.offer.value,
        state: pairStateWithHeld({ seq: ob?.last_seq ?? 0, cumulativeAmount: ob?.cumulative ?? '0' }, live),
        codeDocHash: listing.docHash, secretKey: voucherKey,
      })
      const created = await api.createPurchase(hash.trim(), built.voucher, built.signature)
      const purchaseId = String(created.purchase_id ?? created.purchaseId ?? '')
      rememberHeld({ purchaseId, payee: view.account, epoch: open.epoch, seq: built.voucher.seq, cumulativeAmount: built.voucher.cumulativeAmount })
      setChecked(null)
      onBought(purchaseId)
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="form">
      <h2 className="card-title">Buy a code</h2>
      <label><span>Code listing hash</span><input value={hash} onChange={(e) => { setHash(e.target.value); setChecked(null) }} placeholder="64 hex" /></label>
      <div><button type="button" disabled={!account || busy || !/^[0-9a-f]{64}$/.test(hash.trim())} onClick={() => void check()}>Check listing</button></div>
      {checked && (
        <div data-testid="code-summary" className="stack">
          <dl className="figures">
            <div><dt>Code value</dt><dd>{formatCredit(checked.listing.value)} credit</dd></div>
            <div><dt>You pay</dt><dd>{formatCredit(checked.view.offer.value)} credit</dd></div>
          </dl>
          <p className="state" data-testid="code-hidden"><Pill tone="info">Hidden</Pill> Code hidden until purchased.</p>
          <p className="state">Issuer <code>{checked.listing.issuer}</code> <Pill tone={checked.listing.verifiable ? 'ok' : 'warn'}>{checked.listing.verifiable ? 'checkable' : 'not checkable'}</Pill></p>
          <p className="state">You pay <code>{checked.view.account}</code>. Your payment is held until the code checks out.</p>
          <Warnings listing={checked.listing} />
          <div><button type="button" disabled={busy || voucherKey.trim() === '' || checked.listing.overLimit} onClick={() => void buy()}>Buy for {formatCredit(checked.view.offer.value)} credit</button></div>
          <details className="tech">
            <summary>Technical details</summary>
            <dl className="status-panel">
              <dt>code_commitment</dt><dd><code>{checked.listing.codeCommitment}</code></dd>
              <dt>Seller key fingerprint</dt><dd><code>{checked.fingerprint}</code></dd>
            </dl>
            <p>The voucher is not given to the seller: the backend registers it only after the code matches or on automatic confirmation.</p>
            <p>A seller who sells the same code twice is not detected by hash: protect yourself with the one-hour dispute.</p>
          </details>
        </div>
      )}
      {error && <p className="state state-error" role="alert">{error}</p>}
    </div>
  )
}

function Buyer({ voucherKey }: { voucherKey: string }) {
  const { account } = useWallet()
  const client = useQueryClient()
  const [id, setId] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [result, setResult] = useState<CodeReceive | null>(null)
  const [shown, setShown] = useState(false)
  const [sellerFingerprint, setSellerFingerprint] = useState<string | null>(null)
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
      // the key of the seller is read from the contract, never typed and never taken from the read API: a wrong key would make a right delivery look wrong
      const member = await memberOnChain(query.data.seller)
      if (member === null || member.status !== 'active') {
        setResult({ state: 'refused', reason: `${query.data.seller} is not an active member in the contract: the seller public key cannot be read, code not checked.` })
        return
      }
      setSellerFingerprint(await keyFingerprint(member.pubkey_voucher))
      // the code document of the listing that the buyer bought from, rebuilt from the signed listing: the release must be for it (B6-F4)
      const listingView = await api.listing(query.data.listingHash)
      const parsed = parseCodeListing(listingView)
      if (parsed === null) {
        setResult({ state: 'refused', reason: 'The listing of this purchase is not a code listing.' })
        return
      }
      setResult(await receiveCode(query.data, member.pubkey_voucher, voucherKey, () => undefined, codeDocumentOfListing(CONTRACT_ID, listingView, parsed)))
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
      const answer = (await api.purchaseNotice(query.data.purchaseId, notice, await signPurchaseNotice(notice, voucherKey))) as { notDelivered?: boolean } | undefined
      if (answer?.notDelivered === true) {
        setMessage('The backend could not fetch the ciphertext that the seller signed. The sale is disputed, the voucher stays held, and the seller is not paid.')
        await client.invalidateQueries({ queryKey: ['purchase', open] })
        return
      }
      setMessage(action === 'confirmed' ? 'Confirmed: the voucher will be registered.' : proof === null ? 'Complaint recorded. This does not stop payment: the purchase still confirms automatically when the one-hour window ends.' : 'Dispute sent with proof.')
      await client.invalidateQueries({ queryKey: ['purchase', open] })
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Code purchase" className="stack">
      <BuyForm voucherKey={voucherKey} onBought={(pid) => { setId(pid); setOpen(pid) }} />
      <div className="form">
        <h2 className="card-title">Your purchase</h2>
        <label><span>Purchase number</span><input value={id} onChange={(e) => setId(e.target.value)} /></label>
        <div><button type="button" disabled={id.trim() === ''} onClick={() => setOpen(id.trim())}>Open purchase</button></div>
        {open && (
          <QueryState query={query} loadingLabel="Loading purchase">
            {(view) => {
              const left = disputeSecondsLeft(view.disputeUntil, tick)
              const canDispute = view.status === 'key_released' && (left === null || left > 0)
              return (
                <div data-testid="purchase" className="stack">
                  <PurchaseCard id={view.purchaseId} status={view.status}>{BUYER_HINT[view.status]}</PurchaseCard>
                  {left !== null && view.status === 'key_released' && (
                    <p className="state" data-testid="dispute-window" role="status">
                      {left > 0 ? `Disputes open for ${minutes(left)}. No reply by then confirms automatically.` : 'The dispute window has passed: the purchase is confirmed automatically.'}
                    </p>
                  )}
                  {view.status === 'key_released' && (
                    <>
                      <p className="state" data-testid="seller-key-note">The seller key is read from the contract, not typed.</p>
                      <div><button type="button" disabled={busy || voucherKey.trim() === ''} onClick={() => void receive()}>Download and check code</button></div>
                      {sellerFingerprint && <dl className="figures"><div><dt>Seller key fingerprint</dt><dd data-testid="seller-fingerprint">{sellerFingerprint}</dd></div></dl>}
                    </>
                  )}
                  {result?.state === 'ok' && (
                    <div data-testid="code-ok" className="stack">
                      <p className="state" role="status"><Pill tone="ok">Matches</Pill> The code matches the listing. Confirm to release your payment, or do nothing and it confirms when the window ends.</p>
                      {shown && <dl className="figures"><div><dt>Your code</dt><dd><code data-testid="code-value" style={{ fontSize: '1em' }}>{result.code}</code></dd></div></dl>}
                      <div className="actions">
                        <button type="button" disabled={busy} onClick={() => void notify('confirmed', null, null)}>Confirm</button>
                        {!shown && <button type="button" className="quiet" onClick={() => setShown(true)}>Show code</button>}
                      </div>
                    </div>
                  )}
                  {result?.state === 'cheated' && (
                    <div data-testid="code-cheated" className="stack">
                      <p className="state state-error" role="alert">Wrong code ({result.reason}). The proof is ready, so a wrong code is not paid for.</p>
                      <div><button type="button" disabled={busy || !canDispute} onClick={() => void notify('disputed', 'content_mismatch', proofForApi(result.proof))}>Dispute with proof</button></div>
                    </div>
                  )}
                  {result?.state === 'refused' && <p className="state state-error" role="alert" data-testid="code-refused">{result.reason}</p>}
                  {view.status === 'key_released' && (
                    <div><button type="button" className="quiet" disabled={busy || !canDispute} onClick={() => void notify('disputed', 'other', null)}>Report to reputation (does not stop payment)</button></div>
                  )}
                  {view.source && (
                    <details className="tech">
                      <summary>Technical details</summary>
                      <dl className="status-panel">
                        <dt>Source</dt><dd><code>{view.source.kind}</code> <code>{view.source.ref}</code></dd>
                      </dl>
                    </details>
                  )}
                </div>
              )
            }}
          </QueryState>
        )}
        {message && <p className="state" role="status">{message}</p>}
        {error && <p className="state state-error" role="alert">{error}</p>}
      </div>
    </section>
  )
}

type View = 'buy' | 'sell' | 'deliver'
const VIEWS: ReadonlyArray<readonly [View, string]> = [['buy', 'Buy'], ['sell', 'Sell'], ['deliver', 'Deliver']]

export function Codes() {
  const { account } = useWallet()
  const [voucherKey, setVoucherKey] = useState('')
  const [prepared, setPrepared] = useState<PreparedCode | null>(null)
  const [view, setView] = useState<View>('buy')
  return (
    <>
      <div className="page-lead">
        <span className="tone-tile" aria-hidden="true" style={{ ['--tone' as string]: '#e2801f' }}>
          <NavIcon name="/codes" size={22} />
        </span>
        <p>Buy or sell a single-use code. It stays hidden until you pay.</p>
        <ol className="lead-steps" aria-label="How it works">
          <li>Seller prepares</li>
          <li>Buyer pays</li>
          <li>Key released</li>
          <li>Buyer checks</li>
        </ol>
      </div>
      {!account && <SignInPrompt action="buy or sell codes" />}
      <div className="views" data-view={view}>
        <div className="segmented views-toggle" role="group" aria-label="Code view">
          {VIEWS.map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
        </div>
        <div className="form" style={{ marginBottom: '1rem' }}>
          <VoucherKeyField value={voucherKey} onChange={setVoucherKey} disabled={!account} />
        </div>
        <section className="views-pane" data-pane="buy" data-active={view === 'buy'} aria-label="Buy a code">
          <Buyer voucherKey={voucherKey} />
        </section>
        <section className="views-pane" data-pane="sell" data-active={view === 'sell'} aria-label="Sell a code">
          <Seller onPrepared={setPrepared} onDeliver={() => setView('deliver')} />
        </section>
        <section className="views-pane" data-pane="deliver" data-active={view === 'deliver'} aria-label="Deliver a sale">
          <Serve voucherKey={voucherKey} onVoucherKey={setVoucherKey} prepared={prepared} />
        </section>
      </div>
    </>
  )
}
