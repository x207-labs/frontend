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
  CODE_DISPUTE_WINDOW_SECONDS, UNVERIFIABLE_CODE_LIMIT, VERIFIABLE_CODE_LIMIT, buildCodeKeyRelease, buildCodePurchase, codeCheckNotice, codeDocumentOfListing, codeOverLimit, disputeSecondsLeft, pairStateWithHeld, parseCodeListing, prepareCode, receiveCode, recallHeld, rememberHeld,
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
const STATUS_LABEL: Record<string, string> = {
  paid_held: 'Paid, voucher held', cipher_posted: 'Ciphertext posted', key_released: 'Key released', confirmed: 'Confirmed', disputed: 'Disputed', refuted: 'Dispute rejected', cancelled: 'Cancelled',
}
const now = () => Math.floor(Date.now() / 1000)
const minutes = (seconds: number): string => `${Math.floor(seconds / 60)} min ${seconds % 60} s`

function Seller({ voucherKey, onVoucherKey, onPrepared }: { voucherKey: string; onVoucherKey: (v: string) => void; onPrepared: (p: PreparedCode) => void }) {
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
      <h3>Sell a code (seller)</h3>
      {!account && <p className="state">Sign in with your wallet to prepare a code.</p>}
      <label><span>Code (the listing holds only a salted commitment; a checkable code is sent once to the backend during the issuer check, an uncheckable code is sent nowhere)</span><input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" /></label>
      <small>The code must be at least 8 characters. The listing holds only a commitment with a random salt, so even a short code cannot be guessed from the listing.</small>
      <label><span>Issuer (service name, or none)</span><input value={issuer} onChange={(e) => setIssuer(e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={verifiable} onChange={(e) => setVerifiable(e.target.checked)} /><span>The issuer has a check API (the code is checked before the key is released)</span></label>
      <label><span>Value (credit)</span><input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="5" /></label>
      {overCap && <p className="state state-warn" role="note">A code that {verifiable ? 'can' : 'cannot'} be checked is limited to {formatCredit(cap)} credit. No bond raises the limit{verifiable ? '' : '; above it, use an issuer that has a check API (limit ' + formatCredit(VERIFIABLE_CODE_LIMIT) + ' credit)'}.</p>}
      <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />
      <div><button type="submit" disabled={!account || code.trim() === '' || atomic === null || overCap}>Hash and encrypt code</button></div>
      {error && <p className="state state-error" role="alert">{error}</p>}
      {done && (
        <div data-testid="code-prepared">
          <dl className="status-panel">
            <dt>code_commitment</dt><dd><code>{done.document.code_commitment}</code></dd>
            <dt>cipher_hash</dt><dd><code>{done.cipherHash}</code></dd>
            <dt>Resource</dt><dd><code>{done.resource}</code></dd>
          </dl>
          <p className="state state-warn" data-testid="code-keep-page" role="note">The code, salt, and key exist only on this page. Closing or reloading the tab loses them: you cannot release the key to the buyer, and the held voucher is cancelled. A code may be sold only once; duplicate listings of the same code are not detected by hash, so a seller who sells it twice is caught through the issuer check, disputes, and reputation.</p>
          <p>Listing detail (copy into the class D Listing detail field):</p>
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
    if (answered !== open) throw new Error(`The server answered for purchase ${answered}, not ${open} which you opened: not signed.`)
  }
  const postCipher = () => send('Ciphertext recorded.', async () => {
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
  const releaseKey = () => send('Key released to the buyer (sealed). The one-hour dispute window starts.', async () => {
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
      <h3>Serve a purchase (seller)</h3>
      {!prepared && <p className="state">Prepare the code above first: the code, key, and ciphertext live on this page, not on the server.</p>}
      <label><span>Purchase number</span><input value={id} onChange={(e) => setId(e.target.value)} /></label>
      <div><button type="button" disabled={id.trim() === ''} onClick={() => setOpen(id.trim())}>Open purchase</button></div>
      {open && (
        <QueryState query={query} loadingLabel="Loading purchase">
          {(view) => (
            <div data-testid="serve">
              <p>Status: <strong>{STATUS_LABEL[view.status] ?? view.status}</strong> · buyer <code>{view.buyer}</code></p>
              {view.status === 'paid_held' && prepared && (
                <>
                  <p>Post the ciphertext (<code>{prepared.cipherHash.slice(0, 12)}…</code>) at the source, then record its address.</p>
                  <label><span>Source type</span><select value={kind} onChange={(e) => setKind(e.target.value as 'https' | 'ipfs')}><option value="https">https</option><option value="ipfs">ipfs (CIDv1 raw)</option></select></label>
                  <label><span>Address or CID</span><input value={ref} onChange={(e) => setRef(e.target.value)} /></label>
                  <button type="button" disabled={busy || voucherKey.trim() === '' || ref.trim() === ''} onClick={() => void postCipher()}>Record ciphertext</button>
                </>
              )}
              {view.status === 'cipher_posted' && prepared && prepared.document.verifiable && (
                <div data-testid="issuer-check">
                  <p className="state state-warn" role="note" data-testid="check-disclosure">
                    For a checkable code, the backend sees the code and salt once during the check: both are sent to the backend, forwarded to the issuer <code>{prepared.document.issuer}</code>, and not stored.
                    The backend stores only the verdict and its time. A dishonest backend could redeem the code first; if you do not trust this backend, do not sell a checkable code here.
                    The verdict is valid for 10 minutes; the key is not released without a still-valid <em>valid</em> verdict.
                  </p>
                  <button type="button" disabled={busy || voucherKey.trim() === ''} onClick={() => void checkWithIssuer()}>Show the code to the backend for the issuer check</button>
                  {verdict && verdict.listingHash === view.listingHash && (
                    <p className={verdict.verdict === 'valid' ? 'state' : 'state state-error'} role={verdict.verdict === 'valid' ? 'status' : 'alert'} data-testid="issuer-verdict">
                      {verdict.verdict === 'valid' && 'The issuer says the code is valid. The key may be released within 10 minutes.'}
                      {verdict.verdict === 'used' && 'The issuer says the code is already used: the purchase and listing are cancelled, the key is not released, the buyer voucher does not move.'}
                      {verdict.verdict === 'unknown' && 'The issuer does not recognize this code: key not released.'}
                    </p>
                  )}
                </div>
              )}
              {view.status === 'cipher_posted' && prepared && !prepared.document.verifiable && (
                <p className="state state-warn" role="note" data-testid="no-check-note">This code cannot be checked: the backend does not see the code, and nothing confirms the code is unused before the key is released. The buyer is protected only by the one-hour dispute and the value limit.</p>
              )}
              {view.status === 'cipher_posted' && prepared && (
                <>
                  <button type="button" disabled={busy} onClick={() => void checkBuyer()}>Check the buyer key in the contract</button>
                  {buyerKey && (
                    <div data-testid="buyer-key">
                      <p>The key will be sealed to the voucher key of <code>{buyerKey.buyer}</code> per the contract, fingerprint <code data-testid="buyer-fingerprint">{buyerKey.fingerprint}</code>.</p>
                      <button type="button" disabled={busy || voucherKey.trim() === '' || (prepared.document.verifiable && !(verdict !== null && verdict.listingHash === view.listingHash && verdict.verdict === 'valid' && (verdict.validUntilMs === null || verdict.validUntilMs > Date.now())))} onClick={() => void releaseKey()}>Release key to {buyerKey.buyer} (fingerprint {buyerKey.fingerprint})</button>
                    </div>
                  )}
                </>
              )}
              {view.status === 'confirmed' && <p className="state" role="status">Confirmed{view.autoConfirmed ? ' automatically' : ''}: the buyer voucher is released to you.</p>}
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
          This code cannot be checked: the issuer <code>{listing.issuer}</code> has no check API, so nothing confirms the code is unused before you pay.
          Your only protection is proof of mismatched content (a one-hour dispute after the key is released); a code that was already used can only be reported to reputation and payment still goes through. The code value is limited to {formatCredit(UNVERIFIABLE_CODE_LIMIT)} credit.
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
    <div>
      <label><span>Code listing hash</span><input value={hash} onChange={(e) => { setHash(e.target.value); setChecked(null) }} placeholder="64 hex" /></label>
      <button type="button" disabled={!account || busy || !/^[0-9a-f]{64}$/.test(hash.trim())} onClick={() => void check()}>Check listing</button>
      {checked && (
        <div data-testid="code-summary">
          <dl className="status-panel">
            <dt>Code</dt><dd data-testid="code-hidden">hidden until purchased; commitment <code>{checked.listing.codeCommitment}</code></dd>
            <dt>Value</dt><dd>{formatCredit(checked.listing.value)} credit</dd>
            <dt>Issuer</dt><dd><code>{checked.listing.issuer}</code> · {checked.listing.verifiable ? 'checkable' : 'not checkable'}</dd>
            <dt>Paid to</dt><dd><code>{checked.view.account}</code> · seller key fingerprint <code>{checked.fingerprint}</code></dd>
            <dt>Price</dt><dd>{formatCredit(checked.view.offer.value)} credit</dd>
          </dl>
          <Warnings listing={checked.listing} />
          <button type="button" disabled={busy || voucherKey.trim() === '' || checked.listing.overLimit} onClick={() => void buy()}>
            Buy for {formatCredit(checked.view.offer.value)} credit from {checked.view.account} (voucher held by the backend)
          </button>
        </div>
      )}
      <small>The voucher is not given to the seller: the backend registers it only after the code matches or on automatic confirmation. A seller who sells the same code twice is not detected by hash: protect yourself with the one-hour dispute.</small>
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
        setMessage('The backend could not fetch the ciphertext that the seller signed, so the sale is disputed and the voucher stays held: the seller is not paid.')
        await client.invalidateQueries({ queryKey: ['purchase', open] })
        return
      }
      setMessage(action === 'confirmed' ? 'Confirmed: the voucher will be registered.' : proof === null ? 'Complaint recorded in the seller reputation. This does not stop payment: the purchase is still confirmed automatically when the one-hour window ends.' : 'Dispute sent with proof.')
      await client.invalidateQueries({ queryKey: ['purchase', open] })
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="form" aria-label="Code purchase">
      <h3>Purchase (buyer)</h3>
      <BuyForm voucherKey={voucherKey} onBought={(pid) => { setId(pid); setOpen(pid) }} />
      <label><span>Purchase number</span><input value={id} onChange={(e) => setId(e.target.value)} /></label>
      <div><button type="button" disabled={id.trim() === ''} onClick={() => setOpen(id.trim())}>Open purchase</button></div>
      {open && (
        <QueryState query={query} loadingLabel="Loading purchase">
          {(view) => {
            const left = disputeSecondsLeft(view.disputeUntil, tick)
            const canDispute = view.status === 'key_released' && (left === null || left > 0)
            return (
              <div data-testid="purchase">
                <p>Status: <strong>{STATUS_LABEL[view.status] ?? view.status}</strong></p>
                {left !== null && view.status === 'key_released' && (
                  <p data-testid="dispute-window" role="status">
                    {left > 0 ? `Disputes open for ${minutes(left)} more (${CODE_DISPUTE_WINDOW_SECONDS / 60}-minute window); staying silent until then means automatic confirmation.` : 'The dispute window has passed: the purchase is confirmed automatically.'}
                  </p>
                )}
                {view.source && <p>Source: <code>{view.source.kind}</code> <code>{view.source.ref}</code></p>}
                {view.status === 'key_released' && (
                  <>
                    <p className="state" data-testid="seller-key-note">The seller public key is read from the contract when you press the button, not typed.</p>
                    <button type="button" disabled={busy || voucherKey.trim() === ''} onClick={() => void receive()}>Download and check code</button>
                    {sellerFingerprint && <p data-testid="seller-fingerprint">Seller key fingerprint from the contract: <code>{sellerFingerprint}</code></p>}
                  </>
                )}
                {result?.state === 'ok' && (
                  <div data-testid="code-ok">
                    <p className="state" role="status">The code matches code_commitment. Confirm if you are satisfied; otherwise the purchase is confirmed automatically when the one-hour window ends.</p>
                    {shown ? <p>Code: <code data-testid="code-value">{result.code}</code></p> : <button type="button" onClick={() => setShown(true)}>Show code</button>}
                    <button type="button" disabled={busy} onClick={() => void notify('confirmed', null, null)}>Confirm</button>
                  </div>
                )}
                {result?.state === 'cheated' && (
                  <div data-testid="code-cheated">
                    <p className="state state-error" role="alert">The code does not match ({result.reason}). Cheat proof is ready; a wrong code is not paid for.</p>
                    <button type="button" disabled={busy || !canDispute} onClick={() => void notify('disputed', 'content_mismatch', proofForApi(result.proof))}>Dispute with proof</button>
                  </div>
                )}
                {result?.state === 'refused' && <p className="state state-error" role="alert" data-testid="code-refused">{result.reason}</p>}
                {view.status === 'key_released' && (
                  <button type="button" disabled={busy || !canDispute} onClick={() => void notify('disputed', 'other', null)}>Report to reputation (does not stop payment)</button>
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
      <h2>One-time codes</h2>
      <p className="state">What is sold is a single code that can be used only once. The code is encrypted and hidden until purchased; the key is released to the buyer after they pay (voucher held), and disputes are open for one hour after that.</p>
      <Seller voucherKey={voucherKey} onVoucherKey={setVoucherKey} onPrepared={setPrepared} />
      <Serve voucherKey={voucherKey} onVoucherKey={setVoucherKey} prepared={prepared} />
      <Buyer voucherKey={voucherKey} />
    </>
  )
}
