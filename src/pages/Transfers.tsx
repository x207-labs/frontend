import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'
import { viewContract } from '../api/chain'
import { useTransfer } from '../api/queries'
import type { ListingView } from '../api/types'
import type { TransferView } from '../api/transferView'
import { QueryState } from '../components/QueryState'
import { SignInPrompt } from '../components/SignInPrompt'
import { VoucherKeyField } from '../components/VoucherKeyField'
import { CONTRACT_ID } from '../config'
import { pairStateWithHeld, recallHeld, rememberHeld } from '../lib/codeFlow'
import { toAtomic } from '../lib/amount'
import { formatCredit } from '../lib/format'
import { signSellerNotice } from '../lib/licenseFlow'
import { checkListingToBuy } from '../lib/listingCheck'
import { describeMarketError } from '../lib/marketError'
import {
  PLATFORM_LABEL, PROOF_LABEL, TRANSFER_WINDOW_SECONDS, buildTransferPurchase, ownTxt, parseTransferListing, prepareTransfer, sellTxt, transferNotice, windowSecondsLeft,
  type PreparedTransfer, type TransferListing,
} from '../lib/transferFlow'
import { useWallet } from '../wallet/WalletContext'
import type { TransferPlatform } from '@x207/core'

// FE-033: transfer through the official feature of a platform (P4, ADR-49): a domain, a game item or a ticket. x207 holds the voucher of the buyer until the platform shows that the
// transfer happened. The seller lists with a document whose hash the buyer can check; for a domain the seller proves control with a DNS TXT record before the listing, and the buyer
// proves the transfer with a second TXT record after it. The backend asks DNS, RDAP or Steam: the browser asks nothing of a platform. The limits are written on the page.
const now = () => Math.floor(Date.now() / 1000)
const STATUS_LABEL: Record<string, string> = { paid_held: 'Paid, voucher held', confirmed: 'Confirmed: the proof is met', cancelled: 'Cancelled: the voucher never moved' }
const heldId = (id: string) => `t:${id}`
const minutes = (seconds: number): string => (seconds >= 86_400 ? `${Math.floor(seconds / 86_400)} d ${Math.floor((seconds % 86_400) / 3_600)} h` : `${Math.floor(seconds / 3_600)} h ${Math.floor((seconds % 3_600) / 60)} min`)
const TICKET_LEGAL = 'Reselling a ticket can be limited or forbidden by local law and by the terms of the ticket seller (a price cap, a ban on resale, a named ticket). x207 does not check this. Check it before you list or buy.'
const LIMITS: Record<TransferPlatform, string> = {
  domain: 'The proof says that the buyer controlled the domain when it was checked. A registrar can take a transfer back for about 60 days; the window of x207 is 7 days. Transfer through the official feature of your registrar.',
  game_item: 'The accepted trade offer proves that the item moved to the buyer account, not that the item is the genuine one. The seller tells the buyer the id of the trade offer; the check opens after the hold of the trade.',
  ticket: 'A ticket is the word of the buyer: the buyer confirms that it arrived. A buyer who never confirms cancels the sale after one day and the seller is not paid.',
}

function Seller({ onPrepared }: { onPrepared: (p: PreparedTransfer) => void }) {
  const { account } = useWallet()
  const [platform, setPlatform] = useState<TransferPlatform>('domain')
  const [ref, setRef] = useState('')
  const [estimate, setEstimate] = useState('')
  const [value, setValue] = useState('')
  const [listingHash, setListingHash] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<PreparedTransfer | null>(null)
  const atomic = toAtomic(value)
  const seconds = Number(estimate)

  function prepare() {
    if (!account || atomic === null) return
    setError(null)
    try {
      const prepared = prepareTransfer({
        circle: CONTRACT_ID, seller: account, platform, transferRef: ref, estimateSeconds: seconds, value: atomic, nonce: crypto.randomUUID().replaceAll('-', '').slice(0, 24),
      })
      setDone(prepared)
      onPrepared(prepared)
    } catch (e) {
      setDone(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const hashOk = /^[0-9a-f]{64}$/.test(listingHash.trim())
  return (
    <form className="form" aria-label="Prepare transfer listing" onSubmit={(e) => { e.preventDefault(); prepare() }}>
      <h3>List a transfer (seller)</h3>
      {!account && <SignInPrompt action="prepare a transfer listing" />}
      <label>
        <span>Platform</span>
        <select value={platform} onChange={(e) => { setPlatform(e.target.value as TransferPlatform); setDone(null) }}>
          {(Object.keys(PLATFORM_LABEL) as TransferPlatform[]).map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
        </select>
      </label>
      <label><span>{platform === 'domain' ? 'Domain name (lowercase)' : platform === 'game_item' ? 'Item (appid:assetid)' : 'Ticket (event, seat, any text up to 256 characters)'}</span><input value={ref} onChange={(e) => setRef(e.target.value)} autoComplete="off" /></label>
      <label><span>Estimated time of the transfer (seconds, at most {TRANSFER_WINDOW_SECONDS[platform]})</span><input inputMode="numeric" value={estimate} onChange={(e) => setEstimate(e.target.value)} /></label>
      <label><span>Price (credit)</span><input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="25" /></label>
      {platform === 'ticket' && <p className="state state-warn" role="note" data-testid="ticket-legal">{TICKET_LEGAL} A ticket is limited to 100 credit.</p>}
      <p className="state" data-testid="platform-limits">{LIMITS[platform]}</p>
      <div><button type="submit" disabled={!account || ref.trim() === '' || atomic === null || !Number.isInteger(seconds) || seconds < 1}>Prepare listing</button></div>
      {error && <p className="state state-error" role="alert">{error}</p>}
      {done && (
        <div data-testid="transfer-prepared">
          {done.needsBond && (
            <p className="state state-error" role="alert" data-testid="bond-needed">
              A price of 100 credit or more needs a bond: a bundle of two legs with an arbiter, which this page does not build. List it with the bundle flow, or lower the price.
            </p>
          )}
          <dl className="status-panel">
            <dt>transfer_doc</dt><dd><code>{done.documentHash}</code></dd>
            <dt>Asset type</dt><dd><code>{done.assetType}</code></dd>
            <dt>Resource</dt><dd><code>{done.resource}</code></dd>
          </dl>
          <p>Listing detail (copy it into the Detail field of the listing form of the Marketplace, with asset type <code>{done.assetType}</code>, class B, quantity 1 and the price above):</p>
          <pre data-testid="transfer-detail">{done.detail}</pre>
          {platform === 'domain' && (
            <div data-testid="seller-txt-steps">
              <h4>Prove that you control the domain, before the listing</h4>
              <ol>
                <li>Check the listing in the Marketplace form (the dry run); it answers the listing hash.</li>
                <li>Paste the listing hash here.
                  <label><span>Listing hash</span><input value={listingHash} onChange={(e) => setListingHash(e.target.value)} placeholder="64 hex" /></label>
                </li>
                <li>Add this TXT record on <code>{done.document.transfer_ref}</code>: <code data-testid="sell-txt">{hashOk ? sellTxt(listingHash.trim()) : 'x207-sell=<listing hash>'}</code></li>
                <li>Post the listing. The backend refuses it while the TXT record is not there (<code>transfer_seller_unproven</code>).</li>
              </ol>
            </div>
          )}
        </div>
      )}
    </form>
  )
}

function BuyForm({ voucherKey, onBought }: { voucherKey: string; onBought: (id: string) => void }) {
  const { account } = useWallet()
  const [hash, setHash] = useState('')
  const [buyerRef, setBuyerRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState<{ view: ListingView; listing: TransferListing; fingerprint: string } | null>(null)

  async function check() {
    setBusy(true)
    setError(null)
    setChecked(null)
    try {
      const typed = hash.trim()
      const view = await api.listing(typed)
      const listing = parseTransferListing(CONTRACT_ID, view)
      if (listing === null) throw new Error('This listing is not a valid transfer listing: its detail is not a transfer, or its document does not match the hash transfer_doc.')
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
      // the vouchers that earlier purchases and transfers from this seller still hold are part of the state of the pair (B7-C3)
      const live = []
      for (const h of recallHeld(view.account, open.epoch)) {
        try {
          const id = h.purchaseId.startsWith('t:') ? h.purchaseId.slice(2) : null
          const status = id === null ? (await api.purchase(h.purchaseId)).status : (await api.transfer(id)).status
          if (status !== 'cancelled') live.push(h)
        } catch {
          live.push(h)
        }
      }
      const built = await buildTransferPurchase({
        listing, buyer: account, epoch: open.epoch, secretKey: voucherKey,
        state: pairStateWithHeld({ seq: ob?.last_seq ?? 0, cumulativeAmount: ob?.cumulative ?? '0' }, live),
      })
      const created = await api.createTransfer(hash.trim(), built.voucher, built.signature, listing.doc.platform === 'game_item' ? buyerRef.trim() : undefined)
      rememberHeld({ purchaseId: heldId(created.transferId), payee: view.account, epoch: open.epoch, seq: built.voucher.seq, cumulativeAmount: built.voucher.cumulativeAmount })
      setChecked(null)
      onBought(created.transferId)
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }
  const needsRef = checked?.listing.doc.platform === 'game_item'
  return (
    <div>
      <label><span>Transfer listing hash</span><input value={hash} onChange={(e) => { setHash(e.target.value); setChecked(null) }} placeholder="64 hex" /></label>
      <button type="button" disabled={!account || busy || !/^[0-9a-f]{64}$/.test(hash.trim())} onClick={() => void check()}>Check listing</button>
      {checked && (
        <div data-testid="transfer-summary">
          <dl className="status-panel">
            <dt>Platform</dt><dd>{PLATFORM_LABEL[checked.listing.doc.platform]}</dd>
            <dt>What is transferred</dt><dd><code>{checked.listing.doc.transfer_ref}</code></dd>
            <dt>Proof</dt><dd>{PROOF_LABEL[checked.listing.doc.proof_method]}</dd>
            <dt>Seller estimate</dt><dd>{minutes(checked.listing.doc.estimate_seconds)}</dd>
            <dt>Window</dt><dd>{minutes(checked.listing.windowSeconds)}; without the proof inside it the purchase is cancelled and the voucher never moves</dd>
            <dt>Paid to</dt><dd><code>{checked.view.account}</code> · seller key fingerprint <code>{checked.fingerprint}</code></dd>
            <dt>Price</dt><dd>{formatCredit(checked.listing.doc.value)} credit</dd>
          </dl>
          <p className="state state-warn" role="note" data-testid="buyer-limits">{LIMITS[checked.listing.doc.platform]}</p>
          {checked.listing.doc.platform === 'ticket' && <p className="state state-warn" role="note" data-testid="ticket-legal-buyer">{TICKET_LEGAL}</p>}
          {checked.listing.needsBond && (
            <p className="state state-error" role="alert" data-testid="bond-needed-buyer">This price needs a bond: a bundle of two legs with an arbiter. This page does not build it, so do not buy here.</p>
          )}
          {needsRef && (
            <label><span>Your Steam account id (the trade offer must go to it)</span><input inputMode="numeric" value={buyerRef} onChange={(e) => setBuyerRef(e.target.value)} /></label>
          )}
          <button type="button" disabled={busy || voucherKey.trim() === '' || checked.listing.needsBond || (needsRef && !/^\d{1,20}$/.test(buyerRef.trim()))} onClick={() => void buy()}>
            Buy for {formatCredit(checked.listing.doc.value)} credit from {checked.view.account} (voucher held by the backend)
          </button>
        </div>
      )}
      <small>The voucher is not given to the seller: the backend registers it only after the platform shows the transfer.</small>
      {error && <p className="state state-error" role="alert">{error}</p>}
    </div>
  )
}

function Proof({ view, voucherKey, onVoucherKey }: { view: TransferView; voucherKey: string; onVoucherKey: (v: string) => void }) {
  const { account } = useWallet()
  const client = useQueryClient()
  const [tradeOffer, setTradeOffer] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clock, setClock] = useState(now())
  useEffect(() => {
    const timer = setInterval(() => setClock(now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const held = view.status === 'paid_held'
  const left = windowSecondsLeft(view.windowUntil, clock)

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await fn()
      setMessage(ok)
    } catch (e) {
      // a proof that is not met yet is not an error of the buyer: say what is missing and when to ask again
      if (e instanceof ApiError && e.code === 'transfer_proof_pending') {
        const wait = typeof e.details?.retryAfterSeconds === 'number' ? ` Ask again in ${e.details.retryAfterSeconds} seconds.` : ''
        setMessage(`The platform does not show the transfer yet; the voucher is still held.${wait}`)
      } else if (e instanceof ApiError && e.code === 'transfer_platform_unavailable') {
        setError('The platform did not answer. Nothing was decided and the voucher is still held: try again later.')
      } else if (e instanceof ApiError && e.code === 'rate_limited') {
        setMessage(`The proof is checked once each 30 seconds.${typeof e.details?.retryAfterSeconds === 'number' ? ` Ask again in ${e.details.retryAfterSeconds} seconds.` : ''}`)
      } else {
        setError(describeMarketError(e))
      }
    } finally {
      await client.invalidateQueries({ queryKey: ['transfer', view.transferId] })
      setBusy(false)
    }
  }
  const askProof = () => run(() => api.transferProof(view.transferId, view.platform === 'game_item' && view.tradeOfferId === null ? { tradeoffer_id: tradeOffer.trim() } : {}), 'The proof is met: the transfer is confirmed.')
  const signed = (action: 'confirmed' | 'cancelled') => run(async () => {
    const notice = transferNotice(CONTRACT_ID, view.transferId, account!, action, now())
    await api.transferNotice(view.transferId, notice, await signSellerNotice(notice, CONTRACT_ID, voucherKey))
    onVoucherKey('')
  }, action === 'confirmed' ? 'Confirmed: the voucher goes to the seller.' : 'Cancelled: the voucher never moves.')

  const isBuyer = account === view.buyer
  const isParty = isBuyer || account === view.seller
  return (
    <div data-testid="transfer">
      <p>Status: <strong>{STATUS_LABEL[view.status] ?? view.status}</strong> · {PLATFORM_LABEL[view.platform]} <code>{view.transferRef}</code> · buyer <code>{view.buyer}</code> · seller <code>{view.seller}</code></p>
      {held && <p data-testid="window-left" role="status">{left > 0 ? `The window closes in ${minutes(left)}.` : 'The window has passed: the purchase is cancelled when it is read again.'}</p>}
      {view.cancelReason && <p className="state" data-testid="cancel-reason">Cancelled: <code>{view.cancelReason}</code></p>}
      {view.status === 'confirmed' && <p className="state" role="status">The proof is met. The voucher is shown to the seller to register.</p>}
      {held && view.platform === 'domain' && (
        <div data-testid="buyer-txt-steps">
          <h4>Prove the transfer (buyer)</h4>
          <ol>
            <li>Transfer the domain <code>{view.transferRef}</code> to your account at the registrar, through its official transfer feature.</li>
            <li>Add this TXT record on the domain: <code data-testid="own-txt">{ownTxt(view.transferId)}</code></li>
            <li>Press the button. The backend reads the TXT record and checks the registry (RDAP) that the domain is live and not in a pending state.</li>
          </ol>
          <button type="button" disabled={busy} onClick={() => void askProof()}>Check the proof</button>
        </div>
      )}
      {held && view.platform === 'game_item' && (
        <div data-testid="trade-steps">
          <h4>Prove the trade (buyer or seller)</h4>
          <p>The seller sends a trade offer of the item to the Steam account of the buyer. The proof is met when the offer is accepted and its hold is over.</p>
          {view.tradeOfferId === null && <label><span>Trade offer id (digits)</span><input inputMode="numeric" value={tradeOffer} onChange={(e) => setTradeOffer(e.target.value)} /></label>}
          {view.tradeOfferId !== null && <p>Trade offer <code>{view.tradeOfferId}</code></p>}
          <button type="button" disabled={busy || (view.tradeOfferId === null && !/^\d{1,20}$/.test(tradeOffer.trim()))} onClick={() => void askProof()}>Check the trade</button>
        </div>
      )}
      {held && view.platform === 'ticket' && isBuyer && (
        <div data-testid="ticket-steps">
          <h4>Confirm the ticket (buyer)</h4>
          <p className="state state-warn" role="note">{TICKET_LEGAL}</p>
          <button type="button" disabled={busy || voucherKey.trim() === ''} onClick={() => void signed('confirmed')}>Confirm that I received the ticket</button>
        </div>
      )}
      {held && isParty && <button type="button" disabled={busy || voucherKey.trim() === ''} onClick={() => void signed('cancelled')}>Cancel this transfer (the voucher never moves)</button>}
      {held && view.platform !== 'ticket' && <p className="state" data-testid="proof-note">Asking for the proof needs no signature and is limited to one check each 30 seconds.</p>}
      <p className="state" data-testid="transfer-limits">{LIMITS[view.platform]}</p>
      {view.proof && <details><summary>Last answer of the platform</summary><pre>{JSON.stringify(view.proof, null, 2)}</pre></details>}
      {message && <p className="state" role="status">{message}</p>}
      {error && <p className="state state-error" role="alert">{error}</p>}
    </div>
  )
}

function Status({ voucherKey, onVoucherKey, openId, onOpen }: { voucherKey: string; onVoucherKey: (v: string) => void; openId: string | null; onOpen: (id: string | null) => void }) {
  const [id, setId] = useState('')
  const query = useTransfer(openId)
  return (
    <section className="form" aria-label="Transfer status">
      <h3>Status and proof</h3>
      <label><span>Transfer number</span><input value={id} onChange={(e) => setId(e.target.value)} /></label>
      <div><button type="button" disabled={id.trim() === ''} onClick={() => onOpen(id.trim())}>Open transfer</button></div>
      {openId && <QueryState query={query} loadingLabel="Loading transfer">{(view) => <Proof key={view.transferId + view.status} view={view} voucherKey={voucherKey} onVoucherKey={onVoucherKey} />}</QueryState>}
    </section>
  )
}

export function Transfers() {
  const [voucherKey, setVoucherKey] = useState('')
  const [, setPrepared] = useState<PreparedTransfer | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const { account } = useWallet()
  return (
    <>
      <h2>Platform transfers</h2>
      <p className="state">A domain, a game item or a ticket changes hands through the official feature of its platform. x207 holds the voucher of the buyer until the platform shows that the transfer happened; if it does not happen inside the window, the voucher never moves.</p>
      <Seller onPrepared={setPrepared} />
      <section className="form" aria-label="Buy a transfer">
        <h3>Buy a transfer (buyer)</h3>
        <BuyForm voucherKey={voucherKey} onBought={(id) => setOpenId(id)} />
        <VoucherKeyField value={voucherKey} onChange={setVoucherKey} disabled={!account} />
      </section>
      <Status voucherKey={voucherKey} onVoucherKey={setVoucherKey} openId={openId} onOpen={setOpenId} />
    </>
  )
}
