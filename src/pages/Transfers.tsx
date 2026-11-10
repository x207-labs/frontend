import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'
import { viewContract } from '../api/chain'
import { useTransfer } from '../api/queries'
import type { ListingView } from '../api/types'
import type { TransferView } from '../api/transferView'
import { DealGlyph, DealTrack } from '../components/DealTrack'
import { PLATFORM_GLYPH, transferPosition, transferStops } from '../components/dealSteps'
import { NavIcon } from '../components/icons'
import { PAGE_HUE } from '../components/pageHue'
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
// FE-073: one role at a time (Buy, Sell, Track); every pane stays in the page and only hides with CSS.
const now = () => Math.floor(Date.now() / 1000)
type Tone = 'ok' | 'warn' | 'bad' | 'info'
const TONE_HEX: Record<Tone, string> = { ok: '#2f9e5b', warn: '#c98a12', bad: '#c4455a', info: '#3d78d6' }
const tone = (hex: string) => ({ ['--tone' as string]: hex })
const STATUS: Record<string, { label: string; tone: Tone }> = {
  paid_held: { label: 'Paid, on hold', tone: 'info' },
  confirmed: { label: 'Confirmed', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
}
const PROOF_SHORT: Record<string, string> = { dns_txt: 'DNS TXT record', trade_api: 'Steam trade offer', buyer_confirm: 'Buyer confirmation' }
const heldId = (id: string) => `t:${id}`
const minutes = (seconds: number): string => (seconds >= 86_400 ? `${Math.floor(seconds / 86_400)} d ${Math.floor((seconds % 86_400) / 3_600)} h` : `${Math.floor(seconds / 3_600)} h ${Math.floor((seconds % 3_600) / 60)} min`)
const TICKET_LEGAL = "Resale may be limited or banned by local law or by the ticket seller's terms. x207 does not check this, so check before you list or buy."
const LIMITS: Record<TransferPlatform, string> = {
  domain: 'A registrar can reverse a domain transfer for about 60 days. The x207 window is 7 days.',
  game_item: 'An accepted trade offer shows the item moved, not that it is genuine. The check opens after the trade hold.',
  ticket: 'The buyer confirms the ticket arrived. With no confirmation in one day, the sale cancels and the seller is not paid.',
}
const VIEWS = [['buy', 'Buy'], ['sell', 'Sell'], ['track', 'Track']] as const
type View = (typeof VIEWS)[number][0]

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
      {!account && <SignInPrompt action="prepare a transfer listing" />}
      <label>
        <span>Platform</span>
        <select value={platform} onChange={(e) => { setPlatform(e.target.value as TransferPlatform); setDone(null) }}>
          {(Object.keys(PLATFORM_LABEL) as TransferPlatform[]).map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
        </select>
      </label>
      <label>
        <span>{platform === 'domain' ? 'Domain name (lowercase)' : platform === 'game_item' ? 'Item (appid:assetid)' : 'Ticket (event and seat)'}</span>
        <input value={ref} onChange={(e) => setRef(e.target.value)} autoComplete="off" placeholder={platform === 'domain' ? 'example.com' : platform === 'game_item' ? '730:1234567890' : 'Concert A, row 4'} />
      </label>
      <div className="field-pair">
        <label><span>Estimated time (seconds)</span><input inputMode="numeric" value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder={`up to ${TRANSFER_WINDOW_SECONDS[platform]}`} /></label>
        <label><span>Price (credit)</span><input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="25" /></label>
      </div>
      {platform === 'ticket' && <p className="state state-warn" role="note" data-testid="ticket-legal">{TICKET_LEGAL} Tickets are limited to 100 credit.</p>}
      <p className="state" data-testid="platform-limits">{LIMITS[platform]}</p>
      <div><button type="submit" disabled={!account || ref.trim() === '' || atomic === null || !Number.isInteger(seconds) || seconds < 1}>Prepare listing</button></div>
      {error && <p className="state state-error" role="alert">{error}</p>}
      {done && (
        <>
          {done.needsBond && (
            <p className="state state-error" role="alert" data-testid="bond-needed">
              A price of 100 credit or more needs a bond (a two-leg bundle with an arbiter). This page cannot build one: lower the price or use the bundle flow.
            </p>
          )}
          {!done.needsBond && (
            <ul className="item-cards">
              <li className="item-card">
                <span className="tone-tile" aria-hidden="true" style={tone(TONE_HEX.ok)}><DealGlyph name={PLATFORM_GLYPH[done.document.platform]} size={18} /></span>
                <p className="item-title"><code>{done.document.transfer_ref}</code></p>
                <span className="pill" data-tone="ok">Ready to list</span>
                <p className="item-meta">Paste the listing detail into the Marketplace listing form.</p>
              </li>
            </ul>
          )}
          <details className="tech" data-testid="transfer-prepared">
            <summary>Listing detail to copy</summary>
            <p>Use asset type <code>{done.assetType}</code>, class B, quantity 1 and your price.</p>
            <pre data-testid="transfer-detail">{done.detail}</pre>
            <dl className="status-panel">
              <dt>transfer_doc</dt><dd><code>{done.documentHash}</code></dd>
              <dt>Asset type</dt><dd><code>{done.assetType}</code></dd>
              <dt>Resource</dt><dd><code>{done.resource}</code></dd>
            </dl>
          </details>
          {platform === 'domain' && (
            <div data-testid="seller-txt-steps">
              <h3>Prove you control the domain</h3>
              <ol>
                <li>Check the listing in the Marketplace form (dry run) to get its hash.</li>
                <li>Paste the hash.
                  <label><span>Listing hash</span><input value={listingHash} onChange={(e) => setListingHash(e.target.value)} placeholder="64 hex" /></label>
                </li>
                <li>Add this TXT record on <code>{done.document.transfer_ref}</code>: <code data-testid="sell-txt">{hashOk ? sellTxt(listingHash.trim()) : 'x207-sell=<listing hash>'}</code></li>
                <li>Post the listing. It is refused until the TXT record exists.</li>
              </ol>
            </div>
          )}
        </>
      )}
    </form>
  )
}

function BuyForm({ voucherKey, onVoucherKey, onBought }: { voucherKey: string; onVoucherKey: (v: string) => void; onBought: (id: string) => void }) {
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
    <div className="form">
      {!account && <SignInPrompt action="buy a transfer" />}
      <label><span>Transfer listing hash</span><input value={hash} onChange={(e) => { setHash(e.target.value); setChecked(null) }} placeholder="64 hex" /></label>
      <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />
      <div><button type="button" disabled={!account || busy || !/^[0-9a-f]{64}$/.test(hash.trim())} onClick={() => void check()}>Check listing</button></div>
      {checked && (
        <div className="actions" data-testid="transfer-summary">
          <DealTrack
            tile={{ glyph: PLATFORM_GLYPH[checked.listing.doc.platform] }} hue={PAGE_HUE['/transfers']} title={<code>{checked.listing.doc.transfer_ref}</code>}
            pill={{ tone: 'info', label: PLATFORM_LABEL[checked.listing.doc.platform] }}
            buyer={account ?? ''} seller={checked.view.account} account={account} stops={transferStops(PLATFORM_GLYPH[checked.listing.doc.platform])} done={0}
          >
            <p className="deal-note">Proof: {PROOF_SHORT[checked.listing.doc.proof_method] ?? PROOF_LABEL[checked.listing.doc.proof_method] ?? checked.listing.doc.proof_method}. Seller <code>{checked.view.account}</code></p>
          </DealTrack>
          <dl className="figures">
            <div><dt>Price</dt><dd>{formatCredit(checked.listing.doc.value)} credit</dd></div>
            <div><dt>Time allowed</dt><dd>{minutes(checked.listing.windowSeconds)}</dd></div>
            <div><dt>Seller estimate</dt><dd>{minutes(checked.listing.doc.estimate_seconds)}</dd></div>
          </dl>
          <p className="state">x207 holds your voucher until the platform shows the transfer. Without proof in time, the voucher never moves.</p>
          <p className="state state-warn" role="note" data-testid="buyer-limits">{LIMITS[checked.listing.doc.platform]}</p>
          {checked.listing.doc.platform === 'ticket' && <p className="state state-warn" role="note" data-testid="ticket-legal-buyer">{TICKET_LEGAL}</p>}
          {checked.listing.needsBond && (
            <p className="state state-error" role="alert" data-testid="bond-needed-buyer">This price needs a bond (a two-leg bundle with an arbiter). This page cannot build one, so do not buy here.</p>
          )}
          {needsRef && (
            <label><span>Your Steam account id (receives the trade offer)</span><input inputMode="numeric" value={buyerRef} onChange={(e) => setBuyerRef(e.target.value)} /></label>
          )}
          <button type="button" disabled={busy || voucherKey.trim() === '' || checked.listing.needsBond || (needsRef && !/^\d{1,20}$/.test(buyerRef.trim()))} onClick={() => void buy()}>
            Buy for {formatCredit(checked.listing.doc.value)} credit
          </button>
          <details className="tech">
            <summary>Technical details</summary>
            <dl className="status-panel">
              <dt>How it is proven</dt><dd>{PROOF_LABEL[checked.listing.doc.proof_method] ?? checked.listing.doc.proof_method}</dd>
              <dt>Seller key fingerprint</dt><dd><code>{checked.fingerprint}</code></dd>
            </dl>
          </details>
        </div>
      )}
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
  const ticketBuyer = held && view.platform === 'ticket' && isBuyer
  const state = STATUS[view.status] ?? { label: view.status, tone: 'info' as Tone }
  return (
    <div className="actions" data-testid="transfer">
      <DealTrack
        tile={{ glyph: PLATFORM_GLYPH[view.platform] }} hue={PAGE_HUE['/transfers']} title={<>{PLATFORM_LABEL[view.platform]} <code>{view.transferRef}</code></>}
        pill={state} buyer={view.buyer} seller={view.seller} account={account} stops={transferStops(PLATFORM_GLYPH[view.platform])} {...transferPosition(view.status)}
      >
        {held && <p className="deal-note" data-testid="window-left" role="status">{left > 0 ? `Closes in ${minutes(left)}` : 'Time is up: the sale cancels on the next read.'}</p>}
        {view.status === 'confirmed' && <p className="deal-note">Proof met. The seller can now register the voucher.</p>}
        {view.status === 'cancelled' && <p className="deal-note">The voucher never moved.</p>}
      </DealTrack>
      {message && <p className="state" role="status">{message}</p>}
      {error && <p className="state state-error" role="alert">{error}</p>}
      {view.cancelReason && <p className="state" data-testid="cancel-reason">Reason: <code>{view.cancelReason}</code></p>}
      {held && view.platform === 'domain' && (
        <div data-testid="buyer-txt-steps">
          <h3>Buyer: prove the transfer</h3>
          <ol>
            <li>Move <code>{view.transferRef}</code> to your registrar account with its official transfer.</li>
            <li>Add this TXT record to the domain: <code data-testid="own-txt">{ownTxt(view.transferId)}</code></li>
            <li>Check the proof. x207 reads the TXT record and the registry.</li>
          </ol>
          <button type="button" disabled={busy} onClick={() => void askProof()}>Check the proof</button>
        </div>
      )}
      {held && view.platform === 'game_item' && (
        <div data-testid="trade-steps">
          <h3>Prove the trade</h3>
          <p className="state">The seller sends a Steam trade offer and shares its id. Proof is met when it is accepted and its hold ends.</p>
          {view.tradeOfferId === null && <label><span>Trade offer id (digits)</span><input inputMode="numeric" value={tradeOffer} onChange={(e) => setTradeOffer(e.target.value)} /></label>}
          {view.tradeOfferId !== null && <p>Trade offer <code>{view.tradeOfferId}</code></p>}
          <button type="button" disabled={busy || (view.tradeOfferId === null && !/^\d{1,20}$/.test(tradeOffer.trim()))} onClick={() => void askProof()}>Check the trade</button>
        </div>
      )}
      {ticketBuyer && (
        <div className="actions" data-testid="ticket-steps">
          <h3>Confirm the ticket</h3>
          <p className="state state-warn" role="note">{TICKET_LEGAL}</p>
          <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />
          <button type="button" disabled={busy || voucherKey.trim() === ''} onClick={() => void signed('confirmed')}>Confirm that I received the ticket</button>
        </div>
      )}
      {held && view.platform !== 'ticket' && <p className="state" data-testid="proof-note">No signature needed. One check every 30 seconds.</p>}
      <p className="state" data-testid="transfer-limits">{LIMITS[view.platform]}</p>
      {held && isParty && (
        <details className="tech">
          <summary>Cancel this transfer</summary>
          <p>Cancelling is final. The voucher never moves.</p>
          {!ticketBuyer && <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />}
          <div><button type="button" className="quiet" disabled={busy || voucherKey.trim() === ''} onClick={() => void signed('cancelled')}>Cancel transfer</button></div>
        </details>
      )}
      <details className="tech">
        <summary>Technical details</summary>
        <dl className="status-panel">
          <dt>Transfer</dt><dd>{view.transferId}</dd>
          <dt>Buyer</dt><dd><code>{view.buyer}</code></dd>
          <dt>Seller</dt><dd><code>{view.seller}</code></dd>
        </dl>
        {view.proof && <><p>Last answer of the platform</p><pre>{JSON.stringify(view.proof, null, 2)}</pre></>}
      </details>
    </div>
  )
}

function Status({ voucherKey, onVoucherKey, openId, onOpen }: { voucherKey: string; onVoucherKey: (v: string) => void; openId: string | null; onOpen: (id: string | null) => void }) {
  const [id, setId] = useState('')
  const query = useTransfer(openId)
  return (
    <div className="form">
      <label><span>Transfer number</span><input value={id} onChange={(e) => setId(e.target.value)} inputMode="numeric" /></label>
      <div><button type="button" disabled={id.trim() === ''} onClick={() => onOpen(id.trim())}>Open transfer</button></div>
      {openId && <QueryState query={query} loadingLabel="Loading transfer">{(view) => <Proof key={view.transferId + view.status} view={view} voucherKey={voucherKey} onVoucherKey={onVoucherKey} />}</QueryState>}
    </div>
  )
}

export function Transfers() {
  const [voucherKey, setVoucherKey] = useState('')
  const [, setPrepared] = useState<PreparedTransfer | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [view, setView] = useState<View>('buy')
  return (
    <>
      <div className="page-lead">
        <span className="tone-tile" aria-hidden="true" style={tone(PAGE_HUE['/transfers'])}><NavIcon name="/transfers" size={22} /></span>
        <p>The item moves on its own platform; x207 never touches it.</p>
        <ol className="lead-steps" aria-label="How it works">
          <li>Seller lists</li>
          <li>Buyer pays</li>
          <li>Platform confirms</li>
          <li>Seller is paid</li>
        </ol>
      </div>
      <div className="views" data-view={view}>
        <div className="view-tabs">
          <div className="segmented market-views" role="group" aria-label="Transfer view">
            {VIEWS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>{label}</button>
            ))}
          </div>
        </div>
        <section className="views-pane" data-pane="buy" data-active={view === 'buy'} aria-label="Buy a transfer">
          <h2 className="sr-only">Buy a transfer</h2>
          <BuyForm voucherKey={voucherKey} onVoucherKey={setVoucherKey} onBought={(id) => { setOpenId(id); setView('track') }} />
        </section>
        <section className="views-pane" data-pane="sell" data-active={view === 'sell'} aria-label="Sell a transfer">
          <h2 className="sr-only">Sell a transfer</h2>
          <Seller onPrepared={setPrepared} />
        </section>
        <section className="views-pane" data-pane="track" data-active={view === 'track'} aria-label="Transfer status">
          <h2 className="sr-only">Transfer status</h2>
          <Status voucherKey={voucherKey} onVoucherKey={setVoucherKey} openId={openId} onOpen={setOpenId} />
        </section>
      </div>
    </>
  )
}
