import { fixtureReply, marketStats, type FixtureReply } from '../api/fixtures'
import type { AcceptPreview, BundleLeg, BundleProposal, ListingView, OfferView, QuickBreakdown } from '../api/types'
import { CIRCLE, CONTRACT_ID } from '../config'
import { listingHash, offerHash, serializeBundleTerms, sha256Hex, type BundleTerms, type Listing, type Offer } from '../lib/barter'
import { invoiceHashOf } from '../lib/invoiceFlow'
import { orderHashOf } from '../lib/orderFlow'
import { changeDemoTables, DEMO_EPOCH, demoTables, type DemoOrder, type DemoTables } from './db'

/**
 * FE-100: the read API of demo mode. Reads come from the demo tables (db.ts), falling back to the sample data for what the demo does not
 * change; the marketplace, invoice and order actions write to the demo tables. Any other write answers `demo_not_simulated`, so nothing
 * half-works and nothing is sent on.
 */
type Body = Record<string, unknown>
const ok = (body: unknown): FixtureReply => ({ status: 200, body })
const fail = (status: number, code: string, message: string): FixtureReply => ({ status, body: { error: { code, message } } })
const notSimulated = (what: string) =>
  fail(409, 'demo_not_simulated', `Demo mode: ${what} is not simulated. Turn demo mode off to do it for real.`)
const randomHex = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')
const demoSignature = () => `ed25519:demo-${randomHex().slice(0, 24)}`
const isoFromSeconds = (s: number) => new Date(s * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')

const BPS = 10_000n
const bpsOf = (v: bigint, bps: number) => (v * BigInt(bps)) / BPS

type Plan = { kind: 'payment' | 'bundle'; breakdown: QuickBreakdown; discount: bigint; searcher: bigint; legs: BundleLeg[]; terms: BundleTerms | null }

/** The SDK's `planOffer` (marketplace-helpers.ts): the same legs and amounts, so the browser's checks before signing pass as they would live. */
function plan(listing: ListingView, offer: OfferView, searcher: string | undefined, shareBps: number): Plan | string {
  const seller = listing.account
  const counterparty = offer.counterparty
  if (!Number.isInteger(shareBps) || shareBps < 0 || shareBps > 10_000) return 'The seeker share must be between 0 and 100%.'
  const v = BigInt(offer.value)
  const discount = bpsOf(v, listing.discountBps)
  const share = searcher ? bpsOf(v, shareBps) : 0n
  if (share > discount) return 'The seeker share must not exceed the discount.'
  const leg = (payer: string, payee: string, amount: bigint): BundleLeg[] => (amount > 0n ? [{ payer, payee, max_amount: String(amount) }] : [])
  let legs: BundleLeg[]
  let breakdown: QuickBreakdown
  let searchLeg: BundleTerms['search_leg']
  if (offer.mode === 'pay') {
    if (!listing.acceptPayment) return 'This listing does not accept payment.'
    breakdown = { mode: 'pay', counterpartyPays: String(v - discount + share), sellerReceives: String(v - discount), searcher: String(share), discount: String(discount) }
    const searchLegs = searcher ? leg(counterparty, searcher, share) : []
    if (searchLegs.length > 0) searchLeg = { payer: counterparty, payee: searcher! }
    legs = [...leg(counterparty, seller, v - discount), ...searchLegs]
    if (legs.length === 1) return { kind: 'payment', breakdown, discount, searcher: share, legs, terms: null }
  } else {
    breakdown = { mode: 'barter', cashback: String(discount - share), searcher: String(share), sellerBears: String(discount), counterpartyGives: String(v) }
    const searchLegs = searcher ? leg(seller, searcher, share) : []
    if (searchLegs.length > 0) searchLeg = { payer: seller, payee: searcher! }
    legs = [...leg(seller, counterparty, BigInt(listing.want.value) + discount - share), ...leg(counterparty, seller, v), ...searchLegs]
  }
  const terms: BundleTerms = { circle: CONTRACT_ID, epoch: DEMO_EPOCH, legs, ...(searchLeg ? { search_leg: searchLeg } : {}) }
  return { kind: 'bundle', breakdown, discount, searcher: share, legs, terms }
}

function toListingView(l: Listing, signature: string, hash: string): ListingView {
  const side = (s: Listing['offer']) => ({ assetType: s.asset_type, assetClass: s.asset_class, quantity: s.quantity, value: s.value })
  return {
    listingHash: hash, account: l.account, offer: side(l.offer), want: side(l.want), terms: l.terms, detail: l.detail, expiresAt: isoFromSeconds(l.expires_at),
    discountBps: l.discount_bps, acceptPayment: l.accept_payment, discoverable: l.discoverable, nonce: l.nonce, signature, status: 'open',
  }
}

function stats(db: DemoTables) {
  const count = (s: ListingView['status']) => db.listings.filter((l) => l.status === s).length
  const sum = (pick: (m: DemoTables['matches'][number]) => string) => db.matches.reduce((t, m) => t + BigInt(pick(m)), 0n)
  const m = marketStats.matches
  return {
    ...marketStats,
    listings: { open: count('open'), matched: count('matched'), cancelled: count('cancelled'), expired: count('expired'), total: db.listings.length },
    matches: {
      count: m.count + db.matches.length,
      payment: m.payment + db.matches.filter((x) => x.kind === 'payment').length,
      bundle: m.bundle + db.matches.filter((x) => x.kind === 'bundle').length,
      pay: m.pay + db.matches.filter((x) => x.mode === 'pay').length,
      barter: m.barter + db.matches.filter((x) => x.mode === 'barter').length,
      listingValue: String(BigInt(m.listingValue) + sum((x) => x.value)),
      discountValue: String(BigInt(m.discountValue) + sum((x) => x.discount)),
    },
    offersPending: db.offers.filter((o) => o.status === 'pending').length,
  }
}

async function read(rest: string, query: URLSearchParams, fixturePath: string): Promise<FixtureReply> {
  const db = await demoTables()
  if (rest === '/listings') {
    const status = query.get('status') ?? 'open'
    const offerType = query.get('offerType')
    return ok({ items: db.listings.filter((l) => (status === 'all' || l.status === status) && (!offerType || l.offer.assetType === offerType)), nextCursor: null })
  }
  const listing = rest.match(/^\/listings\/([0-9a-f]{64})$/)
  if (listing) {
    const found = db.listings.find((l) => l.listingHash === listing[1])
    return found ? ok(found) : fail(404, 'listing_not_found', 'Listing not found')
  }
  const offers = rest.match(/^\/listings\/([0-9a-f]{64})\/offers$/)
  if (offers) return ok({ items: db.offers.filter((o) => o.listingHash === offers[1]) })
  if (rest === '/bundle-proposals') {
    const account = query.get('account')
    return ok({ items: db.proposals.filter((p) => !account || p.participants.includes(account)) })
  }
  if (rest === '/marketplace/stats') return ok(stats(db))
  if (rest === '/invoices') {
    const party = query.get('party')
    const status = query.get('status')
    return ok({ items: db.invoices.filter((i) => (!party || i.document.issuer === party || i.document.debtor === party) && (!status || i.status === status)), nextCursor: null })
  }
  const invoice = rest.match(/^\/invoices\/([0-9a-f]{64})$/)
  if (invoice) {
    const found = db.invoices.find((i) => i.invoice_hash === invoice[1])
    return found ? ok(found) : fail(404, 'invoice_not_found', 'Invoice not found')
  }
  if (rest === '/orders') {
    const party = query.get('party')
    const status = query.get('status')
    return ok({ items: db.orders.filter((o) => (!party || o.order.buyer === party || o.order.seller === party) && (!status || o.status === status)), nextCursor: null })
  }
  const order = rest.match(/^\/orders\/([0-9a-f]{64})$/)
  if (order) {
    const found = db.orders.find((o) => o.order_hash === order[1])
    return found ? ok(found) : fail(404, 'order_not_found', 'Order not found')
  }
  return fixtureReply(fixturePath)
}

async function write(rest: string, body: Body): Promise<FixtureReply> {
  if (rest === '/listings/check' || rest === '/listings') {
    const l = body.listing as Listing
    const hash = await listingHash(l)
    if (rest === '/listings/check') return ok({ valid: true, listingHash: hash, account: l.account, offerAssetType: l.offer.asset_type, expiresAt: l.expires_at, stored: false })
    return changeDemoTables((db) => {
      if (db.listings.some((x) => x.listingHash === hash)) return fail(409, 'listing_exists', 'This listing is already posted.')
      const view = toListingView(l, String(body.signature), hash)
      db.listings.unshift(view)
      return ok(view)
    })
  }
  const cancel = rest.match(/^\/listings\/([0-9a-f]{64})\/cancel$/)
  if (cancel) {
    return changeDemoTables((db) => {
      const l = db.listings.find((x) => x.listingHash === cancel[1])
      if (!l) return fail(404, 'listing_not_found', 'Listing not found')
      if (l.status !== 'open') return fail(409, 'listing_not_open', `The listing is ${l.status}.`)
      l.status = 'cancelled'
      for (const o of db.offers) if (o.listingHash === l.listingHash && o.status === 'pending') o.status = 'closed'
      return ok(l)
    })
  }
  const postOffer = rest.match(/^\/listings\/([0-9a-f]{64})\/offers$/)
  if (postOffer) return offer(postOffer[1]!, body)
  const preview = rest.match(/^\/listings\/([0-9a-f]{64})\/offers\/([0-9a-f]{64})\/(preview|accept)$/)
  if (preview) return accept(preview[1]!, preview[2]!, preview[3] === 'accept', body)
  const sign = rest.match(/^\/bundle-proposals\/([0-9a-f]{64})\/signatures$/)
  if (sign) {
    return changeDemoTables((db) => {
      const p = db.proposals.find((x) => x.termsHash === sign[1])
      if (!p) return fail(404, 'proposal_not_found', 'Bundle proposal not found')
      const account = String(body.account)
      if (!p.participants.includes(account)) return fail(403, 'not_participant', 'This account is not part of the bundle.')
      if (!p.missing.includes(account)) return fail(409, 'already_signed', 'This account has already signed the bundle.')
      p.missing = p.missing.filter((a) => a !== account)
      if (p.missing.length === 0) p.status = 'ready'
      return ok(p)
    })
  }
  if (rest === '/invoices') return createInvoice(body)
  const invoice = rest.match(/^\/invoices\/([0-9a-f]{64})\/(approve|reject)$/)
  if (invoice) {
    return changeDemoTables((db) => {
      const i = db.invoices.find((x) => x.invoice_hash === invoice[1])
      if (!i) return fail(404, 'invoice_not_found', 'Invoice not found')
      if (i.status !== 'requested') return fail(409, 'invoice_not_requested', `The invoice is already ${i.status}.`)
      i.status = invoice[2] === 'approve' ? 'approved' : 'rejected'
      if (invoice[2] === 'reject') i.reject_reason = String((body.notice as Body | undefined)?.reason ?? '') || null
      return ok(i)
    })
  }
  const catchUp = rest.match(/^\/invoices\/([0-9a-f]{64})\/installments\/(\d+)\/catch-up$/)
  if (catchUp) {
    return changeDemoTables((db) => {
      const item = db.invoices.find((x) => x.invoice_hash === catchUp[1])?.installments.find((x) => x.index === Number(catchUp[2]))
      if (!item) return fail(404, 'installment_not_found', 'Installment not found')
      item.status = 'registered'
      return ok({ index: item.index, status: item.status })
    })
  }
  if (rest === '/orders') return createOrder(body)
  const milestone = rest.match(/^\/orders\/([0-9a-f]{64})\/(milestones\/(\d+)|outcomes)$/)
  if (milestone) {
    return changeDemoTables((db) => {
      const order = db.orders.find((x) => x.order_hash === milestone[1])
      if (!order) return fail(404, 'order_not_found', 'Order not found')
      const notice = (body.notice ?? {}) as Body
      const m = order.milestones.find((x) => x.index === Number(milestone[3] ?? notice.milestone))
      if (!m) return fail(404, 'milestone_not_found', 'Milestone not found')
      const action = String(notice.action)
      if (milestone[3] === undefined) m.outcome = action
      else {
        m.status = action
        if (action === 'delivered') {
          m.deliverable_hash = (notice.deliverable_hash as string | null) ?? null
          m.at = Math.floor(Date.now() / 1000)
        }
        if (action === 'disputed') m.dispute_reason = (notice.reason as string | null) ?? null
      }
      if (order.milestones.every((x) => x.status === 'confirmed' || x.status === 'paid' || x.status === 'cancelled')) order.status = 'completed'
      return ok(order)
    })
  }
  if (/^\/orders\/[0-9a-f]{64}\/target-check$/.test(rest)) return ok({ target_verified: true })
  return notSimulated('this step')
}

async function offer(hash: string, body: Body): Promise<FixtureReply> {
  const o = body.offer as Offer
  const hashOf = await offerHash(o)
  const inReplyTo = typeof body.inReplyTo === 'string' ? body.inReplyTo : null
  const counter = await changeDemoTables((db) => {
    const listing = db.listings.find((l) => l.listingHash === hash)
    if (!listing) return { reply: fail(404, 'listing_not_found', 'Listing not found') }
    if (listing.status !== 'open') return { reply: fail(409, 'listing_not_open', `The listing is ${listing.status}.`) }
    const previous = inReplyTo ? db.offers.find((x) => x.offerHash === inReplyTo) : undefined
    if (inReplyTo && (!previous || previous.status !== 'pending' || previous.awaiting !== o.proposer)) return { reply: fail(409, 'offer_not_awaiting', 'That offer is not waiting for this account.') }
    if (!previous && o.proposer === listing.account) return { reply: fail(409, 'own_listing', 'The listing poster must not bid on its own listing.') }
    if (o.mode === 'pay' && !listing.acceptPayment) return { reply: fail(409, 'payment_not_accepted', 'This listing does not accept payment.') }
    const counterparty = previous?.counterparty ?? o.proposer
    if (previous) previous.status = 'countered'
    const view: OfferView = {
      offerHash: hashOf, listingHash: hash, proposer: o.proposer, counterparty, awaiting: o.proposer === listing.account ? counterparty : listing.account,
      round: o.round, mode: o.mode, value: o.value, quantity: o.quantity, deliverBy: isoFromSeconds(o.deliver_by), signature: String(body.signature), inReplyTo, status: 'pending',
    }
    db.offers.push(view)
    return { reply: ok(view), first: !previous ? { listing, view } : undefined }
  })
  // The sample agents answer a first offer at once with a counteroffer halfway to their own price, so the demo account can then accept.
  if (counter.first && counter.first.listing.account !== counter.first.view.proposer) {
    const { listing, view } = counter.first
    const asking = BigInt(listing.offer.value)
    const offered = BigInt(view.value)
    const reply: Offer = {
      circle: CONTRACT_ID, listing_hash: listing.listingHash, proposer: listing.account, round: view.round + 1, mode: view.mode,
      value: String(offered >= asking ? offered : (offered + asking) / 2n), quantity: view.quantity, deliver_by: Math.floor(Date.parse(view.deliverBy) / 1000),
    }
    const replyHash = await offerHash(reply)
    await changeDemoTables((db) => {
      const mine = db.offers.find((x) => x.offerHash === view.offerHash)
      if (!mine || mine.status !== 'pending') return
      mine.status = 'countered'
      db.offers.push({
        offerHash: replyHash, listingHash: listing.listingHash, proposer: listing.account, counterparty: view.counterparty, awaiting: view.counterparty, round: reply.round,
        mode: reply.mode, value: reply.value, quantity: reply.quantity, deliverBy: view.deliverBy, signature: demoSignature(), inReplyTo: view.offerHash, status: 'pending',
      })
    })
  }
  return counter.reply
}

async function accept(hash: string, offerHashValue: string, commit: boolean, body: Body): Promise<FixtureReply> {
  const db = await demoTables()
  const listing = db.listings.find((l) => l.listingHash === hash)
  const offerRow = db.offers.find((o) => o.offerHash === offerHashValue && o.listingHash === hash)
  if (!listing || !offerRow) return fail(404, 'offer_not_found', 'Offer not found')
  const account = String(body.account ?? '')
  if (listing.status !== 'open') return fail(409, 'listing_not_open', `The listing is ${listing.status}.`)
  if (offerRow.status !== 'pending' || offerRow.awaiting !== account) return fail(409, 'offer_not_awaiting', 'That offer is not waiting for this account.')
  const searcher = typeof body.searcher === 'string' && body.searcher !== '' ? body.searcher : undefined
  const p = plan(listing, offerRow, searcher, Number(body.searcherShareBps ?? 0))
  if (typeof p === 'string') return fail(422, 'invalid_offer', p)
  const message = p.terms ? serializeBundleTerms(p.terms) : null
  const termsHash = message ? await sha256Hex(message) : null
  const participants = [...new Set(p.legs.flatMap((l) => [l.payer, l.payee]))]
  if (!commit) {
    const previewBody: AcceptPreview = {
      kind: p.kind, epoch: DEMO_EPOCH, mode: offerRow.mode, discountValue: String(p.discount), searcherValue: String(p.searcher), searcher: searcher ?? null, breakdown: p.breakdown,
      bundle: p.terms && message && termsHash ? { termsHash, message, nonce: termsHash, recipient: CONTRACT_ID, terms: p.terms, participants } : null,
      payment: p.kind === 'payment' ? { payer: p.legs[0]!.payer, payee: p.legs[0]!.payee, amount: p.legs[0]!.max_amount } : null,
    }
    return ok(previewBody)
  }
  if (Number(body.epoch) !== DEMO_EPOCH) return fail(409, 'epoch_changed', 'The epoch changed since the preview. Calculate again.')
  if (p.kind === 'bundle' && typeof body.signature !== 'string') return fail(400, 'signature_required', 'A bundle needs the signature of the accepting account.')
  return changeDemoTables((tables) => {
    const l = tables.listings.find((x) => x.listingHash === hash)!
    const o = tables.offers.find((x) => x.offerHash === offerHashValue)!
    l.status = 'matched'
    o.status = 'accepted'
    for (const other of tables.offers) if (other.listingHash === hash && other.status === 'pending') other.status = 'closed'
    tables.matches.push({ kind: p.kind, mode: o.mode, value: o.value, discount: String(p.discount) })
    if (p.kind === 'payment') {
      const leg = p.legs[0]!
      return ok({ match: { kind: 'payment', termsHash: null }, offer: o, result: { kind: 'payment', payer: leg.payer, payee: leg.payee, amount: leg.max_amount } })
    }
    // The sample agents sign their side of the bundle straight away, so the accepted bundle is ready for the solver.
    const proposal: BundleProposal = { termsHash: termsHash!, status: 'ready', epoch: DEMO_EPOCH, terms: p.terms!, participants, missing: [], listingHash: hash }
    tables.proposals.unshift(proposal)
    return ok({ match: { kind: 'bundle', termsHash }, offer: o, result: { kind: 'bundle', proposal } })
  })
}

async function createInvoice(body: Body): Promise<FixtureReply> {
  const document = body.document as Parameters<typeof invoiceHashOf>[0] & { issuer: string; debtor: string; amount: string; id: string; memo: string }
  const hash = await invoiceHashOf(document)
  const count = Number(body.installments) || 1
  const total = BigInt(document.amount)
  const part = total / BigInt(count)
  return changeDemoTables((db) => {
    if (db.invoices.some((i) => i.invoice_hash === hash)) return fail(409, 'invoice_exists', 'This invoice already exists.')
    db.invoices.unshift({
      invoice_hash: hash, document: { ...document }, status: 'requested', needs_bond: false,
      installments: Array.from({ length: count }, (_, k) => ({
        index: k + 1, epoch: DEMO_EPOCH + 2 + k, amount: String(k === count - 1 ? total - part * BigInt(count - 1) : part), status: 'scheduled', reason: null, voucherEpoch: DEMO_EPOCH + 2 + k, shifted: false,
      })),
    })
    return ok({ invoice_hash: hash })
  })
}

async function createOrder(body: Body): Promise<FixtureReply> {
  const order = body.order as Parameters<typeof orderHashOf>[0] & { buyer: string; seller: string; target: string | null; milestones: Array<{ amount: string; due_at: number }> }
  const hash = await orderHashOf(order)
  const signedBy = Array.isArray(body.signatures) ? (body.signatures as Array<{ account: string }>).map((s) => s.account) : []
  return changeDemoTables((db) => {
    if (db.orders.some((o) => o.order_hash === hash)) return fail(409, 'order_exists', 'This order already exists.')
    const row: DemoOrder = {
      order_hash: hash, order: { ...order }, status: signedBy.includes(order.seller) ? 'active' : 'pending', needs_bond: false, target_verified: order.target ? false : null,
      ...(body.mandate ? { mandate: body.mandate } : {}), signed_by: signedBy,
      milestones: order.milestones.map((m, k) => ({ index: k + 1, amount: m.amount, due_at: m.due_at, status: 'open', deliverable_hash: null, at: null })),
    }
    db.orders.unshift(row)
    return ok({ order_hash: hash })
  })
}

/** Answers one read API request of demo mode. `path` is the URL path and query after the API host. */
export async function demoReply(path: string, method: string, bodyText: string | null): Promise<FixtureReply> {
  const url = new URL(path, 'http://demo')
  const prefix = `/x207/circles/${encodeURIComponent(CIRCLE)}`
  const inCircle = url.pathname.startsWith(prefix)
  const rest = inCircle ? url.pathname.slice(prefix.length) : url.pathname
  // The sample data is stored under the fixture circle; the demo serves it under whatever circle this build names.
  const fixturePath = inCircle ? `/x207/circles/agents-main${rest}${url.search}` : path
  if (method === 'GET' || method === 'HEAD') return read(inCircle ? rest : '', url.searchParams, fixturePath)
  if (!inCircle) return notSimulated(url.pathname.startsWith('/x207/faucet') ? 'the test-funds faucet' : url.pathname.startsWith('/x207/settlement') ? 'moving funds' : 'this step')
  let body: Body = {}
  try {
    body = bodyText ? (JSON.parse(bodyText) as Body) : {}
  } catch {
    return fail(400, 'invalid_json', 'The request body is not JSON.')
  }
  return write(rest, body)
}
