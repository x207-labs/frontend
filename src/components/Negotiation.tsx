// FE-020: negotiation and quick barter for one listing. Offers and per-round counter-offers are signed with the
// voucher key in the browser; before accepting, the user sees the final numbers (cashback, discount, seeker share, bundle legs) from the server
// preview, and the signed message is checked to match the displayed `terms_hash`.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import { useOffers, useProposals } from '../api/queries'
import type { AcceptPreview, AcceptResult, BundleProposal, ListingView, OfferView, QuickBreakdown } from '../api/types'
import { CONTRACT_ID } from '../config'
import { toAtomic } from '../lib/amount'
import { checkBundleToSign, serializeBundleTerms, sha256Hex, signMessageWithVoucher, signOffer, type Offer } from '../lib/barter'
import { formatCredit, formatNumber, formatTime, shortAccount } from '../lib/format'
import { describeMarketError } from '../lib/marketError'
import { useWallet } from '../wallet/WalletContext'
import { ErrorNotice, Loading } from './QueryState'
import { SignInPrompt } from './SignInPrompt'
import { VoucherKeyField } from './VoucherKeyField'

const SECONDS_PER_DAY = 86_400
const MODE_LABEL = { pay: 'Pay discounted price', barter: 'Barter' } as const

function Breakdown({ listing, breakdown }: { listing: ListingView; breakdown: QuickBreakdown }) {
  if (breakdown.mode === 'pay') {
    return (
      <dl className="kv" aria-label="Payment breakdown">
        <dt>Counterparty pays</dt>
        <dd>{formatCredit(breakdown.counterpartyPays)} credit</dd>
        <dt>Seller receives</dt>
        <dd>{formatCredit(breakdown.sellerReceives)} credit (deal value {formatCredit(String(BigInt(breakdown.sellerReceives) + BigInt(breakdown.discount)))} minus discount {formatCredit(breakdown.discount)})</dd>
        <dt>Seeker share</dt>
        <dd>{formatCredit(breakdown.searcher)} credit</dd>
      </dl>
    )
  }
  return (
    <dl className="kv" aria-label="Barter breakdown">
      <dt>Counterparty gives</dt>
      <dd>{listing.want.assetType} worth {formatCredit(breakdown.counterpartyGives)} credit</dd>
      <dt>Counterparty receives</dt>
      <dd>{listing.offer.assetType} plus cashback {formatCredit(breakdown.cashback)} credit</dd>
      <dt>Seller bears</dt>
      <dd>{formatCredit(breakdown.sellerBears)} credit (cashback {formatCredit(breakdown.cashback)} + seeker share {formatCredit(breakdown.searcher)})</dd>
      <dt>Seeker share</dt>
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

  const title = previous ? `Counteroffer round ${previous.round + 1}` : 'Make an offer'
  return (
    <form className="form" aria-label={title} onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <h4>{title}</h4>
      <label>
        <span>Method</span>
        <select value={mode} onChange={(e) => setMode(e.target.value as 'pay' | 'barter')}>
          <option value="barter">{MODE_LABEL.barter}</option>
          <option value="pay" disabled={!listing.acceptPayment}>{MODE_LABEL.pay}{listing.acceptPayment ? '' : ' (not accepted by this listing)'}</option>
        </select>
      </label>
      <label>
        <span>Proposed value (credit)</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" />
      </label>
      <label>
        <span>Quantity</span>
        <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" />
      </label>
      <label>
        <span>Delivered within (days)</span>
        <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
      </label>
      <VoucherKeyField value={voucherKey} onChange={onVoucherKey} />
      <div>
        <button type="submit" disabled={!valid || busy}>{busy ? 'Signing…' : 'Sign and send offer'}</button>
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
          throw new Error('The message to sign does not match the terms_hash from the server. Cancelled.')
        }
        // FE-1: the hash above comes from the same server, so the message itself is checked before the key signs it
        const check = checkBundleToSign({ message: preview.bundle.message, recipient: preview.bundle.recipient, account: account ?? '', contract: CONTRACT_ID, epoch: preview.epoch, breakdown: preview.breakdown as unknown as Record<string, string> })
        if (!check.ok) throw new Error(check.reason)
        signature = await signMessageWithVoucher(preview.bundle.message, CONTRACT_ID, voucherKey)
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
        Agreed. {shortAccount(result.result.payer)} pays {formatCredit(result.result.amount)} credit to {shortAccount(result.result.payee)} with an ordinary voucher; no bundle.
      </p>
    ) : (
      <p className="state" role="status">
        Bundle proposal created for epoch {result.result.proposal.epoch}. Waiting for signatures: {result.result.proposal.missing.map(shortAccount).join(', ') || 'none'}.
      </p>
    )
  }

  const shown = preview?.bundle ? checkBundleToSign({ message: preview.bundle.message, recipient: preview.bundle.recipient, account: account ?? '', contract: CONTRACT_ID, epoch: preview.epoch, breakdown: preview.breakdown as unknown as Record<string, string> }) : null
  const legs = shown?.ok ? shown.terms.legs : []
  return (
    <section className="accept" aria-label="Accept offer">
      <h4>Accept offer round {offer.round}</h4>
      <label>
        <span>Autonomous seeker (optional)</span>
        <input value={searcher} onChange={(e) => setSearcher(e.target.value)} placeholder="scraper.x207-circle.near" />
      </label>
      <label>
        <span>Seeker share (% of listing value)</span>
        <input value={share} onChange={(e) => setShare(e.target.value)} inputMode="decimal" disabled={!searcher.trim()} />
        {!shareOk && <small className="state-error" role="alert">Enter a percentage with at most 2 decimals.</small>}
      </label>
      <button type="button" onClick={() => void calculate()} disabled={!account || !shareOk || busy !== null}>
        {busy === 'preview' ? 'Calculating…' : 'Calculate breakdown'}
      </button>
      {preview && (
        <>
          <Breakdown listing={listing} breakdown={preview.breakdown} />
          {preview.bundle ? (
            <>
              <p>Bundle epoch {preview.epoch}, <code>terms_hash</code> <code>{preview.bundle.termsHash.slice(0, 16)}…</code>. Every participant signs.</p>
              <ul aria-label="Bundle legs">
                {legs.map((l) => (
                  <li key={`${l.payer}>${l.payee}`}>{shortAccount(l.payer)} → {shortAccount(l.payee)}: {formatCredit(l.max_amount)} credit</li>
                ))}
              </ul>
              <VoucherKeyField value={voucherKey} onChange={onVoucherKey} />
            </>
          ) : (
            <p>A single voucher payment: {shortAccount(preview.payment!.payer)} → {shortAccount(preview.payment!.payee)}, {formatCredit(preview.payment!.amount)} credit. No bundle signature.</p>
          )}
          <button type="button" className="glow" onClick={() => void accept()} disabled={busy !== null || (preview.bundle !== null && voucherKey.trim() === '')}>
            {busy === 'sign' ? 'Signing…' : preview.bundle ? 'Sign and accept' : 'Accept'}
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
      if ((await sha256Hex(message)) !== proposal.termsHash) throw new Error('Bundle terms do not match the terms_hash. Cancelled.')
      // FE-1: the circle and epoch in the server's proposal must be this circle, and this account must be part of it
      const check = checkBundleToSign({ message, recipient: CONTRACT_ID, account, contract: CONTRACT_ID, epoch: proposal.epoch })
      if (!check.ok) throw new Error(check.reason)
      await api.signProposal(proposal.termsHash, account, await signMessageWithVoucher(message, CONTRACT_ID, voucherKey))
      await client.invalidateQueries({ queryKey: ['proposals'] })
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li>
      Bundle epoch {proposal.epoch}, <code>{proposal.termsHash.slice(0, 12)}…</code>: {proposal.status === 'ready' ? 'ready to be sent by the solver' : `waiting for ${proposal.missing.map(shortAccount).join(', ')}`}.
      {account && proposal.missing.includes(account) && (
        <button type="button" onClick={() => void sign()} disabled={busy || voucherKey.trim() === ''}>
          {busy ? 'Signing…' : 'Sign bundle'}
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
    <section className="negotiation" aria-label="Negotiation">
      <div className="page-title">
        <h3>Negotiation {listing.offer.assetType} ↔ {listing.want.assetType}</h3>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      <p>
        Quick barter discount {formatNumber(listing.discountBps / 100)}%, {listing.acceptPayment ? 'the counterparty may pay the discounted price' : 'barter only'}. Valid until {formatTime(listing.expiresAt)}.
      </p>
      {offers.isError && <ErrorNotice error={offers.error} onRetry={() => offers.refetch()} />}
      {offers.isLoading && <Loading label="Loading offers" />}
      {offers.data && mine.length === 0 && <p className="state">No offers yet{owner ? '' : ' from this account'}.</p>}
      {mine.length > 0 && (
        <div className="table-wrap">
          <table aria-label="Negotiation rounds">
            <thead>
              <tr><th>Round</th><th>From</th><th>Method</th><th>Value</th><th>Quantity</th><th>Delivered</th><th>Status</th></tr>
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
      {!account && <SignInPrompt action="negotiate" />}
      {account && !open && <p className="state">The listing is no longer open ({listing.status}).</p>}
      {account && open && !owner && !hasThread && (
        <OfferForm listing={listing} voucherKey={voucherKey} onVoucherKey={onVoucherKey} onDone={() => undefined} />
      )}
      {account && open && waiting.map((o) => (
        <div key={o.offerHash} className="actions">
          <p>Offer round {o.round} from {shortAccount(o.proposer)} is waiting for your answer.</p>
          <button type="button" onClick={() => { setReplying(true); setAccepting(null) }}>Counteroffer</button>
          <button type="button" onClick={() => { setAccepting(o); setReplying(false) }}>Accept</button>
          {replying && <OfferForm listing={listing} previous={o} voucherKey={voucherKey} onVoucherKey={onVoucherKey} onDone={() => setReplying(false)} />}
          {accepting?.offerHash === o.offerHash && <AcceptPanel listing={listing} offer={o} voucherKey={voucherKey} onVoucherKey={onVoucherKey} />}
        </div>
      ))}
      {account && open && hasThread && waiting.length === 0 && <p className="state">Waiting for the counterparty to answer.</p>}
      {mineProposals.length > 0 && (
        <>
          <h4>Bundle proposals</h4>
          {account && mineProposals.some((p) => p.missing.includes(account)) && <VoucherKeyField value={voucherKey} onChange={onVoucherKey} />}
          <ul aria-label="Bundle proposals">
            {mineProposals.map((p) => <ProposalSigner key={p.termsHash} proposal={p} voucherKey={voucherKey} />)}
          </ul>
        </>
      )}
    </section>
  )
}
