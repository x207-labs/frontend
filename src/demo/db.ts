import { epochs, invoices, listings, orders } from '../api/fixtures'
import type { BundleLeg, BundleProposal, ListingView, OfferView } from '../api/types'
import { CONTRACT_ID } from '../config'
import { serializeBundleTerms, sha256Hex } from '../lib/barter'
import { readDemoTables, writeDemoTables } from './mode'

/**
 * FE-100: the demo tables. They are a JSON document in sessionStorage (`x207.demo.db`), seeded from the sample data and changed only by
 * the demo request handler (api.ts). They share nothing with the read API's database, the account service or the chain: a click in demo
 * mode writes here and nowhere else.
 */
export type DemoInstallment = { index: number; epoch: number; amount: string; status: string; reason: string | null; voucherEpoch: number; shifted: boolean }
export type DemoInvoice = {
  invoice_hash: string
  document: { id: string; issuer: string; debtor: string; amount: string; memo: string } & Record<string, unknown>
  status: string
  needs_bond: boolean
  reject_reason?: string | null
  installments: DemoInstallment[]
}
export type DemoMilestone = {
  index: number
  amount: string
  due_at: number
  status: string
  deliverable_hash: string | null
  at: number | null
  outcome?: string | null
  dispute_reason?: string | null
}
export type DemoOrder = {
  order_hash: string
  order: { buyer: string; seller: string } & Record<string, unknown>
  status: string
  needs_bond: boolean
  target_verified: boolean | null
  mandate?: unknown
  signed_by?: string[]
  milestones: DemoMilestone[]
}
export type DemoTx = { hash: string; signer: string; receiverId: string; methodName: string; at: string }
export type DemoAccount = {
  profile: { display_name: string } | null
  onboarding: { wallet_created: boolean; funds_received: boolean; joined: boolean; staked: boolean; tour_done: boolean } | null
  prefs: { email: string | null; deadline_reminder: boolean } | null
}
export type DemoTables = {
  version: 1
  listings: ListingView[]
  offers: OfferView[]
  proposals: BundleProposal[]
  invoices: DemoInvoice[]
  orders: DemoOrder[]
  /** Accepted matches made in this demo, added to the sample marketplace stats. */
  matches: Array<{ kind: 'payment' | 'bundle'; mode: 'pay' | 'barter'; value: string; discount: string }>
  feedback: Array<{ page: string; message: string; at: string }>
  txs: DemoTx[]
  account: DemoAccount
}

const near = (name: string) => `${name}.x207-circle.near`
export const DEMO_EPOCH = epochs[0]!.epoch
/** Sample hashes, like the fixtures': not computed from a signed listing or offer. */
export const DEMO_LISTING = 'd1'.repeat(32)
export const DEMO_OFFER = 'e1'.repeat(32)
export const MATCHED_LISTING = 'c7'.repeat(32)
const sample = (name: string) => `ed25519:demo-${name}`

async function seed(): Promise<DemoTables> {
  const me = near('scraper')
  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  // The demo account's own listing, with a barter offer from the GPU agent waiting for its answer, so Accept works on the first visit.
  const own: ListingView = {
    listingHash: DEMO_LISTING, account: me,
    offer: { assetType: 'scraped-pages', assetClass: 'C', quantity: 20000, value: '80000000' },
    want: { assetType: 'gpu-hours', assetClass: 'A', quantity: 4, value: '80000000' },
    terms: 'pages delivered as JSON lines', detail: '20k product pages, refreshed daily', expiresAt: inDays(5),
    discountBps: 500, acceptPayment: true, discoverable: true, nonce: 'demo-1', signature: sample('listing-1'), status: 'open',
  }
  const matched: ListingView = {
    listingHash: MATCHED_LISTING, account: near('summarizer'),
    offer: { assetType: 'summarize-calls', assetClass: 'D', quantity: 3000, value: '45000000' },
    want: { assetType: 'scraped-pages', assetClass: 'C', quantity: 10000, value: '45000000' },
    terms: 'delivery within 3 days', detail: '3000 summaries of crawled pages', expiresAt: inDays(4),
    discountBps: 0, acceptPayment: false, discoverable: true, nonce: 'demo-2', signature: sample('listing-2'), status: 'matched',
  }
  const offer: OfferView = {
    offerHash: DEMO_OFFER, listingHash: DEMO_LISTING, proposer: near('gpu'), counterparty: near('gpu'), awaiting: me, round: 1, mode: 'barter',
    value: '80000000', quantity: 20000, deliverBy: inDays(3), signature: sample('offer-1'), inReplyTo: null, status: 'pending',
  }
  const acceptedOffer: OfferView = {
    offerHash: 'c8'.repeat(32), listingHash: MATCHED_LISTING, proposer: me, counterparty: me, awaiting: near('summarizer'), round: 1, mode: 'barter',
    value: '45000000', quantity: 3000, deliverBy: inDays(3), signature: sample('offer-2'), inReplyTo: null, status: 'accepted',
  }
  // A bundle the summarizer already signed: the demo account's signature is the one missing.
  const legs: BundleLeg[] = [
    { payer: near('summarizer'), payee: me, max_amount: '45000000' },
    { payer: me, payee: near('summarizer'), max_amount: '45000000' },
  ]
  const terms = { circle: CONTRACT_ID, epoch: DEMO_EPOCH, legs }
  const proposal: BundleProposal = {
    termsHash: await sha256Hex(serializeBundleTerms(terms)), status: 'proposed', epoch: DEMO_EPOCH, terms,
    participants: [me, near('summarizer')], missing: [me], listingHash: MATCHED_LISTING,
  }
  return {
    version: 1,
    listings: [own, ...structuredClone(listings) as ListingView[], matched],
    offers: [offer, acceptedOffer],
    proposals: [proposal],
    invoices: structuredClone(invoices) as DemoInvoice[],
    orders: structuredClone(orders) as unknown as DemoOrder[],
    matches: [],
    feedback: [],
    txs: [],
    account: {
      profile: { display_name: 'Demo scraper' },
      onboarding: { wallet_created: true, funds_received: true, joined: true, staked: true, tour_done: false },
      prefs: { email: null, deadline_reminder: true },
    },
  }
}

function parse(json: string | null): DemoTables | null {
  if (!json) return null
  try {
    const value = JSON.parse(json) as Partial<DemoTables>
    return value.version === 1 && Array.isArray(value.listings) ? (value as DemoTables) : null
  } catch {
    return null
  }
}

let tables: Promise<DemoTables> | null = null

/** The demo tables of this tab, seeded on first use. One copy in memory, so handlers that run at the same time see each other's writes. */
export function demoTables(): Promise<DemoTables> {
  tables ??= (async () => {
    const saved = parse(readDemoTables())
    if (saved) return saved
    const fresh = await seed()
    writeDemoTables(JSON.stringify(fresh))
    return fresh
  })()
  return tables
}

/** Runs one change on the demo tables and stores them again. */
export async function changeDemoTables<T>(change: (db: DemoTables) => T): Promise<T> {
  const db = await demoTables()
  const result = change(db)
  writeDemoTables(JSON.stringify(db))
  return result
}

export function recordDemoTx(tx: DemoTx): void {
  void changeDemoTables((db) => {
    db.txs.unshift(tx)
  })
}

/** Tests only: forget the copy in memory so the next read loads (or seeds) again. */
export function resetDemoTablesCache(): void {
  tables = null
}
