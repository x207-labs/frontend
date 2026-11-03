import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkCheatProof, codeDocumentHash, codeHash, createRelease, createCodeRelease, encryptCode, encryptContent, generateVoucherKeypair, licensePublicKey, listingHash, signListing, verifyVoucher,
  voucherPublicKey, type CodeDocument, type ContentSource,
} from '@x207/core'
import { base58Encode } from '../lib/barter'
import { licenseSources } from '../lib/licenseFlow'
import { parseCodeListing, prepareCode, disputeSecondsLeft } from '../lib/codeFlow'
import { renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const CIRCLE = 'x207-circle.testnet'
const SELLER = 'seller.x207-circle.near'
const BUYER = 'buyer.x207-circle.near'
const SEED = Uint8Array.from(new Array<number>(32).fill(5))
const KEY = `ed25519:${base58Encode(SEED)}`
const seller = generateVoucherKeypair()
const CODE = 'GIFT-7QK2-M9XD-41LP'
const text = (s: string) => new TextEncoder().encode(s)
const original = licenseSources.current
afterEach(() => {
  licenseSources.current = original
})

const docOf = (over: Partial<CodeDocument> = {}): CodeDocument => ({ circle: CIRCLE, seller: SELLER, code_hash: codeHash(CODE), issuer: 'shop.example', value: '5000000', verifiable: false, arbiter: null, nonce: 'n1', ...over })
const rpcResult = (value: unknown) => ({ status: 200, body: { jsonrpc: '2.0', id: 'x207', result: { result: Array.from(new TextEncoder().encode(JSON.stringify(value))) } } })
const rpcMethod = (init?: RequestInit): string | undefined => (init?.body ? (JSON.parse(String(init.body)) as { params?: { method_name?: string } }).params?.method_name : undefined)

/** A signed listing of a code, as the read API would answer it. */
function signedCodeListing(sellerKeys: { secretKey: string }, detailOver: Record<string, unknown> = {}, value = '5000000') {
  const detail = JSON.stringify({ kind: 'code', code_doc: 'd'.repeat(64), code_hash: codeHash(CODE), issuer: 'shop.example', value, verifiable: false, ...detailOver })
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
  const enc = data === claimed ? encryptCode(claimed) : { ...encryptContent(text(data)), code_hash: codeHash(claimed) }
  const { release, signature } = data === claimed
    ? createCodeRelease({ doc, code: claimed, buyer: BUYER, buyerPublicKey: licensePublicKey(KEY), purchase_id: 'p1', ciphertext: enc.ciphertext, contentKey: enc.key, at: 1_800_000_000, sellerSecretKey: seller.secretKey })
    : createRelease({ circle: CIRCLE, license_hash: codeDocumentHash(doc), buyer: BUYER, buyerPublicKey: licensePublicKey(KEY), content_hash: codeHash(claimed), content_size: text(data).length, purchase_id: 'p1', ciphertext: enc.ciphertext, contentKey: enc.key, at: 1_800_000_000, sellerSecretKey: seller.secretKey })
  const source: ContentSource = { kind: 'https', fetch: async () => enc.ciphertext }
  licenseSources.current = { https: source }
  return { purchase_id: 'p1', listing_hash: 'a'.repeat(64), buyer: BUYER, seller: SELLER, status: 'key_released', content_hash: codeHash(claimed), source: { kind: 'https', ref: 'https://cdn.example.com/c.enc' }, cipher_hash: release.cipher_hash, release, release_signature: signature, dispute_until: disputeUntil }
}
const reply = (body: Record<string, unknown>) => (p: string, init?: RequestInit) =>
  !init?.method && p.endsWith('/purchases/p1') ? { status: 200, body } : init?.method === 'POST' && p.endsWith('/purchases/p1') ? { status: 200, body: {} } : undefined

async function openPurchase(user: ReturnType<typeof userEvent.setup>, body: Record<string, unknown>) {
  const rendered = renderApp('/kode', reply(body), false, createMockWallet(BUYER, BUYER))
  const section = await screen.findByRole('region', { name: 'Pembelian kode' })
  await user.type(within(section).getByLabelText('Nomor pembelian'), 'p1')
  await user.click(within(section).getByRole('button', { name: 'Buka pembelian' }))
  await within(section).findByTestId('purchase')
  await user.type(screen.getAllByLabelText(/Kunci voucher/)[0]!, KEY)
  await user.type(within(section).getByLabelText(/Kunci publik penjual/), seller.publicKey)
  return { section, ...rendered }
}

describe('FE-032 one-time codes', () => {
  it('TC-FE-032-01 the code is prepared in the browser: hash, resource, detail of the listing without the code or the key, and an over-limit code without a bond is refused by the SDK', () => {
    const base = { circle: CIRCLE, seller: SELLER, code: CODE, issuer: 'shop.example', verifiable: false, value: '5000000', arbiter: '', nonce: 'n1' }
    const p = prepareCode(base)
    expect(p.document.code_hash).toBe(codeHash(CODE))
    expect(p.resource).toBe(`x207:code:${p.documentHash}`)
    expect(JSON.parse(p.detail)).toMatchObject({ kind: 'code', code_doc: p.documentHash, code_hash: codeHash(CODE), issuer: 'shop.example', value: '5000000', verifiable: false })
    expect(p.detail).not.toContain(CODE)
    expect(p.detail).not.toContain(p.contentKey)
    expect(() => prepareCode({ ...base, value: '20000001' })).toThrow(/code_over_limit_unbonded/)
    expect(JSON.parse(prepareCode({ ...base, value: '50000000', arbiter: 'arbiter.near' }).detail)).toMatchObject({ arbiter: 'arbiter.near', bond: true })
    expect(() => prepareCode({ ...base, value: '50000000', verifiable: true })).not.toThrow()
    expect(() => prepareCode({ ...base, code: 'short' })).toThrow(/code_bad_code/)
  })

  it('TC-FE-032-02 the seller page shows the limit and blocks an over-limit code without a jaminan; nothing is sent', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/kode', undefined, false, createMockWallet(SELLER, SELLER))
    const form = await screen.findByRole('form', { name: 'Siapkan kode' })
    await user.type(within(form).getByLabelText(/^Kode/), CODE)
    await user.type(within(form).getByLabelText('Nilai (credit)'), '25')
    expect(within(form).getByRole('note')).toHaveTextContent('dibatasi 20 credit')
    expect(within(form).getByRole('button', { name: 'Hash dan enkripsi kode' })).toBeDisabled()
    await user.type(within(form).getByLabelText(/^Arbiter/), 'arbiter.near')
    expect(within(form).queryByRole('note')).not.toBeInTheDocument()
    await user.click(within(form).getByRole('button', { name: 'Hash dan enkripsi kode' }))
    const out = await screen.findByTestId('code-prepared')
    expect(out).toHaveTextContent(codeHash(CODE))
    expect(screen.getByTestId('code-detail').textContent).not.toContain(CODE)
    expect(screen.getByTestId('code-keep-page')).toHaveTextContent('hanya ada di halaman ini')
    expect(requests().filter((r) => r.method === 'POST')).toHaveLength(0)
  })

  it('TC-FE-032-03 the listing hides the code, shows value, issuer and the sign that it can be checked, and warns about a code that cannot be checked', async () => {
    const user = userEvent.setup()
    const sellerKeys = generateVoucherKeypair()
    const { typed, view } = signedCodeListing(sellerKeys)
    renderApp('/kode', (p, init) => {
      if (!init?.method && p.endsWith(`/listings/${typed}`)) return { status: 200, body: view }
      if (rpcMethod(init) === 'member') return rpcResult({ account_id: SELLER, pubkey_voucher: sellerKeys.publicKey, status: 'active' })
      return undefined
    }, false, createMockWallet(BUYER, BUYER))
    const section = await screen.findByRole('region', { name: 'Pembelian kode' })
    await user.type(within(section).getByLabelText('Hash listing kode'), typed)
    await user.click(within(section).getByRole('button', { name: 'Periksa listing' }))
    const summary = await within(section).findByTestId('code-summary')
    expect(within(summary).getByTestId('code-hidden')).toHaveTextContent('disembunyikan sampai dibeli')
    expect(summary).toHaveTextContent('5 credit')
    expect(summary).toHaveTextContent('shop.example')
    expect(summary).toHaveTextContent('tidak bisa dicek')
    expect(summary).not.toHaveTextContent(CODE)
    expect(within(summary).getByTestId('unverifiable-warning')).toHaveTextContent('tidak bisa dicek')
    expect(within(summary).queryByTestId('over-limit')).not.toBeInTheDocument()
  })

  it('TC-FE-032-04 a checkable code has no warning; an over-limit code that cannot be checked and has no bond cannot be bought', async () => {
    const user = userEvent.setup()
    const sellerKeys = generateVoucherKeypair()
    for (const [name, detail, value, warn, over] of [
      ['checkable', { verifiable: true }, '50000000', false, false],
      ['over the limit, no bond', {}, '50000000', true, true],
      ['over the limit, with a bond', { arbiter: 'arbiter.near', bond: true }, '50000000', true, false],
    ] as const) {
      const { typed, view } = signedCodeListing(sellerKeys, detail, value)
      const { unmount } = renderApp('/kode', (p, init) => {
        if (!init?.method && p.endsWith(`/listings/${typed}`)) return { status: 200, body: view }
        if (rpcMethod(init) === 'member') return rpcResult({ account_id: SELLER, pubkey_voucher: sellerKeys.publicKey, status: 'active' })
        return undefined
      }, false, createMockWallet(BUYER, BUYER))
      const section = await screen.findByRole('region', { name: 'Pembelian kode' })
      await user.type(screen.getAllByLabelText(/Kunci voucher/)[0]!, KEY)
      await user.type(within(section).getByLabelText('Hash listing kode'), typed)
      await user.click(within(section).getByRole('button', { name: 'Periksa listing' }))
      const summary = await within(section).findByTestId('code-summary')
      expect(within(summary).queryByTestId('unverifiable-warning') !== null, name).toBe(warn)
      expect(within(summary).queryByTestId('over-limit') !== null, name).toBe(over)
      expect(within(summary).getByRole('button', { name: /^Beli / }), name).toHaveProperty('disabled', over)
      unmount()
    }
  })

  it('TC-FE-032-05 the buyer buys: the voucher continues the state of the pair with resource x207:code:<doc> and is signed with the key that stays in the browser', async () => {
    const user = userEvent.setup()
    const sellerKeys = generateVoucherKeypair()
    const { typed, view } = signedCodeListing(sellerKeys, { verifiable: true })
    const { requests } = renderApp('/kode', (p, init) => {
      if (!init?.method && p.endsWith(`/listings/${typed}`)) return { status: 200, body: view }
      if (init?.method === 'POST' && p.endsWith('/purchases')) return { status: 201, body: { purchase_id: 'p9' } }
      if (!init?.method && p.endsWith('/epochs')) return { status: 200, body: { items: [{ epoch: 42, phase: 'open', proposalDeadline: null }], nextCursor: null } }
      if (rpcMethod(init) === 'member') return rpcResult({ account_id: SELLER, pubkey_voucher: sellerKeys.publicKey, status: 'active' })
      if (rpcMethod(init) === 'obligation') return rpcResult({ cumulative: '2000000', last_seq: 3 })
      return undefined
    }, false, createMockWallet(BUYER, BUYER))
    const section = await screen.findByRole('region', { name: 'Pembelian kode' })
    await user.type(screen.getAllByLabelText(/Kunci voucher/)[0]!, KEY)
    await user.type(within(section).getByLabelText('Hash listing kode'), typed)
    await user.click(within(section).getByRole('button', { name: 'Periksa listing' }))
    const summary = await within(section).findByTestId('code-summary')
    expect(requests().filter((r) => r.method === 'POST' && r.path.includes('/x207/'))).toHaveLength(0)
    await user.click(within(summary).getByRole('button', { name: `Beli 5 credit dari ${SELLER} (voucher ditahan backend)` }))
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
    renderApp('/kode', (p, init) => {
      if (!init?.method && p.endsWith(`/listings/${typed}`)) return { status: 200, body: view }
      return undefined
    }, false, createMockWallet(BUYER, BUYER))
    const section = await screen.findByRole('region', { name: 'Pembelian kode' })
    await user.type(within(section).getByLabelText('Hash listing kode'), typed)
    await user.click(within(section).getByRole('button', { name: 'Periksa listing' }))
    expect(await within(section).findByText(/bukan listing kode/)).toBeInTheDocument()
    expect(parseCodeListing({ ...view, detail: 'plain note' } as never)).toBeNull()
  })

  it('TC-FE-032-07 a right code: the window of one hour is shown, the code stays hidden until the buyer asks, and the buyer confirms with a signed notice', async () => {
    const user = userEvent.setup()
    const until = Math.floor(Date.now() / 1000) + 1800
    const { section, requests } = await openPurchase(user, delivered(CODE, CODE, until))
    expect(within(section).getByTestId('dispute-window')).toHaveTextContent(/Sengketa dibuka (29|30) menit/)
    await user.click(within(section).getByRole('button', { name: 'Unduh dan periksa kode' }))
    const ok = await within(section).findByTestId('code-ok')
    expect(ok).not.toHaveTextContent(CODE)
    expect(screen.queryByText(CODE)).not.toBeInTheDocument()
    await user.click(within(ok).getByRole('button', { name: 'Tampilkan kode' }))
    expect(within(ok).getByTestId('code-value')).toHaveTextContent(CODE)
    await user.click(within(ok).getByRole('button', { name: 'Konfirmasi' }))
    await within(section).findByText(/Dikonfirmasi/)
    const post = requests().find((r) => r.method === 'POST')!
    expect(post.body.notice).toMatchObject({ purchase_id: 'p1', actor: BUYER, action: 'confirmed', proof: null })
    expect(JSON.stringify(post.body)).not.toContain(CODE)
    expect(JSON.stringify(post.body)).not.toContain(KEY)
  })

  it('TC-FE-032-08 a wrong code gives a proof that anyone can check; the buyer disputes with it and the code is never sent', async () => {
    const user = userEvent.setup()
    const until = Math.floor(Date.now() / 1000) + 1800
    const body = delivered('WRONG-CODE-0000-AAAA', CODE, until)
    const { section, requests } = await openPurchase(user, body)
    await user.click(within(section).getByRole('button', { name: 'Unduh dan periksa kode' }))
    expect(await within(section).findByTestId('code-cheated')).toHaveTextContent('content_mismatch')
    await user.click(within(section).getByRole('button', { name: 'Sengketakan dengan bukti' }))
    await within(section).findByText(/Sengketa dikirim/)
    const post = requests().find((r) => r.method === 'POST')!
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
    const dispute = within(first.section).getByRole('button', { name: /Sengketakan: kode sudah terpakai/ })
    expect(dispute).toBeEnabled()
    await user.click(dispute)
    await within(first.section).findByText(/Sengketa dikirim/)
    expect(first.requests().find((r) => r.method === 'POST')!.body.notice).toMatchObject({ action: 'disputed', reason: 'other', proof: null })
    first.unmount()
    const late = await openPurchase(user, delivered(CODE, CODE, Math.floor(Date.now() / 1000) - 5))
    expect(within(late.section).getByTestId('dispute-window')).toHaveTextContent('Jendela sengketa sudah lewat')
    expect(within(late.section).getByRole('button', { name: /Sengketakan: kode sudah terpakai/ })).toBeDisabled()
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
    const view = () => ({ purchase_id: 'p7', listing_hash: 'a'.repeat(64), buyer: BUYER, seller: SELLER, status, content_hash: codeHash(CODE), source: null, cipher_hash: null, release: null, release_signature: null })
    const { requests } = renderApp('/kode', (p, init) => {
      if (!init?.method && p.endsWith('/purchases/p7')) return { status: 200, body: view() }
      if (rpcMethod(init) === 'member') return rpcResult({ account_id: BUYER, pubkey_voucher: buyerKeys.publicKey, status: 'active' })
      if (init?.method === 'POST' && p.endsWith('/purchases/p7')) return { status: 200, body: {} }
      return undefined
    }, false, createMockWallet(SELLER, SELLER))
    const form = await screen.findByRole('form', { name: 'Siapkan kode' })
    await user.type(within(form).getByLabelText(/^Kode/), CODE)
    await user.type(within(form).getByLabelText('Nilai (credit)'), '5')
    await user.type(screen.getAllByLabelText(/Kunci voucher/)[0]!, KEY)
    await user.click(within(form).getByRole('button', { name: 'Hash dan enkripsi kode' }))
    await screen.findByTestId('code-prepared')
    const serve = screen.getByRole('region', { name: 'Layani pembelian kode' })
    await user.type(within(serve).getByLabelText('Nomor pembelian'), 'p7')
    await user.click(within(serve).getByRole('button', { name: 'Buka pembelian' }))
    await within(serve).findByTestId('serve')
    await user.type(within(serve).getByLabelText('Alamat atau CID'), 'https://cdn.example.com/c.enc')
    status = 'cipher_posted'
    await user.click(within(serve).getByRole('button', { name: 'Catat ciphertext' }))
    await within(serve).findByText('Ciphertext dicatat.')
    await user.click(await within(serve).findByRole('button', { name: 'Periksa kunci pembeli di kontrak' }))
    const fingerprint = (await within(serve).findByTestId('buyer-fingerprint')).textContent!
    await user.click(await within(serve).findByRole('button', { name: `Lepas kunci ke ${BUYER} (sidik jari ${fingerprint})` }))
    await within(serve).findByText(/Jendela sengketa satu jam dimulai/)
    const released = requests().filter((r) => r.method === 'POST' && r.path.includes('/purchases/p7'))[1]!
    expect(released.body.notice).toMatchObject({ circle: expect.any(String), buyer: BUYER, content_hash: codeHash(CODE), purchase_id: 'p7' })
    expect(JSON.stringify(released.body)).not.toContain(CODE)
    expect(JSON.stringify(released.body)).not.toContain(KEY)
  })
})
