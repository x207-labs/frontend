// @vitest-environment node
// FE-033 against the REAL transfer ledger of the backend (BE-074), in process: the frontend library of the page (the document, the listing detail, the rebuild of the document from the
// signed listing, the voucher signed the way the browser signs it, the notices, the normaliser of the answer) talks over HTTP to the real backend with its real checks of the voucher,
// the hash of the document, the TXT proofs and the signed notices. The platforms (DNS over HTTPS, the registry RDAP, Steam) are a fake "internet" behind the SSRF guard of the backend.
// The page itself is covered with mocks in src/pages/Transfers.test.tsx; this file shows that what the page sends is what the backend accepts, and that the answers have the shape that
// the page reads. It needs the repositories `agents` and `backend` next to this one (the same fixtures as the agents) and is skipped without them.
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { listingHash, signListing, type Listing } from '@x207/core'
import { toTransferView } from '../api/transferView'
import { signSellerNotice } from '../lib/licenseFlow'
import { buildTransferPurchase, parseTransferListing, prepareTransfer, sellTxt, transferNotice } from '../lib/transferFlow'

const FIXTURES = fileURLToPath(new URL('../../../agents/test/backend-fixtures.ts', import.meta.url))
const BACKEND_DIR = fileURLToPath(new URL('../../../backend/', import.meta.url))
const AVAILABLE = existsSync(FIXTURES) && existsSync(`${BACKEND_DIR}node_modules/better-sqlite3`)

type Fx = { CONTRACT: string; CIRCLE_ID: string; acct: (n: string) => string; startMarket: (names: string[], options: Record<string, unknown>) => Promise<any> }
const credit = (n: number): string => (BigInt(n) * 1_000_000n).toString()

describe.skipIf(!AVAILABLE)('FE-033 the page library against the real transfer ledger (BE-074)', () => {
  let market: any
  afterEach(async () => {
    await market?.srv.close()
    market?.db.close()
  })
  const dns = new Map<string, string[]>()
  const rdap = new Map<string, unknown>()
  const steam = new Map<string, unknown>()
  const reply = (status: number, body: unknown) => ({ status, body: Buffer.from(JSON.stringify(body)), truncated: false })
  const transport = async ({ host, path }: { host: string; path: string }) => {
    if (host === 'dns.google') {
      const name = new URL(`https://x${path}`).searchParams.get('name') ?? ''
      const records = dns.get(name)
      return records === undefined ? reply(200, { Status: 3 }) : reply(200, { Status: 0, Answer: records.map((r) => ({ name, type: 16, TTL: 60, data: `"${r}"` })) })
    }
    if (host === 'rdap.verisign.com') return rdap.has(path.split('/').pop() ?? '') ? reply(200, rdap.get(path.split('/').pop() ?? '')) : reply(404, null)
    if (host === 'api.steampowered.com') {
      const id = new URL(`https://x${path}`).searchParams.get('tradeofferid') ?? ''
      return reply(200, { response: steam.has(id) ? { offer: steam.get(id) } : {} })
    }
    return { status: 404, body: Buffer.alloc(0), truncated: false }
  }
  const resolver = async () => ['93.184.216.34']

  async function start() {
    dns.clear()
    rdap.clear()
    steam.clear()
    const fx = (await import(/* @vite-ignore */ pathToFileURL(FIXTURES).href)) as Fx
    const { DnsTxtProof, TradeApiProof } = await import(/* @vite-ignore */ pathToFileURL(`${BACKEND_DIR}src/marketplace/transfer-proofs.ts`).href)
    market = await fx.startMarket(['andi', 'budi'], {
      dnsTxt: new DnsTxtProof({ resolver, transport }), tradeApi: new TradeApiProof({ apiKey: 'STEAM-KEY-TEST', baseUrl: 'https://api.steampowered.com', resolver, transport }), proofMinSeconds: 0,
    })
    const base = `${market.srv.url}/x207/circles/${fx.CIRCLE_ID}`
    const call = async (method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; json: any }> => {
      const res = await fetch(`${base}${path}`, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
      return { status: res.status, json: await res.json() }
    }
    const now = () => Math.floor(market.clock.now / 1000)
    return { fx, call, now, circle: fx.CONTRACT, seller: fx.acct('andi'), buyer: fx.acct('budi'), keys: market.keys as Record<string, { secretKey: string }> }
  }

  /** The listing as the page makes it for the Marketplace form: the detail of the page, signed by the seller. */
  function listingOf(env: Awaited<ReturnType<typeof start>>, prepared: ReturnType<typeof prepareTransfer>) {
    const listing: Listing = {
      circle: env.circle, account: env.seller, offer: { asset_type: prepared.assetType, asset_class: 'B', quantity: 1, value: prepared.document.value },
      want: { asset_type: 'usdc', asset_class: 'A', quantity: 1, value: prepared.document.value }, terms: 'transfer through the platform', detail: prepared.detail,
      expires_at: env.now() + 30 * 86_400, discount_bps: 0, accept_payment: true, discoverable: true, nonce: `l-${prepared.document.nonce}`,
    }
    return { listing, hash: listingHash(listing), signature: (secretKey: string) => signListing(listing, secretKey as `ed25519:${string}`) }
  }

  it('TC-FE-033-11 a domain end to end with the library of the page: TXT of the seller before the listing, the listing rebuilt from the answer of the backend, the voucher of the browser accepted, the proof, the voucher released', async () => {
    const env = await start()
    const prepared = prepareTransfer({ circle: env.circle, seller: env.seller, platform: 'domain', transferRef: 'page-shop.com', estimateSeconds: 3600, value: credit(40), nonce: 'dom1' })
    const l = listingOf(env, prepared)
    // the seller has not set the TXT: the backend refuses the listing and the page tells the seller to set it
    const refused = await env.call('POST', '/listings', { listing: l.listing, signature: l.signature(env.keys.andi!.secretKey) })
    expect(refused.json.error.code).toBe('transfer_seller_unproven')
    dns.set('page-shop.com', [sellTxt(l.hash)])
    expect((await env.call('POST', '/listings', { listing: l.listing, signature: l.signature(env.keys.andi!.secretKey) })).status).toBe(201)

    // the buyer reads the listing from the backend: the page rebuilds the document and it hashes to transfer_doc
    const shown = await env.call('GET', `/listings/${l.hash}`)
    const parsed = parseTransferListing(env.circle, shown.json)
    expect(parsed).toMatchObject({ documentHash: prepared.documentHash, needsBond: false, windowSeconds: 604_800 })

    // the voucher is signed the way the browser signs it and the backend accepts it
    const built = await buildTransferPurchase({ listing: parsed!, buyer: env.buyer, epoch: 42, state: { seq: 0, cumulativeAmount: '0' }, secretKey: env.keys.budi!.secretKey })
    const bought = await env.call('POST', `/listings/${l.hash}/transfers`, { voucher: built.voucher, signature: built.signature })
    expect(bought.status).toBe(201)
    const view = toTransferView(bought.json)
    expect(view).toMatchObject({ status: 'paid_held', platform: 'domain', proofMethod: 'dns_txt', transferRef: 'page-shop.com', buyer: env.buyer, seller: env.seller, voucher: null })
    // UM-096 (backend): the own TXT is `x207-own=<id>-<token>`, a token that only the buyer's voucher can produce; the page shows what the backend says, so the test takes it from the answer
    const own = view.instructions!.setTxtAfterTransfer
    expect(view.instructions).toEqual({ setTxtAfterTransfer: expect.stringMatching(new RegExp(`^x207-own=${view.transferId}-[0-9a-f]{32}$`)), on: 'page-shop.com' })
    expect(view.windowUntil - env.now()).toBe(604_800)

    // the proof: nothing yet (pending, with what is missing), then the TXT of the buyer and a live domain at the registry
    const early = await env.call('POST', `/transfers/${view.transferId}/proof`, {})
    expect([early.status, early.json.error.code, typeof early.json.error.details.want]).toEqual([409, 'transfer_proof_pending', 'string'])
    expect(early.json.error.details.want).toMatch(/x207-own TXT record/) // the backend does not show the value again; the buyer has it from the answer of the purchase
    dns.set('page-shop.com', [sellTxt(l.hash), own])
    rdap.set('page-shop.com', { ldhName: 'page-shop.com', status: ['active'] })
    const done = await env.call('POST', `/transfers/${view.transferId}/proof`, {})
    expect(done.status).toBe(200)
    expect(toTransferView(done.json)).toMatchObject({ status: 'confirmed', voucher: { payer: env.buyer, payee: env.seller, cumulativeAmount: credit(40), seq: 1 } })
  })

  it('TC-FE-033-12 a ticket: the notice of the page is accepted (keys in the order of the backend, signed in the browser way), the buyer confirms and the voucher is released; a cancelled transfer says why', async () => {
    const env = await start()
    const sell = async (ref: string, nonce: string) => {
      const prepared = prepareTransfer({ circle: env.circle, seller: env.seller, platform: 'ticket', transferRef: ref, estimateSeconds: 3600, value: credit(20), nonce })
      const l = listingOf(env, prepared)
      expect((await env.call('POST', '/listings', { listing: l.listing, signature: l.signature(env.keys.andi!.secretKey) })).status).toBe(201)
      const parsed = parseTransferListing(env.circle, (await env.call('GET', `/listings/${l.hash}`)).json)!
      return { l, parsed }
    }
    const first = await sell('Concert A, row 4 seat 12', 'tk1')
    const built = await buildTransferPurchase({ listing: first.parsed, buyer: env.buyer, epoch: 42, state: { seq: 0, cumulativeAmount: '0' }, secretKey: env.keys.budi!.secretKey })
    const bought = toTransferView((await env.call('POST', `/listings/${first.l.hash}/transfers`, { voucher: built.voucher, signature: built.signature })).json)
    expect(bought).toMatchObject({ status: 'paid_held', platform: 'ticket', proofMethod: 'buyer_confirm' })
    const confirm = transferNotice(env.circle, bought.transferId, env.buyer, 'confirmed', env.now())
    const confirmed = await env.call('POST', `/transfers/${bought.transferId}`, { notice: confirm, signature: await signSellerNotice(confirm, env.circle, env.keys.budi!.secretKey) })
    expect(confirmed.status).toBe(201)
    expect(toTransferView(confirmed.json)).toMatchObject({ status: 'confirmed', voucher: { cumulativeAmount: credit(20) } })

    // a second ticket from the same seller: the voucher continues from the held one; the buyer cancels it
    const second = await sell('Concert B, row 1 seat 1', 'tk2')
    const built2 = await buildTransferPurchase({ listing: second.parsed, buyer: env.buyer, epoch: 42, state: { seq: 1, cumulativeAmount: credit(20) }, secretKey: env.keys.budi!.secretKey })
    const bought2 = toTransferView((await env.call('POST', `/listings/${second.l.hash}/transfers`, { voucher: built2.voucher, signature: built2.signature })).json)
    expect(built2.voucher).toMatchObject({ seq: 2, cumulativeAmount: credit(40) })
    const cancel = transferNotice(env.circle, bought2.transferId, env.buyer, 'cancelled', env.now())
    const cancelled = toTransferView((await env.call('POST', `/transfers/${bought2.transferId}`, { notice: cancel, signature: await signSellerNotice(cancel, env.circle, env.keys.budi!.secretKey) })).json)
    expect(cancelled).toMatchObject({ status: 'cancelled', cancelReason: 'cancelled_by_buyer', voucher: null })
    // the page never asks the ticket for a proof of the platform: the backend says that a ticket is proved by the buyer
    const asked = await env.call('POST', `/transfers/${bought2.transferId}/proof`, {})
    expect(asked.json.error.code).not.toBe(undefined)
  })

  it('TC-FE-033-13 a game item: buyer_ref and the trade offer id go as the page sends them, the proof is pending while the offer is not accepted, then confirmed', async () => {
    const env = await start()
    const prepared = prepareTransfer({ circle: env.circle, seller: env.seller, platform: 'game_item', transferRef: '730:1234567890', estimateSeconds: 3600, value: credit(12), nonce: 'gm1' })
    const l = listingOf(env, prepared)
    expect((await env.call('POST', '/listings', { listing: l.listing, signature: l.signature(env.keys.andi!.secretKey) })).status).toBe(201)
    const parsed = parseTransferListing(env.circle, (await env.call('GET', `/listings/${l.hash}`)).json)!
    const built = await buildTransferPurchase({ listing: parsed, buyer: env.buyer, epoch: 42, state: { seq: 0, cumulativeAmount: '0' }, secretKey: env.keys.budi!.secretKey })
    const noRef = await env.call('POST', `/listings/${l.hash}/transfers`, { voucher: built.voucher, signature: built.signature })
    expect(noRef.status).toBeGreaterThanOrEqual(400) // a game item needs the Steam account of the buyer
    const bought = toTransferView((await env.call('POST', `/listings/${l.hash}/transfers`, { voucher: built.voucher, signature: built.signature, buyer_ref: '555' })).json)
    expect(bought).toMatchObject({ status: 'paid_held', platform: 'game_item', proofMethod: 'trade_api', tradeOfferId: null })
    const pending = await env.call('POST', `/transfers/${bought.transferId}/proof`, { tradeoffer_id: '5551234' })
    expect(pending.json.error.code).toBe('transfer_proof_pending')
    const after = toTransferView((await env.call('GET', `/transfers/${bought.transferId}`)).json)
    expect(after.tradeOfferId).toBe('5551234') // fixed after the first check, as the page shows it
    steam.set('5551234', { trade_offer_state: 3, accountid_other: 555, items_to_give: [{ appid: 730, assetid: '1234567890' }], time_escrow_end: 0 })
    const done = await env.call('POST', `/transfers/${bought.transferId}/proof`, {})
    expect([done.status, toTransferView(done.json).status]).toEqual([200, 'confirmed'])
  })
})
