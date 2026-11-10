import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_URL } from '../account/client'
import { api, ApiError } from '../api/client'
import { API_URL, CONTRACT_ID, NEAR_RPC_URL } from '../config'
import { checkBundleToSign, serializeBundleTerms, sha256Hex, type Offer } from '../lib/barter'
import { DEMO_LISTING, DEMO_OFFER, MATCHED_LISTING, demoTables, resetDemoTablesCache } from './db'
import { demoFromQuery, DEMO_DB_KEY } from './mode'
import { demoFetch, routeOf } from './network'
import { DEMO_ACCOUNT, demoWalletPort } from './wallet'

const original = window.fetch
const real = vi.fn<typeof fetch>(async () => new Response('{}'))

beforeEach(() => {
  sessionStorage.clear()
  resetDemoTablesCache()
  real.mockClear()
  window.fetch = demoFetch(real)
})
afterEach(() => {
  window.fetch = original
})

describe('FE-100 demo mode switch', () => {
  it('reads ?demo= on and off, and ignores anything else', () => {
    expect(demoFromQuery('?demo=1')).toBe(true)
    expect(demoFromQuery('?demo=on')).toBe(true)
    expect(demoFromQuery('?demo=0')).toBe(false)
    expect(demoFromQuery('?demo=off')).toBe(false)
    expect(demoFromQuery('?demo=yes')).toBeNull()
    expect(demoFromQuery('')).toBeNull()
  })
})

describe('FE-100 demo network', () => {
  it('routes the read API, the chain and the account service inside the tab and blocks every other origin', () => {
    expect(routeOf(`${API_URL}/x207/circles/agents-main/listings`)).toBe('api')
    expect(routeOf(NEAR_RPC_URL)).toBe('rpc')
    expect(routeOf(ACCOUNT_URL)).toBe('account')
    expect(routeOf('/assets/index.js')).toBe('pass')
    expect(routeOf('https://example.com/collect')).toBe('blocked')
  })

  it('refuses a request to another origin without sending it', async () => {
    await expect(fetch('https://example.com/collect', { method: 'POST', body: '{}' })).rejects.toThrow(/Demo mode: requests to https:\/\/example\.com are off/)
    expect(real).not.toHaveBeenCalled()
  })

  it('answers contract views from the sample chain and never reaches the RPC', async () => {
    const res = await fetch(NEAR_RPC_URL, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'view_account', account_id: DEMO_ACCOUNT } }) })
    const body = (await res.json()) as { error?: { cause?: { name?: string } } }
    expect(body.error?.cause?.name).toBe('DEMO_MODE')
    expect(real).not.toHaveBeenCalled()
  })

  it('keeps the account row in the demo tables', async () => {
    const send = (action: string, data: object) =>
      fetch(ACCOUNT_URL, { method: 'POST', body: JSON.stringify({ action, data, accountId: DEMO_ACCOUNT }) }).then((r) => r.json() as Promise<Record<string, unknown>>)
    expect((await send('get', {})).profile).toEqual({ display_name: 'Demo scraper' })
    await send('upsert_profile', { display_name: 'Renamed' })
    expect((await send('get', {})).profile).toEqual({ display_name: 'Renamed' })
    await send('feedback', { page: '/marketplace', message: 'hello' })
    expect((await demoTables()).feedback[0]).toMatchObject({ page: '/marketplace', message: 'hello' })
    expect(sessionStorage.getItem(DEMO_DB_KEY)).toContain('Renamed')
    expect(real).not.toHaveBeenCalled()
  })

  it('answers demo_not_simulated for writes it does not play, such as the faucet', async () => {
    const error = await api.faucetClaim(DEMO_ACCOUNT).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('demo_not_simulated')
  })
})

describe('FE-100 demo barter', () => {
  it('accepts the seeded barter offer with terms that pass the checks before signing', async () => {
    const offers = await api.offers(DEMO_LISTING)
    const waiting = offers.items.find((o) => o.offerHash === DEMO_OFFER)!
    expect(waiting).toMatchObject({ status: 'pending', awaiting: DEMO_ACCOUNT, mode: 'barter' })
    const preview = await api.previewAccept(DEMO_LISTING, DEMO_OFFER, { account: DEMO_ACCOUNT })
    expect(preview.kind).toBe('bundle')
    const bundle = preview.bundle!
    expect(await sha256Hex(bundle.message)).toBe(bundle.termsHash)
    expect(checkBundleToSign({ message: bundle.message, recipient: bundle.recipient, account: DEMO_ACCOUNT, contract: CONTRACT_ID, epoch: preview.epoch, breakdown: preview.breakdown })).toMatchObject({ ok: true })
    const { signature } = await demoWalletPort.signMessage(DEMO_ACCOUNT, { message: bundle.message, recipient: bundle.recipient, nonce: new Uint8Array(32) })
    const result = await api.accept(DEMO_LISTING, DEMO_OFFER, { account: DEMO_ACCOUNT, epoch: preview.epoch, signature })
    expect(result.result).toMatchObject({ kind: 'bundle' })
    expect((await api.listing(DEMO_LISTING)).status).toBe('matched')
    const proposals = await api.proposals(DEMO_ACCOUNT)
    expect(proposals.items.find((p) => p.termsHash === bundle.termsHash)).toMatchObject({ status: 'ready', missing: [] })
    expect(real).not.toHaveBeenCalled()
  })

  it('signs the seeded proposal that waits for the demo account', async () => {
    const proposal = (await api.proposals(DEMO_ACCOUNT)).items.find((p) => p.listingHash === MATCHED_LISTING)!
    expect(proposal.missing).toEqual([DEMO_ACCOUNT])
    const message = serializeBundleTerms(proposal.terms)
    expect(await sha256Hex(message)).toBe(proposal.termsHash)
    expect(checkBundleToSign({ message, recipient: CONTRACT_ID, account: DEMO_ACCOUNT, contract: CONTRACT_ID, epoch: proposal.epoch })).toMatchObject({ ok: true })
    const signed = await api.signProposal(proposal.termsHash, DEMO_ACCOUNT, 'ed25519:demo')
    expect(signed).toMatchObject({ status: 'ready', missing: [] })
  })

  it('answers a first offer on a sample listing with a counteroffer the demo account can accept', async () => {
    const listing = (await api.listings({})).items.find((l) => l.account !== DEMO_ACCOUNT && l.status === 'open' && l.listingHash !== DEMO_LISTING)!
    const low = (BigInt(listing.offer.value) / 2n).toString()
    const offer: Offer = { circle: CONTRACT_ID, listing_hash: listing.listingHash, proposer: DEMO_ACCOUNT, round: 1, mode: 'barter', value: low, quantity: listing.offer.quantity, deliver_by: Math.floor(Date.now() / 1000) + 86_400 }
    const mine = await api.postOffer(listing.listingHash, offer, 'ed25519:demo')
    const items = (await api.offers(listing.listingHash)).items
    expect(items.find((o) => o.offerHash === mine.offerHash)?.status).toBe('countered')
    const counter = items.find((o) => o.inReplyTo === mine.offerHash)!
    expect(counter).toMatchObject({ status: 'pending', awaiting: DEMO_ACCOUNT, round: 2, proposer: listing.account })
    expect(BigInt(counter.value)).toBeGreaterThan(BigInt(low))
  })
})
