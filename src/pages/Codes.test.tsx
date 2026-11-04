import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkCheatProof, contentHash, codeDocumentHash, codeCommitment, codePayload, createRelease, createCodeRelease, encryptCode, encryptContent, generateVoucherKeypair, licensePublicKey, listingHash, signListing, verifyVoucher,
  voucherPublicKey, type CodeDocument, type ContentSource,
} from '@x207/core'
import { base58Encode } from '../lib/barter'
import { licenseSources } from '../lib/licenseFlow'
import { parseCodeListing, prepareCode, disputeSecondsLeft, pairStateWithHeld, rememberHeld, recallHeld, forgetHeld } from '../lib/codeFlow'
import { describeMarketError } from '../lib/marketError'
import { ApiError } from '../api/client'
import { renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const CIRCLE = 'x207-circle.testnet'
const SELLER = 'seller.x207-circle.near'
const BUYER = 'buyer.x207-circle.near'
const SEED = Uint8Array.from(new Array<number>(32).fill(5))
const KEY = `ed25519:${base58Encode(SEED)}`
const seller = generateVoucherKeypair()
const CODE = 'GIFT-7QK2-M9XD-41LP'
const SALT = new Uint8Array(32).fill(9)
const text = (s: string) => new TextEncoder().encode(s)
const original = licenseSources.current
afterEach(() => {
  licenseSources.current = original
})

const docOf = (over: Partial<CodeDocument> = {}): CodeDocument => ({ circle: CIRCLE, seller: SELLER, code_commitment: codeCommitment(CODE, SALT), issuer: 'shop.example', value: '5000000', verifiable: false, arbiter: null, nonce: 'n1', ...over })
const rpcResult = (value: unknown) => ({ status: 200, body: { jsonrpc: '2.0', id: 'x207', result: { result: Array.from(new TextEncoder().encode(JSON.stringify(value))) } } })
const rpcMethod = (init?: RequestInit): string | undefined => (init?.body ? (JSON.parse(String(init.body)) as { params?: { method_name?: string } }).params?.method_name : undefined)

/** A signed listing of a code, as the read API would answer it. */
function signedCodeListing(sellerKeys: { secretKey: string }, detailOver: Record<string, unknown> = {}, value = '5000000') {
  const detail = JSON.stringify({ kind: 'code', code_doc: 'd'.repeat(64), code_commitment: codeCommitment(CODE, SALT), issuer: 'shop.example', value, verifiable: false, ...detailOver })
  const listing = {
    circle: CIRCLE, account: SELLER, offer: { asset_type: 'code:gift', asset_class: 'D' as const, quantity: 1, value }, want: { asset_type: 'x', asset_class: 'D' as const, quantity: 1, value },
    terms: '', detail, expires_at: 1_893_456_000, discount_bps: 0, accept_payment: true, discoverable: true, nonce: 'n1',
  }
  const view = {
    listingHash: listingHash(listing), account: listing.account, offer: { assetType: 'code:gift', assetClass: 'D', quantity: 1, value }, want: { assetType: 'x', assetClass: 'D', quantity: 1, value },
    terms: '', detail, expiresAt: '2030-01-01T00:00:00Z', discountBps: 0, acceptPayment: true, discoverable: true, nonce: 'n1', signature: signListing(listing, sellerKeys.secretKey as `ed25519:${string}`), status: 'open',
  }
  return { typed: listingHash(listing), view }
}

/** A purchase with the key released: the code `data` encrypted, the release for the buyer, and a fake https source that serves it. */
function delivered(data: string, claimed = CODE, disputeUntil = 4_000_000_000) {
  const doc = docOf()
  const enc = data === claimed ? encryptCode(claimed, { salt: SALT }) : { ...encryptContent(codePayload(data, SALT)) }
  const { release, signature } = data === claimed
    ? createCodeRelease({ doc, code: claimed, salt: SALT, buyer: BUYER, buyerPublicKey: licensePublicKey(KEY), purchase_id: 'p1', ciphertext: enc.ciphertext, contentKey: enc.key, at: 1_800_000_000, sellerSecretKey: seller.secretKey })
    : createRelease({ circle: CIRCLE, license_hash: codeDocumentHash(doc), buyer: BUYER, buyerPublicKey: licensePublicKey(KEY), content_hash: codeCommitment(claimed, SALT), content_size: 32 + text(data).length, purchase_id: 'p1', ciphertext: enc.ciphertext, contentKey: enc.key, at: 1_800_000_000, sellerSecretKey: seller.secretKey })
  const source: ContentSource = { kind: 'https', fetch: async () => enc.ciphertext }
  licenseSources.current = { https: source }
  return { purchase_id: 'p1', listing_hash: 'a'.repeat(64), buyer: BUYER, seller: SELLER, status: 'key_released', content_hash: codeCommitment(claimed, SALT), source: { kind: 'https', ref: 'https://cdn.example.com/c.enc' }, cipher_hash: release.cipher_hash, release, release_signature: signature, dispute_until: disputeUntil }
}
/** The listing that the purchases of these tests were made from: its detail rebuilds the code document that the release is for (docOf), as the buyer page does (B6-F4). */
const purchasedListing = (over: Record<string, unknown> = {}) => {
  const d = docOf()
  const detail = JSON.stringify({ kind: 'code', code_doc: codeDocumentHash(d), code_commitment: d.code_commitment, issuer: d.issuer, value: d.value, verifiable: d.verifiable, nonce: d.nonce, ...over })
  return {
    listingHash: 'a'.repeat(64), account: SELLER, offer: { assetType: 'code:gift', assetClass: 'D', quantity: 1, value: d.value }, want: { assetType: 'x', assetClass: 'D', quantity: 1, value: d.value },
    terms: '', detail, expiresAt: '2030-01-01T00:00:00Z', discountBps: 0, acceptPayment: true, discoverable: true, nonce: 'n1', signature: 'ed25519:x', status: 'open',
  }
}
const reply = (body: Record<string, unknown>, sellerMember: unknown = { account_id: SELLER, pubkey_voucher: seller.publicKey, status: 'active' }, listing: unknown = purchasedListing()) => (p: string, init?: RequestInit) =>
  rpcMethod(init) === 'member' ? rpcResult(sellerMember) : !init?.method && p.endsWith(`/listings/${'a'.repeat(64)}`) ? { status: 200, body: listing } : !init?.method && p.endsWith('/purchases/p1') ? { status: 200, body } : init?.method === 'POST' && p.endsWith('/purchases/p1') ? { status: 200, body: {} } : undefined

async function openPurchase(user: ReturnType<typeof userEvent.setup>, body: Record<string, unknown>, sellerMember?: unknown, listing?: unknown) {
  const rendered = renderApp('/codes', reply(body, sellerMember, listing), false, createMockWallet(BUYER, BUYER))
  const section = await screen.findByRole('region', { name: 'Code purchase' })
  await user.type(within(section).getByLabelText('Purchase number'), 'p1')
  await user.click(within(section).getByRole('button', { name: 'Open purchase' }))
  await within(section).findByTestId('purchase')
  await user.type(screen.getAllByLabelText(/Voucher key/)[0]!, KEY)
  return { section, ...rendered }
}

describe('FE-032 one-time codes', () => {
  it('TC-FE-032-01 the code is prepared in the browser: hash, resource, detail of the listing without the code or the key, and an over-limit code without a bond is refused by the SDK', () => {
    const base = { circle: CIRCLE, seller: SELLER, code: CODE, issuer: 'shop.example', verifiable: false, value: '5000000', nonce: 'n1' }
    const p = prepareCode(base)
    expect(p.document.code_commitment).toMatch(/^[0-9a-f]{64}$/)
    expect(p.document.code_commitment).not.toBe(contentHash(text(CODE))) // not the plain hash of the code
    expect(p.resource).toBe(`x207:code:${p.documentHash}`)
    expect(JSON.parse(p.detail)).toMatchObject({ kind: 'code', code_doc: p.documentHash, code_commitment: p.document.code_commitment, issuer: 'shop.example', value: '5000000', verifiable: false })
    expect(p.detail).not.toContain(CODE)
    expect(p.detail).not.toContain(p.contentKey)
    expect(p.detail).not.toContain(p.salt)
    expect(() => prepareCode({ ...base, value: '20000001' })).toThrow(/code_over_limit_unbonded/)
    expect(JSON.parse(prepareCode({ ...base, value: '50000000', verifiable: true }).detail)).not.toHaveProperty('arbiter') // B6-F2: no bond exception, the book refuses the field
    expect(() => prepareCode({ ...base, value: '50000000', verifiable: true })).not.toThrow()
    expect(() => prepareCode({ ...base, code: 'short' })).toThrow(/code_bad_code/)
  })

  it('TC-FE-032-02 the seller page shows the limit and blocks an over-limit code that cannot be checked, and no arbiter field exists; nothing is sent', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/codes', undefined, false, createMockWallet(SELLER, SELLER))
    const form = await screen.findByRole('form', { name: 'Prepare code' })
    await user.type(within(form).getByLabelText(/^Code/), CODE)
    await user.type(within(form).getByLabelText('Value (credit)'), '25')
    expect(within(form).getByRole('note')).toHaveTextContent('limited to 20 credit')
    expect(within(form).getByRole('button', { name: 'Hash and encrypt code' })).toBeDisabled()
    expect(within(form).queryByLabelText(/^Arbiter/)).not.toBeInTheDocument()
    expect(within(form).getByLabelText(/^Code/)).toBeInTheDocument()
    await user.clear(within(form).getByLabelText('Value (credit)'))
    await user.type(within(form).getByLabelText('Value (credit)'), '15')
    expect(within(form).queryByRole('note')).not.toBeInTheDocument()
    await user.click(within(form).getByRole('button', { name: 'Hash and encrypt code' }))
    const out = await screen.findByTestId('code-prepared')
    expect(out).toHaveTextContent('code_commitment')
    expect(screen.getByTestId('code-detail').textContent).not.toContain(CODE)
    expect(screen.getByTestId('code-keep-page')).toHaveTextContent('exist only on this page')
    expect(requests().filter((r) => r.method === 'POST')).toHaveLength(0)
  })

  it('TC-FE-032-03 the listing hides the code, shows value, issuer and the sign that it can be checked, and warns about a code that cannot be checked', async () => {
    const user = userEvent.setup()
    const sellerKeys = generateVoucherKeypair()
    const { typed, view } = signedCodeListing(sellerKeys)
    renderApp('/codes', (p, init) => {
      if (!init?.method && p.endsWith(`/listings/${typed}`)) return { status: 200, body: view }
      if (rpcMethod(init) === 'member') return rpcResult({ account_id: SELLER, pubkey_voucher: sellerKeys.publicKey, status: 'active' })
      return undefined
    }, false, createMockWallet(BUYER, BUYER))
    const section = await screen.findByRole('region', { name: 'Code purchase' })
    await user.type(within(section).getByLabelText('Code listing hash'), typed)
    await user.click(within(section).getByRole('button', { name: 'Check listing' }))
    const summary = await within(section).findByTestId('code-summary')
    expect(within(summary).getByTestId('code-hidden')).toHaveTextContent('hidden until purchased')
    expect(summary).toHaveTextContent('5 credit')
    expect(summary).toHaveTextContent('shop.example')
    expect(summary).toHaveTextContent('not checkable')
    expect(summary).not.toHaveTextContent(CODE)
    expect(within(summary).getByTestId('unverifiable-warning')).toHaveTextContent('cannot be checked')
    expect(within(summary).queryByTestId('over-limit')).not.toBeInTheDocument()
  })

  it('TC-FE-032-04 a checkable code has no warning; an over-limit code that cannot be checked cannot be bought', async () => {
    const user = userEvent.setup()
    const sellerKeys = generateVoucherKeypair()
    for (const [name, detail, value, warn, over] of [
      ['checkable', { verifiable: true }, '50000000', false, false],
      ['checkable, above 100 credit', { verifiable: true }, '150000000', false, true],
      ['over the limit', {}, '50000000', true, true],
    ] as const) {
      const { typed, view } = signedCodeListing(sellerKeys, detail, value)
      const { unmount } = renderApp('/codes', (p, init) => {
        if (!init?.method && p.endsWith(`/listings/${typed}`)) return { status: 200, body: view }
        if (rpcMethod(init) === 'member') return rpcResult({ account_id: SELLER, pubkey_voucher: sellerKeys.publicKey, status: 'active' })
        return undefined
      }, false, createMockWallet(BUYER, BUYER))
      const section = await screen.findByRole('region', { name: 'Code purchase' })
      await user.type(screen.getAllByLabelText(/Voucher key/)[0]!, KEY)
      await user.type(within(section).getByLabelText('Code listing hash'), typed)
      await user.click(within(section).getByRole('button', { name: 'Check listing' }))
      const summary = await within(section).findByTestId('code-summary')
      expect(within(summary).queryByTestId('unverifiable-warning') !== null, name).toBe(warn)
      expect(within(summary).queryByTestId('over-limit') !== null, name).toBe(over)
      expect(within(summary).getByRole('button', { name: /^Buy / }), name).toHaveProperty('disabled', over)
      unmount()
    }
  })

  it('TC-FE-032-05 the buyer buys: the voucher continues the state of the pair with resource x207:code:<doc> and is signed with the key that stays in the browser', async () => {
    const user = userEvent.setup()
    const sellerKeys = generateVoucherKeypair()
    const { typed, view } = signedCodeListing(sellerKeys, { verifiable: true })
    const { requests } = renderApp('/codes', (p, init) => {
      if (!init?.method && p.endsWith(`/listings/${typed}`)) return { status: 200, body: view }
      if (init?.method === 'POST' && p.endsWith('/purchases')) return { status: 201, body: { purchase_id: 'p9' } }
      if (!init?.method && p.endsWith('/epochs')) return { status: 200, body: { items: [{ epoch: 42, phase: 'open', proposalDeadline: null }], nextCursor: null } }
      if (rpcMethod(init) === 'member') return rpcResult({ account_id: SELLER, pubkey_voucher: sellerKeys.publicKey, status: 'active' })
      if (rpcMethod(init) === 'obligation') return rpcResult({ cumulative: '2000000', last_seq: 3 })
      return undefined
    }, false, createMockWallet(BUYER, BUYER))
    const section = await screen.findByRole('region', { name: 'Code purchase' })
    await user.type(screen.getAllByLabelText(/Voucher key/)[0]!, KEY)
    await user.type(within(section).getByLabelText('Code listing hash'), typed)
    await user.click(within(section).getByRole('button', { name: 'Check listing' }))
    const summary = await within(section).findByTestId('code-summary')
    expect(requests().filter((r) => r.method === 'POST' && r.path.includes('/x207/'))).toHaveLength(0)
    await user.click(within(summary).getByRole('button', { name: `Buy for 5 credit from ${SELLER} (voucher held by the backend)` }))
    await waitFor(() => expect(requests().some((r) => r.method === 'POST' && r.path.endsWith('/purchases'))).toBe(true))
    const post = requests().find((r) => r.method === 'POST' && r.path.endsWith('/purchases'))!
    expect(post.body.voucher).toMatchObject({ payer: BUYER, payee: SELLER, epoch: 42, seq: 4, cumulativeAmount: '7000000', unit: 'credit', resource: `x207:code:${'d'.repeat(64)}` })
    expect(verifyVoucher({ ...post.body.voucher, signature: post.body.signature }, voucherPublicKey(SEED))).toBe(true)
    expect(JSON.stringify(post.body)).not.toContain(KEY)
  })

  it('TC-FE-032-06 a listing that is not a code cannot be bought here', async () => {
    const user = userEvent.setup()
    const sellerKeys = generateVoucherKeypair()
    const { typed, view } = signedCodeListing(sellerKeys, { kind: 'license' })
    renderApp('/codes', (p, init) => {
      if (!init?.method && p.endsWith(`/listings/${typed}`)) return { status: 200, body: view }
      return undefined
    }, false, createMockWallet(BUYER, BUYER))
    const section = await screen.findByRole('region', { name: 'Code purchase' })
    await user.type(within(section).getByLabelText('Code listing hash'), typed)
    await user.click(within(section).getByRole('button', { name: 'Check listing' }))
    expect(await within(section).findByText(/not a code listing/)).toBeInTheDocument()
    expect(parseCodeListing({ ...view, detail: 'plain note' } as never)).toBeNull()
  })

  it('TC-FE-032-07 a right code: the window of one hour is shown, the code stays hidden until the buyer asks, and the buyer confirms with a signed notice', async () => {
    const user = userEvent.setup()
    const until = Math.floor(Date.now() / 1000) + 1800
    const { section, requests } = await openPurchase(user, delivered(CODE, CODE, until))
    expect(within(section).getByTestId('dispute-window')).toHaveTextContent(/Disputes open for (29|30) min/)
    await user.click(within(section).getByRole('button', { name: 'Download and check code' }))
    const ok = await within(section).findByTestId('code-ok')
    expect(ok).not.toHaveTextContent(CODE)
    expect(screen.queryByText(CODE)).not.toBeInTheDocument()
    await user.click(within(ok).getByRole('button', { name: 'Show code' }))
    expect(within(ok).getByTestId('code-value')).toHaveTextContent(CODE)
    await user.click(within(ok).getByRole('button', { name: 'Confirm' }))
    await within(section).findByText(/Confirmed: the voucher/)
    const post = requests().find((r) => r.method === 'POST' && r.path.includes('/purchases/'))!
    expect(post.body.notice).toMatchObject({ purchase_id: 'p1', actor: BUYER, action: 'confirmed', proof: null })
    expect(JSON.stringify(post.body)).not.toContain(CODE)
    expect(JSON.stringify(post.body)).not.toContain(KEY)
  })

  it('TC-FE-032-08 a wrong code gives a proof that anyone can check; the buyer disputes with it and the code is never sent', async () => {
    const user = userEvent.setup()
    const until = Math.floor(Date.now() / 1000) + 1800
    const body = delivered('WRONG-CODE-0000-AAAA', CODE, until)
    const { section, requests } = await openPurchase(user, body)
    await user.click(within(section).getByRole('button', { name: 'Download and check code' }))
    expect(await within(section).findByTestId('code-cheated')).toHaveTextContent('content_mismatch')
    await user.click(within(section).getByRole('button', { name: 'Dispute with proof' }))
    await within(section).findByText(/Dispute sent/)
    const post = requests().find((r) => r.method === 'POST' && r.path.includes('/purchases/'))!
    expect(post.body.notice).toMatchObject({ action: 'disputed', reason: 'content_mismatch' })
    const sent = post.body.notice.proof as { release: never; signature: string; box_key: string }
    expect(Object.keys(sent).sort()).toEqual(['box_key', 'release', 'signature'])
    expect(JSON.stringify(post.body)).not.toContain('WRONG-CODE')
    const enc = await licenseSources.current.https!.fetch('x', {})
    expect(checkCheatProof({ ...sent, ciphertext: enc }, seller.publicKey)).toEqual({ valid: true, reason: 'content_mismatch' })
  })

  it('TC-FE-032-09 a code that was already used is disputed inside the window; after the window the buttons are off and the page says it was confirmed', async () => {
    const user = userEvent.setup()
    const soon = Math.floor(Date.now() / 1000) + 600
    const first = await openPurchase(user, delivered(CODE, CODE, soon))
    const dispute = within(first.section).getByRole('button', { name: /Report to reputation/ })
    expect(dispute).toBeEnabled()
    await user.click(dispute)
    await within(first.section).findByText(/Complaint recorded[\s\S]*does not stop payment/)
    expect(first.requests().find((r) => r.method === 'POST' && r.path.includes('/purchases/'))!.body.notice).toMatchObject({ action: 'disputed', reason: 'other', proof: null })
    first.unmount()
    const late = await openPurchase(user, delivered(CODE, CODE, Math.floor(Date.now() / 1000) - 5))
    expect(within(late.section).getByTestId('dispute-window')).toHaveTextContent('The dispute window has passed')
    expect(within(late.section).getByRole('button', { name: /Report to reputation/ })).toBeDisabled()
  })

  it('TC-FE-032-10 helpers: the seconds left in the window never go below zero and are null without a window', () => {
    expect(disputeSecondsLeft(1000, 400)).toBe(600)
    expect(disputeSecondsLeft(1000, 2000)).toBe(0)
    expect(disputeSecondsLeft(null, 5)).toBeNull()
  })

  it('TC-FE-032-11 the seller serves a purchase: the key is released as a code release that the SDK verifies, and neither the code, the key nor the voucher key is in the request', async () => {
    const user = userEvent.setup()
    const buyerKeys = generateVoucherKeypair()
    let status = 'paid_held'
    const view = () => ({ purchase_id: 'p7', listing_hash: 'a'.repeat(64), buyer: BUYER, seller: SELLER, status, content_hash: codeCommitment(CODE, SALT), source: null, cipher_hash: null, release: null, release_signature: null })
    const { requests } = renderApp('/codes', (p, init) => {
      if (!init?.method && p.endsWith('/purchases/p7')) return { status: 200, body: view() }
      if (rpcMethod(init) === 'member') return rpcResult({ account_id: BUYER, pubkey_voucher: buyerKeys.publicKey, status: 'active' })
      if (init?.method === 'POST' && p.endsWith('/purchases/p7')) return { status: 200, body: {} }
      return undefined
    }, false, createMockWallet(SELLER, SELLER))
    const form = await screen.findByRole('form', { name: 'Prepare code' })
    await user.type(within(form).getByLabelText(/^Code/), CODE)
    await user.type(within(form).getByLabelText('Value (credit)'), '5')
    await user.type(screen.getAllByLabelText(/Voucher key/)[0]!, KEY)
    await user.click(within(form).getByRole('button', { name: 'Hash and encrypt code' }))
    await screen.findByTestId('code-prepared')
    const serve = screen.getByRole('region', { name: 'Serve code purchase' })
    await user.type(within(serve).getByLabelText('Purchase number'), 'p7')
    await user.click(within(serve).getByRole('button', { name: 'Open purchase' }))
    await within(serve).findByTestId('serve')
    await user.type(within(serve).getByLabelText('Address or CID'), 'https://cdn.example.com/c.enc')
    status = 'cipher_posted'
    await user.click(within(serve).getByRole('button', { name: 'Record ciphertext' }))
    await within(serve).findByText('Ciphertext recorded.')
    await user.click(await within(serve).findByRole('button', { name: 'Check the buyer key in the contract' }))
    const fingerprint = (await within(serve).findByTestId('buyer-fingerprint')).textContent!
    await user.click(await within(serve).findByRole('button', { name: `Release key to ${BUYER} (fingerprint ${fingerprint})` }))
    await within(serve).findByText(/one-hour dispute window starts/)
    const released = requests().filter((r) => r.method === 'POST' && r.path.includes('/purchases/p7'))[1]!
    expect(released.body.notice).toMatchObject({ circle: expect.any(String), buyer: BUYER, content_hash: expect.stringMatching(/^[0-9a-f]{64}$/), purchase_id: 'p7' })
    const listed = JSON.parse(screen.getByTestId('code-detail').textContent!) as { code_commitment: string }
    expect(released.body.notice.content_hash).toBe(listed.code_commitment)
    expect(JSON.stringify(released.body)).not.toContain(CODE)
    expect(JSON.stringify(released.body)).not.toContain(KEY)
  })

  /** Seller page with a prepared, checkable code and an opened purchase at `cipher_posted`. */
  async function serveWithCheck(user: ReturnType<typeof userEvent.setup>, checkReply: (init?: RequestInit) => { status: number; body: unknown }, verifiable = true) {
    const buyerKeys = generateVoucherKeypair()
    const view = { purchase_id: 'p8', listing_hash: 'b'.repeat(64), buyer: BUYER, seller: SELLER, status: 'cipher_posted', content_hash: 'c'.repeat(64), source: null, cipher_hash: null, release: null, release_signature: null }
    const rendered = renderApp('/codes', (p, init) => {
      if (!init?.method && p.endsWith('/purchases/p8')) return { status: 200, body: view }
      if (init?.method === 'POST' && p.endsWith(`/listings/${'b'.repeat(64)}/code-check`)) return checkReply(init)
      if (rpcMethod(init) === 'member') return rpcResult({ account_id: BUYER, pubkey_voucher: buyerKeys.publicKey, status: 'active' })
      if (init?.method === 'POST' && p.endsWith('/purchases/p8')) return { status: 200, body: {} }
      return undefined
    }, false, createMockWallet(SELLER, SELLER))
    const form = await screen.findByRole('form', { name: 'Prepare code' })
    await user.type(within(form).getByLabelText(/^Code/), CODE)
    await user.type(within(form).getByLabelText('Value (credit)'), '5')
    if (verifiable) await user.click(within(form).getByLabelText(/The issuer has a check API/))
    await user.type(screen.getAllByLabelText(/Voucher key/)[0]!, KEY)
    await user.click(within(form).getByRole('button', { name: 'Hash and encrypt code' }))
    await screen.findByTestId('code-prepared')
    const serve = screen.getByRole('region', { name: 'Serve code purchase' })
    await user.type(within(serve).getByLabelText('Purchase number'), 'p8')
    await user.click(within(serve).getByRole('button', { name: 'Open purchase' }))
    await within(serve).findByTestId('serve')
    return { serve, ...rendered }
  }

  it('TC-FE-032-12 the seller of a checkable code sees what the backend will see before the check, the check sends a signed notice with the code and the salt, and the key is blocked until the verdict is valid', async () => {
    const user = userEvent.setup()
    const { serve, requests } = await serveWithCheck(user, () => ({ status: 200, body: { listingHash: 'b'.repeat(64), verdict: 'valid', checkedAt: Date.now(), validUntilMs: Date.now() + 600_000 } }))
    expect(within(serve).getByTestId('check-disclosure')).toHaveTextContent('the backend sees the code and salt once')
    expect(within(serve).getByTestId('check-disclosure')).toHaveTextContent('not stored')
    await user.click(await within(serve).findByRole('button', { name: 'Check the buyer key in the contract' }))
    const fingerprint = (await within(serve).findByTestId('buyer-fingerprint')).textContent!
    const release = within(serve).getByRole('button', { name: `Release key to ${BUYER} (fingerprint ${fingerprint})` })
    expect(release).toBeDisabled() // no verdict yet
    expect(requests().filter((r) => r.method === 'POST' && r.path.includes('/code-check'))).toHaveLength(0) // nothing is sent before the click
    await user.click(within(serve).getByRole('button', { name: 'Show the code to the backend for the issuer check' }))
    expect(await within(serve).findByTestId('issuer-verdict')).toHaveTextContent('code is valid')
    expect(release).toBeEnabled()
    const post = requests().find((r) => r.method === 'POST' && r.path.includes('/code-check'))!
    expect(Object.keys(post.body.notice)).toEqual(['circle', 'listing_hash', 'actor', 'action', 'at'])
    expect(post.body.notice).toMatchObject({ listing_hash: 'b'.repeat(64), actor: SELLER, action: 'check' })
    expect(post.body.code).toBe(CODE)
    expect(post.body.salt).toMatch(/^[0-9a-f]{64}$/)
    expect(post.body.signature).toMatch(/^ed25519:/)
    expect(JSON.stringify(post.body)).not.toContain(KEY)
  })

  it('TC-FE-032-13 a verdict used or unknown keeps the key; an issuer that is down is shown and can be asked again', async () => {
    const user = userEvent.setup()
    let reply: { status: number; body: unknown } = { status: 200, body: { listingHash: 'b'.repeat(64), verdict: 'used', checkedAt: 1, validUntilMs: null } }
    const { serve } = await serveWithCheck(user, () => reply)
    await user.click(await within(serve).findByRole('button', { name: 'Check the buyer key in the contract' }))
    await within(serve).findByTestId('buyer-fingerprint')
    const release = within(serve).getByRole('button', { name: /^Release key to/ })
    await user.click(within(serve).getByRole('button', { name: 'Show the code to the backend for the issuer check' }))
    expect(await within(serve).findByTestId('issuer-verdict')).toHaveTextContent('already used')
    expect(release).toBeDisabled()
    reply = { status: 503, body: { error: { code: 'code_issuer_unavailable', message: 'down', details: {} } } }
    await user.click(within(serve).getByRole('button', { name: 'Show the code to the backend for the issuer check' }))
    expect(await within(serve).findByText(/The issuer did not respond/)).toBeInTheDocument()
    expect(release).toBeDisabled()
    reply = { status: 200, body: { listingHash: 'b'.repeat(64), verdict: 'unknown', checkedAt: 2, validUntilMs: null } }
    await user.click(within(serve).getByRole('button', { name: 'Show the code to the backend for the issuer check' }))
    await waitFor(() => expect(within(serve).getByTestId('issuer-verdict')).toHaveTextContent('does not recognize'))
    expect(release).toBeDisabled()
  })

  it('TC-FE-032-14 a code that cannot be checked has no check step: the page says the backend does not see the code and nobody checks that it is unused', async () => {
    const user = userEvent.setup()
    const { serve, requests } = await serveWithCheck(user, () => ({ status: 500, body: {} }), false)
    expect(within(serve).queryByTestId('issuer-check')).not.toBeInTheDocument()
    expect(within(serve).getByTestId('no-check-note')).toHaveTextContent('the backend does not see the code')
    expect(requests().filter((r) => r.path.includes('/code-check'))).toHaveLength(0)
  })

  it('TC-FE-032-15 the listing detail carries the nonce that the book asks for (BE-069 rebuilds the code document from it)', () => {
    const p = prepareCode({ circle: CIRCLE, seller: SELLER, code: CODE, issuer: 'shop.example', verifiable: true, value: '5000000', nonce: 'n1' })
    expect(JSON.parse(p.detail)).toMatchObject({ nonce: 'n1', code_doc: p.documentHash, verifiable: true })
  })

  it('TC-FE-032-16 [B6-F6] the key of the seller is read from the contract: there is no field to type it, and a seller that is not an active member gets no download', async () => {
    const user = userEvent.setup()
    const until = Math.floor(Date.now() / 1000) + 1800
    const ok = await openPurchase(user, delivered(CODE, CODE, until))
    expect(within(ok.section).queryByLabelText(/Seller public key/)).not.toBeInTheDocument()
    expect(within(ok.section).getByTestId('seller-key-note')).toHaveTextContent('read from the contract')
    await user.click(within(ok.section).getByRole('button', { name: 'Download and check code' }))
    expect(await within(ok.section).findByTestId('code-ok')).toBeInTheDocument()
    expect(within(ok.section).getByTestId('seller-fingerprint').textContent).toMatch(/[0-9a-f]{4}( [0-9a-f]{4}){3}/)
    ok.unmount()
    cleanup()
    const bad = await openPurchase(user, delivered(CODE, CODE, until), null)
    await user.click(within(bad.section).getByRole('button', { name: 'Download and check code' }))
    expect(await within(bad.section).findByTestId('code-refused')).toHaveTextContent('is not an active member in the contract')
    expect(within(bad.section).queryByTestId('code-ok')).not.toBeInTheDocument()
    // a key of another seller in the contract: the delivery is refused as a bad signature, not shown as a code
    cleanup()
    const other = await openPurchase(user, delivered(CODE, CODE, until), { account_id: SELLER, pubkey_voucher: generateVoucherKeypair().publicKey, status: 'active' })
    await user.click(within(other.section).getByRole('button', { name: 'Download and check code' }))
    expect(await within(other.section).findByTestId('code-refused')).toHaveTextContent('The release signature')
  })

  it('TC-FE-032-17 [B6-F1, F7] a complaint without proof is not a dispute: the button says it does not stop the payment, the page no longer tells the buyer to try the code first, and the labels say where the code goes', async () => {
    const user = userEvent.setup()
    const until = Math.floor(Date.now() / 1000) + 1800
    const { section } = await openPurchase(user, delivered(CODE, CODE, until))
    expect(within(section).getByRole('button', { name: 'Report to reputation (does not stop payment)' })).toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: /^Dispute:/ })).not.toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: 'Download and check code' }))
    const ok = await within(section).findByTestId('code-ok')
    expect(ok.textContent).not.toMatch(/redeem/i)
    expect(ok.textContent).not.toMatch(/try/i)
    expect(document.body.textContent).not.toMatch(/bond/)
    expect(document.body.textContent).toMatch(/sent once to the backend during the issuer check/)
    expect(document.body.textContent).not.toMatch(/sent nowhere; only/)
  })

  it('TC-FE-032-18 [B6-F4] the release is checked against the document of the listing the buyer looked at: a listing with another nonce means the release is not for it and nothing is downloaded', async () => {
    const user = userEvent.setup()
    const until = Math.floor(Date.now() / 1000) + 1800
    const { section } = await openPurchase(user, delivered(CODE, CODE, until), undefined, purchasedListing({ nonce: 'another-nonce' }))
    await user.click(within(section).getByRole('button', { name: 'Download and check code' }))
    expect(await within(section).findByTestId('code-refused')).toHaveTextContent('not for the document of the listing')
    expect(within(section).queryByTestId('code-ok')).not.toBeInTheDocument()
  })

  it('TC-FE-032-19 [B6-F2] the seller form: 20 credit for an uncheckable code, 100 credit for a checkable one, and no bond is mentioned', async () => {
    const user = userEvent.setup()
    renderApp('/codes', undefined, false, createMockWallet(SELLER, SELLER))
    const form = await screen.findByRole('form', { name: 'Prepare code' })
    await user.type(within(form).getByLabelText(/^Code/), CODE)
    await user.type(within(form).getByLabelText('Value (credit)'), '50')
    expect(within(form).getByRole('note')).toHaveTextContent('limited to 20 credit')
    await user.click(within(form).getByLabelText(/The issuer has a check API/))
    expect(within(form).queryByRole('note')).not.toBeInTheDocument() // 50 is under 100 for a checkable code
    await user.clear(within(form).getByLabelText('Value (credit)'))
    await user.type(within(form).getByLabelText('Value (credit)'), '150')
    expect(within(form).getByRole('note')).toHaveTextContent('limited to 100 credit')
    expect(within(form).getByRole('button', { name: 'Hash and encrypt code' })).toBeDisabled()
    expect(document.body.textContent).not.toMatch(/arbiter/i)
    expect(document.body.textContent).not.toMatch(/with a bond|bond:/i)
  })

  it('TC-FE-032-20 [B7-C3] a second code from the same seller continues from the vouchers that purchases still hold: seq above the highest, cumulative = the highest + the price; a cancelled purchase holds nothing', async () => {
    expect(pairStateWithHeld({ seq: 3, cumulativeAmount: '2000000' }, [])).toEqual({ seq: 3, cumulativeAmount: '2000000' })
    expect(pairStateWithHeld({ seq: 3, cumulativeAmount: '2000000' }, [
      { purchaseId: 'a', payee: SELLER, epoch: 42, seq: 4, cumulativeAmount: '7000000' }, { purchaseId: 'b', payee: SELLER, epoch: 42, seq: 5, cumulativeAmount: '12000000' },
    ])).toEqual({ seq: 5, cumulativeAmount: '12000000' })
    forgetHeld()
    const user = userEvent.setup()
    const sellerKeys = generateVoucherKeypair()
    const { typed, view } = signedCodeListing(sellerKeys, { verifiable: true })
    rememberHeld({ purchaseId: 'old-1', payee: SELLER, epoch: 42, seq: 4, cumulativeAmount: '7000000' }) // alive
    rememberHeld({ purchaseId: 'old-2', payee: SELLER, epoch: 42, seq: 5, cumulativeAmount: '99000000' }) // cancelled: it holds nothing and must not raise the next voucher
    const { requests } = renderApp('/codes', (p, init) => {
      if (!init?.method && p.endsWith(`/listings/${typed}`)) return { status: 200, body: view }
      if (!init?.method && p.endsWith('/purchases/old-1')) return { status: 200, body: { purchase_id: 'old-1', status: 'key_released', listing_hash: typed } }
      if (!init?.method && p.endsWith('/purchases/old-2')) return { status: 200, body: { purchase_id: 'old-2', status: 'cancelled', listing_hash: typed } }
      if (init?.method === 'POST' && p.endsWith('/purchases')) return { status: 201, body: { purchase_id: 'p9' } }
      if (!init?.method && p.endsWith('/epochs')) return { status: 200, body: { items: [{ epoch: 42, phase: 'open', proposalDeadline: null }], nextCursor: null } }
      if (rpcMethod(init) === 'member') return rpcResult({ account_id: SELLER, pubkey_voucher: sellerKeys.publicKey, status: 'active' })
      if (rpcMethod(init) === 'obligation') return rpcResult({ cumulative: '2000000', last_seq: 3 })
      return undefined
    }, false, createMockWallet(BUYER, BUYER))
    const section = await screen.findByRole('region', { name: 'Code purchase' })
    await user.type(screen.getAllByLabelText(/Voucher key/)[0]!, KEY)
    await user.type(within(section).getByLabelText('Code listing hash'), typed)
    await user.click(within(section).getByRole('button', { name: 'Check listing' }))
    const summary = await within(section).findByTestId('code-summary')
    await user.click(within(summary).getByRole('button', { name: /^Buy / }))
    await waitFor(() => expect(requests().some((r) => r.method === 'POST' && r.path.endsWith('/purchases'))).toBe(true))
    const post = requests().find((r) => r.method === 'POST' && r.path.endsWith('/purchases'))!
    expect(post.body.voucher).toMatchObject({ seq: 5, cumulativeAmount: '12000000' }) // 7 credit held + the price of 5
    expect(recallHeld(SELLER, 42).map((h) => h.purchaseId).sort()).toEqual(['old-1', 'old-2', 'p9'])
    forgetHeld()
  })

  it('TC-FE-032-21 [B7-C2] a dispute that the backend decides for the buyer because the source does not serve the signed ciphertext is shown in words; a held voucher stays held', async () => {
    const user = userEvent.setup()
    const until = Math.floor(Date.now() / 1000) + 1800
    const body = delivered(CODE, CODE, until)
    const rendered = renderApp('/codes', (p, init) => {
      if (init?.method === 'POST' && p.endsWith('/purchases/p1')) return { status: 201, body: { purchase_id: 'p1', status: 'disputed', notDelivered: true } }
      return reply(body)(p, init)
    }, false, createMockWallet(BUYER, BUYER))
    const section = await screen.findByRole('region', { name: 'Code purchase' })
    await user.type(within(section).getByLabelText('Purchase number'), 'p1')
    await user.click(within(section).getByRole('button', { name: 'Open purchase' }))
    await within(section).findByTestId('purchase')
    await user.type(screen.getAllByLabelText(/Voucher key/)[0]!, KEY)
    await user.click(within(section).getByRole('button', { name: /Report to reputation/ }))
    await within(section).findByText(/could not fetch the ciphertext that the seller signed/)
    expect(rendered.requests().some((r) => r.method === 'POST' && r.path.endsWith('/purchases/p1'))).toBe(true)
  })

  it('TC-FE-032-22 [B7] the errors of the broker and of the book that came with batch 7 are said in words by their codes', () => {
    expect(describeMarketError(new ApiError(403, 'grant_not_owned', 'any text'))).toMatch(/belongs to the owner of the broker/)
    expect(describeMarketError(new ApiError(400, 'takedown_invalid', 'A seller does not file a takedown'))).toMatch(/takedown was refused: A seller does not file/)
    expect(describeMarketError(new ApiError(409, 'already_exists', 'This purchase already has a complaint'))).toMatch(/already exists/)
  })
})
