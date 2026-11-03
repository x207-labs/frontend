import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkCheatProof, contentHash, listingHash, signListing, createRelease, decryptContent, encryptContent, generateVoucherKeypair, licensePublicKey, openSealedKey, verifyRelease, verifyVoucher, voucherPublicKey, type ContentSource,
} from '@x207/core'
import { base58Encode, sha256Hex } from '../lib/barter'
import { IPFS_GATEWAYS, licenseSources, prepareLicense, proofForApi } from '../lib/licenseFlow'
import { fromHex, toHex } from '../lib/hex'
import { toPurchaseView } from '../api/purchaseView'
import { apiError, renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const CIRCLE = 'x207-circle.testnet'
const SELLER = 'seller.x207-circle.near'
const BUYER = 'buyer.x207-circle.near'
const SEED = Uint8Array.from(new Array<number>(32).fill(5))
const KEY = `ed25519:${base58Encode(SEED)}`
const seller = generateVoucherKeypair()
const text = (s: string) => new TextEncoder().encode(s)
const original = licenseSources.current

afterEach(() => {
  licenseSources.current = original
})

/** A delivered purchase: ciphertext of `data`, release for the buyer, and a fake https source that serves `served`. */
function delivered(data: Uint8Array, claimedHash: string, served?: Uint8Array) {
  const { ciphertext, key } = encryptContent(data)
  const { release, signature } = createRelease({
    circle: CIRCLE, license_hash: 'c'.repeat(64), buyer: BUYER, buyerPublicKey: licensePublicKey(KEY), content_hash: claimedHash, content_size: data.length, purchase_id: 'p1', ciphertext, contentKey: key, at: 1_800_000_000, sellerSecretKey: seller.secretKey,
  })
  const bytes = served ?? ciphertext
  const source: ContentSource = {
    kind: 'https',
    async fetch(_ref, options) {
      options?.onProgress?.(bytes.length)
      return bytes
    },
  }
  licenseSources.current = { https: source }
  return {
    purchase_id: 'p1', listing_hash: 'a'.repeat(64), status: 'key_released', source: { kind: 'https', ref: 'https://cdn.example.com/f.enc' }, cipher_hash: release.cipher_hash,
    release, release_signature: signature, dispute_until: 1_800_259_200, ciphertext,
  }
}
const purchaseReply = (body: Record<string, unknown>) => (p: string, init?: RequestInit) => {
  const { ciphertext: _omit, ...api } = body
  void _omit
  return !init?.method && p.endsWith('/purchases/p1') ? { status: 200, body: api } : undefined
}

async function openPurchase(user: ReturnType<typeof userEvent.setup>, override: Parameters<typeof renderApp>[1]) {
  renderApp('/lisensi', override, false, createMockWallet(BUYER, BUYER))
  const section = await screen.findByRole('region', { name: 'Pembelian lisensi' })
  await user.type(within(section).getByLabelText('Nomor pembelian'), 'p1')
  await user.click(within(section).getByRole('button', { name: 'Buka pembelian' }))
  await within(section).findByTestId('purchase')
  await user.type(screen.getAllByLabelText(/Kunci voucher/)[0]!, KEY)
  await user.type(within(section).getByLabelText(/Kunci publik penjual/), seller.publicKey)
  return section
}

describe('FE-028 content license', () => {
  it('TC-FE-028-01 the license is prepared from the file: hashes, resource, detail of the listing, and a ciphertext that the key opens', async () => {
    const data = text('name,email\nann,ann@example.com\n')
    const p = await prepareLicense({ circle: CIRCLE, seller: SELLER, bytes: data, assetType: 'data:dataset', licenseId: 'personal', licenseText: 'personal use only', previewText: 'name,email', exclusive: false, nonce: 'n1' })
    expect(p.document.content_hash).toBe(contentHash(data))
    expect(p.resource).toBe(`x207:license:${p.documentHash}`)
    expect(JSON.parse(p.detail)).toMatchObject({ kind: 'license', asset_type: 'data:dataset', license_id: 'personal', content_hash: contentHash(data), exclusive: false, license_doc: p.documentHash })
    expect(p.cipherHash).toBe(contentHash(p.ciphertext))
    expect(Buffer.from(decryptContent(p.ciphertext, fromHex(p.contentKey))).equals(Buffer.from(data))).toBe(true)
    expect(p.detail).not.toContain(p.contentKey)
    await expect(prepareLicense({ circle: CIRCLE, seller: SELLER, bytes: data, assetType: 'data:dataset', licenseId: 'Bad Id', licenseText: 'x', previewText: '', exclusive: false, nonce: 'n1' })).rejects.toThrow(/license_bad_license_id/)
  })

  it('TC-FE-028-02 the seller page computes the hash of a chosen file in the browser and shows the detail, the cipher_hash and the key; nothing is sent', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/lisensi', undefined, false, createMockWallet(SELLER, SELLER))
    const form = await screen.findByRole('form', { name: 'Siapkan lisensi' })
    const data = text('a,b\n1,2\n')
    const file = new File([data], 'data.csv', { type: 'text/csv' })
    fireEvent.change(within(form).getByLabelText(/^Berkas/), { target: { files: [file] } })
    await user.type(within(form).getByLabelText(/^Teks lisensi/), 'personal use only')
    await user.click(within(form).getByRole('button', { name: 'Hitung hash dan enkripsi' }))
    const out = await screen.findByTestId('license-prepared')
    expect(out).toHaveTextContent(contentHash(data))
    expect(JSON.parse(screen.getByTestId('license-detail').textContent!)).toMatchObject({ content_hash: contentHash(data), asset_type: 'data:dataset' })
    expect(screen.getByTestId('license-key').textContent).toMatch(/^[0-9a-f]{64}$/)
    expect(requests().filter((r) => r.method === 'POST')).toHaveLength(0)
  })

  it('TC-FE-028-03 a right delivery: progress is shown, the hash matches, and the buyer confirms with a signed notice', async () => {
    const user = userEvent.setup()
    const data = text('the licensed dataset')
    const body = delivered(data, contentHash(data))
    const { requests } = renderApp('/lisensi', (p, init) => purchaseReply(body)(p, init) ?? (init?.method === 'POST' && p.endsWith('/purchases/p1') ? { status: 200, body: {} } : undefined), false, createMockWallet(BUYER, BUYER))
    const section = await screen.findByRole('region', { name: 'Pembelian lisensi' })
    await user.type(within(section).getByLabelText('Nomor pembelian'), 'p1')
    await user.click(within(section).getByRole('button', { name: 'Buka pembelian' }))
    await within(section).findByTestId('purchase')
    await user.type(screen.getAllByLabelText(/Kunci voucher/)[0]!, KEY)
    await user.type(within(section).getByLabelText(/Kunci publik penjual/), seller.publicKey)
    await user.click(within(section).getByRole('button', { name: 'Unduh dan periksa hash' }))
    expect(await within(section).findByTestId('license-ok')).toHaveTextContent('Isi cocok')
    expect(within(section).getByTestId('download-progress')).toHaveTextContent(`Diunduh ${body.ciphertext.length} byte`)
    await user.click(within(section).getByRole('button', { name: 'Konfirmasi' }))
    await within(section).findByText(/Dikonfirmasi/)
    const post = requests().find((r) => r.method === 'POST')!
    expect(post.body.notice).toMatchObject({ purchase_id: 'p1', actor: BUYER, action: 'confirmed', proof: null })
    expect(JSON.stringify(post.body)).not.toContain(KEY)
  })

  it('TC-FE-028-04 a wrong file gives a proof of cheating: the buyer disputes with it, and the proof without the ciphertext is accepted by the checker once the ciphertext is added back', async () => {
    const user = userEvent.setup()
    const claimed = contentHash(text('the file in the listing'))
    const body = delivered(text('another file'), claimed)
    const { requests } = renderApp('/lisensi', (p, init) => purchaseReply(body)(p, init) ?? (init?.method === 'POST' && p.endsWith('/purchases/p1') ? { status: 200, body: {} } : undefined), false, createMockWallet(BUYER, BUYER))
    const section = await screen.findByRole('region', { name: 'Pembelian lisensi' })
    await user.type(within(section).getByLabelText('Nomor pembelian'), 'p1')
    await user.click(within(section).getByRole('button', { name: 'Buka pembelian' }))
    await within(section).findByTestId('purchase')
    await user.type(screen.getAllByLabelText(/Kunci voucher/)[0]!, KEY)
    await user.type(within(section).getByLabelText(/Kunci publik penjual/), seller.publicKey)
    await user.click(within(section).getByRole('button', { name: 'Unduh dan periksa hash' }))
    expect(await within(section).findByTestId('license-cheated')).toHaveTextContent('content_mismatch')
    await user.click(within(section).getByRole('button', { name: 'Sengketakan dengan bukti' }))
    await within(section).findByText(/Sengketa dikirim/)
    const post = requests().find((r) => r.method === 'POST')!
    expect(post.body.notice).toMatchObject({ action: 'disputed', reason: 'content_mismatch' })
    const sent = post.body.notice.proof as ReturnType<typeof proofForApi>
    expect(Object.keys(sent).sort()).toEqual(['box_key', 'release', 'signature'])
    expect(JSON.stringify(post.body)).not.toContain(KEY)
    expect(checkCheatProof({ ...sent, ciphertext: body.ciphertext }, seller.publicKey)).toEqual({ valid: true, reason: 'content_mismatch' })
  })

  it('TC-FE-028-05 bytes from the source that do not match cipher_hash are a wrong source, not cheating: no proof, and a signature of another key is refused', async () => {
    const user = userEvent.setup()
    const data = text('the licensed dataset')
    const body = delivered(data, contentHash(data), text('tampered by the host'))
    const section = await openPurchase(user, (p, init) => purchaseReply(body)(p, init))
    await user.click(within(section).getByRole('button', { name: 'Unduh dan periksa hash' }))
    expect(await within(section).findByTestId('license-refused')).toHaveTextContent('salah sumber, bukan bukti curang')
    expect(within(section).queryByTestId('license-cheated')).not.toBeInTheDocument()
    // the right bytes but the public key of another seller
    licenseSources.current = { https: { kind: 'https', fetch: async () => body.ciphertext } }
    fireEvent.change(within(section).getByLabelText(/Kunci publik penjual/), { target: { value: generateVoucherKeypair().publicKey } })
    await user.click(within(section).getByRole('button', { name: 'Unduh dan periksa hash' }))
    await waitFor(() => expect(within(section).getByTestId('license-refused')).toHaveTextContent('Tanda tangan rilis tidak cocok'))
  })

  /** A listing of the seller, really signed, as the read API would answer it; `typed` is the hash that the user types. */
  const signedListingView = (sellerKeys: { secretKey: string }, over: Record<string, unknown> = {}, detail = JSON.stringify({ kind: 'license', license_doc: 'd'.repeat(64) })) => {
    const listing = {
      circle: CIRCLE, account: SELLER, offer: { asset_type: 'data:dataset', asset_class: 'D' as const, quantity: 1, value: '5000000' }, want: { asset_type: 'x', asset_class: 'D' as const, quantity: 1, value: '5000000' },
      terms: '', detail, expires_at: 1_893_456_000, discount_bps: 0, accept_payment: true, discoverable: true, nonce: 'n1',
    }
    const view = {
      listingHash: listingHash(listing), account: listing.account, offer: { assetType: 'data:dataset', assetClass: 'D', quantity: 1, value: '5000000' }, want: { assetType: 'x', assetClass: 'D', quantity: 1, value: '5000000' },
      terms: '', detail, expiresAt: '2030-01-01T00:00:00Z', discountBps: 0, acceptPayment: true, discoverable: true, nonce: 'n1', signature: signListing(listing, sellerKeys.secretKey as `ed25519:${string}`), status: 'open', ...over,
    }
    return { typed: listingHash(listing), view }
  }
  const rpcResult = (value: unknown) => ({ status: 200, body: { jsonrpc: '2.0', id: 'x207', result: { result: Array.from(new TextEncoder().encode(JSON.stringify(value))) } } })
  const rpcMethod = (init?: RequestInit): string | undefined => (init?.body ? (JSON.parse(String(init.body)) as { params?: { method_name?: string } }).params?.method_name : undefined)

  it('TC-FE-028-06 the buyer buys: the listing is checked first (hash typed, signature against the key of the seller in the contract), payee and price are shown, then the voucher continues the state of the pair and goes to purchases', async () => {
    const user = userEvent.setup()
    const sellerKeys = generateVoucherKeypair()
    const { typed, view } = signedListingView(sellerKeys)
    const { requests } = renderApp('/lisensi', (p, init) => {
      if (!init?.method && p.endsWith(`/listings/${typed}`)) return { status: 200, body: view }
      if (init?.method === 'POST' && p.endsWith('/purchases')) return { status: 201, body: { purchase_id: 'p9' } }
      if (!init?.method && p.endsWith('/epochs')) return { status: 200, body: { items: [{ epoch: 42, phase: 'open', proposalDeadline: null }], nextCursor: null } }
      if (rpcMethod(init) === 'member') return rpcResult({ account_id: SELLER, pubkey_voucher: sellerKeys.publicKey, status: 'active' })
      if (rpcMethod(init) === 'obligation') return rpcResult({ cumulative: '2000000', last_seq: 3 })
      return undefined
    }, false, createMockWallet(BUYER, BUYER))
    const section = await screen.findByRole('region', { name: 'Pembelian lisensi' })
    await user.type(screen.getAllByLabelText(/Kunci voucher/)[0]!, KEY)
    await user.type(within(section).getByLabelText('Hash listing lisensi'), typed)
    await user.click(within(section).getByRole('button', { name: 'Periksa listing' }))
    const summary = await within(section).findByTestId('buy-summary')
    expect(summary).toHaveTextContent(SELLER)
    expect(summary).toHaveTextContent('5 credit')
    expect(requests().filter((r) => r.method === 'POST' && r.path.includes('/x207/'))).toHaveLength(0) // nothing signed before the click on the button with the payee and the price
    await user.click(within(summary).getByRole('button', { name: `Beli 5 credit dari ${SELLER} (voucher ditahan backend)` }))
    await waitFor(() => expect(requests().some((r) => r.method === 'POST' && r.path.endsWith('/purchases'))).toBe(true))
    const post = requests().find((r) => r.method === 'POST' && r.path.endsWith('/purchases'))!
    expect(post.body.voucher).toMatchObject({ payer: BUYER, payee: SELLER, epoch: 42, seq: 4, cumulativeAmount: '7000000', unit: 'credit', resource: `x207:license:${'d'.repeat(64)}` })
    expect(verifyVoucher({ ...post.body.voucher, signature: post.body.signature }, voucherPublicKey(SEED))).toBe(true)
    expect(JSON.stringify(post.body)).not.toContain(KEY)
  })

  it('TC-FE-028-12 [batch 3 F1] a hostile API: another payee and price with a bad signature, a listing of another hash than the typed one, a forged signature and a seller who is not in the contract all stop before any voucher is signed', async () => {
    const user = userEvent.setup()
    const sellerKeys = generateVoucherKeypair()
    const attacker = generateVoucherKeypair()
    const good = signedListingView(sellerKeys)
    const cases: Array<[string, ReturnType<typeof signedListingView>['view'], RegExp, { member: unknown }]> = [
      ['attacker payee, 999 credit, signature not valid', { ...good.view, account: 'attacker.x207-circle.near', offer: { ...good.view.offer, value: '999000000' }, signature: 'ed25519:not-valid' }, /Hash listing dari server tidak sama/, { member: { account_id: SELLER, pubkey_voucher: sellerKeys.publicKey, status: 'active' } }],
      ['same hash typed but the signature is the attacker\'s', { ...good.view, signature: signedListingView(attacker).view.signature }, /Tanda tangan listing tidak cocok/, { member: { account_id: SELLER, pubkey_voucher: sellerKeys.publicKey, status: 'active' } }],
      ['the API names the attacker key but the contract has the real one', good.view, /Tanda tangan listing tidak cocok/, { member: { account_id: SELLER, pubkey_voucher: attacker.publicKey, status: 'active' } }],
      ['the seller is not a member', good.view, /bukan anggota aktif/, { member: null }],
      ['the seller is suspended', good.view, /bukan anggota aktif/, { member: { account_id: SELLER, pubkey_voucher: sellerKeys.publicKey, status: 'suspended' } }],
    ]
    for (const [name, view, reason, chain] of cases) {
      const { requests, unmount } = renderApp('/lisensi', (p, init) => {
        if (!init?.method && p.endsWith(`/listings/${good.typed}`)) return { status: 200, body: view }
        if (rpcMethod(init) === 'member') return rpcResult(chain.member)
        return undefined
      }, false, createMockWallet(BUYER, BUYER))
      const section = await screen.findByRole('region', { name: 'Pembelian lisensi' })
      await user.type(screen.getAllByLabelText(/Kunci voucher/)[0]!, KEY)
      await user.type(within(section).getByLabelText('Hash listing lisensi'), good.typed)
      await user.click(within(section).getByRole('button', { name: 'Periksa listing' }))
      expect(await within(section).findByText(reason), name).toBeInTheDocument()
      expect(within(section).queryByTestId('buy-summary'), name).not.toBeInTheDocument()
      expect(requests().filter((r) => r.method === 'POST' && r.path.includes('/x207/')), name).toHaveLength(0)
      unmount()
    }
  })

  it('TC-FE-028-07 a listing that is not a license cannot be bought', async () => {
    const user = userEvent.setup()
    const sellerKeys = generateVoucherKeypair()
    const { typed, view } = signedListingView(sellerKeys, {}, 'plain note')
    renderApp('/lisensi', (p, init) => {
      if (!init?.method && p.endsWith(`/listings/${typed}`)) return { status: 200, body: view }
      if (rpcMethod(init) === 'member') return rpcResult({ account_id: SELLER, pubkey_voucher: sellerKeys.publicKey, status: 'active' })
      return undefined
    }, false, createMockWallet(BUYER, BUYER))
    const section = await screen.findByRole('region', { name: 'Pembelian lisensi' })
    await user.type(screen.getAllByLabelText(/Kunci voucher/)[0]!, KEY)
    await user.type(within(section).getByLabelText('Hash listing lisensi'), typed)
    await user.click(within(section).getByRole('button', { name: 'Periksa listing' }))
    expect(await within(section).findByText(/bukan listing lisensi/)).toBeInTheDocument()
  })

  it('TC-FE-028-13 [batch 3 F2] a buyer that is not an active member of the contract gets no key, whatever the API says', async () => {
    const user = userEvent.setup()
    const data = text('rows')
    renderApp('/lisensi', (p, init) => {
      if (!init?.method && p.endsWith('/purchases/p7')) return { status: 200, body: { purchase_id: 'p7', listing_hash: 'a'.repeat(64), buyer: BUYER, seller: SELLER, status: 'cipher_posted', content_hash: contentHash(data), license_id: 'personal', exclusive: false, source: null, cipher_hash: null, release: null, release_signature: null } }
      if (!init?.method && p.endsWith(`/members/${BUYER}`)) return { status: 200, body: { account: BUYER, pubkeyVoucher: generateVoucherKeypair().publicKey } }
      if (rpcMethod(init) === 'member') return rpcResult(null)
      return undefined
    }, false, createMockWallet(SELLER, SELLER))
    const form = await screen.findByRole('form', { name: 'Siapkan lisensi' })
    fireEvent.change(within(form).getByLabelText(/^Berkas/), { target: { files: [new File([data], 'd.csv')] } })
    await user.type(within(form).getByLabelText(/^Teks lisensi/), 'terms')
    await user.type(screen.getAllByLabelText(/Kunci voucher/)[0]!, KEY)
    await user.click(within(form).getByRole('button', { name: 'Hitung hash dan enkripsi' }))
    await screen.findByTestId('license-prepared')
    const serve = screen.getByRole('region', { name: 'Layani pembelian' })
    await user.type(within(serve).getByLabelText('Nomor pembelian'), 'p7')
    await user.click(within(serve).getByRole('button', { name: 'Buka pembelian' }))
    await user.click(await within(serve).findByRole('button', { name: 'Periksa kunci pembeli di kontrak' }))
    expect(await within(serve).findByText(/bukan anggota aktif di kontrak/)).toBeInTheDocument()
    expect(within(serve).queryByTestId('buyer-key')).not.toBeInTheDocument()
  })

  it('TC-FE-028-14 [batch 3 F3] a purchase view that carries another id than the one opened is not signed for', async () => {
    const user = userEvent.setup()
    const data = text('the licensed dataset')
    const body = delivered(data, contentHash(data))
    const { requests } = renderApp('/lisensi', (p, init) => {
      if (!init?.method && p.endsWith('/purchases/p1')) return { status: 200, body: { ...body, purchase_id: 'p999', ciphertext: undefined } } // the API answers with another purchase
      if (init?.method === 'POST' && p.includes('/purchases/')) return { status: 200, body: {} }
      return undefined
    }, false, createMockWallet(BUYER, BUYER))
    const section = await screen.findByRole('region', { name: 'Pembelian lisensi' })
    await user.type(within(section).getByLabelText('Nomor pembelian'), 'p1')
    await user.click(within(section).getByRole('button', { name: 'Buka pembelian' }))
    await within(section).findByTestId('purchase')
    await user.type(screen.getAllByLabelText(/Kunci voucher/)[0]!, KEY)
    await user.type(within(section).getByLabelText(/Kunci publik penjual/), seller.publicKey)
    await user.click(within(section).getByRole('button', { name: 'Unduh dan periksa hash' }))
    // the release names purchase p1 while the view says p999: the buyer's SDK refuses the delivery, and the dispute button still checks the id before it signs
    expect(await within(section).findByTestId('license-refused')).toHaveTextContent('pembelian lain')
    await user.click(await within(section).findByRole('button', { name: 'Sengketakan (alasan lain)' }))
    expect(await within(section).findByText(/bukan p1 yang Anda buka/)).toBeInTheDocument()
    expect(requests().filter((r) => r.method === 'POST' && r.path.includes('/x207/'))).toHaveLength(0)
  })

  it('TC-FE-028-08 takedown sends the claim, the hash of the evidence and a signature; the backend error is shown', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/lisensi', (p, init) => (init?.method === 'POST' && p.endsWith('/takedown') ? { status: 200, body: {} } : undefined), false, createMockWallet(BUYER, BUYER))
    const form = await screen.findByRole('form', { name: 'Takedown' })
    await user.type(screen.getAllByLabelText(/Kunci voucher/)[0]!, KEY)
    await user.type(within(form).getByLabelText('Hash listing'), 'a'.repeat(64))
    await user.type(within(form).getByLabelText(/^Pernyataan/), 'I own the rights')
    await user.type(within(form).getByLabelText(/^Bukti kepemilikan/), 'https://registry.example/work/1')
    await user.click(within(form).getByRole('button', { name: /ajukan takedown/ }))
    await within(form).findByText(/Takedown diajukan/)
    const post = requests().find((r) => r.method === 'POST')!
    expect(post.path).toContain(`/listings/${'a'.repeat(64)}/takedown`)
    expect(post.body).toMatchObject({ claim: 'I own the rights', evidence_hash: expect.stringMatching(/^[0-9a-f]{64}$/), signature: expect.stringMatching(/^ed25519:/) })
    expect(post.body.evidence_hash).not.toBe('')
    expect(JSON.stringify(post.body)).not.toContain('registry.example')
  })

  it('TC-FE-028-09 an unknown status is an error, camelCase is accepted, the default gateways are https, and an API error is shown with its code', async () => {
    expect(() => toPurchaseView({ purchase_id: 'p', status: 'weird' })).toThrow(/tidak dikenal/)
    expect(toPurchaseView({ purchaseId: 'p', status: 'paid_held', listingHash: 'a', cipherHash: null })).toMatchObject({ purchaseId: 'p', status: 'paid_held', source: null, release: null })
    for (const g of IPFS_GATEWAYS) expect(g.startsWith('https://')).toBe(true)
    renderApp('/lisensi', (p) => (p.includes('/purchases/') ? apiError(404, 'purchase_not_found', 'Pembelian tidak ada') : undefined), false, createMockWallet(BUYER, BUYER))
    const section = await screen.findByRole('region', { name: 'Pembelian lisensi' })
    const user = userEvent.setup()
    await user.type(within(section).getByLabelText('Nomor pembelian'), 'zz')
    await user.click(within(section).getByRole('button', { name: 'Buka pembelian' }))
    expect(await within(section).findByRole('alert')).toHaveTextContent('purchase_not_found')
  })

  it('TC-FE-028-10 the seller serves a purchase: the ciphertext is recorded with a signed cipher_posted notice, then the key is released as a LicenseRelease that the buyer verifies and opens', async () => {
    const user = userEvent.setup()
    const buyerKeys = generateVoucherKeypair()
    const attackerKeys = generateVoucherKeypair()
    const data = text('a,b\n1,2\n3,4\n')
    let status = 'paid_held'
    const view = () => ({
      purchase_id: 'p7', listing_hash: 'a'.repeat(64), buyer: BUYER, seller: SELLER, status, content_hash: contentHash(data), license_id: 'personal', exclusive: false, source: null, cipher_hash: null, release: null, release_signature: null,
    })
    const { requests } = renderApp('/lisensi', (p, init) => {
      if (!init?.method && p.endsWith('/purchases/p7')) return { status: 200, body: view() }
      // the read API names the key of the attacker; the contract has the real one, and the page reads the contract (batch 3 F2)
      if (!init?.method && p.endsWith(`/members/${BUYER}`)) return { status: 200, body: { account: BUYER, pubkeyVoucher: attackerKeys.publicKey } }
      if (rpcMethod(init) === 'member') return rpcResult({ account_id: BUYER, pubkey_voucher: buyerKeys.publicKey, status: 'active' })
      if (init?.method === 'POST' && p.endsWith('/purchases/p7')) return { status: 200, body: {} }
      return undefined
    }, false, createMockWallet(SELLER, SELLER))
    const form = await screen.findByRole('form', { name: 'Siapkan lisensi' })
    fireEvent.change(within(form).getByLabelText(/^Berkas/), { target: { files: [new File([data], 'd.csv')] } })
    await user.type(within(form).getByLabelText(/^Teks lisensi/), 'personal use only')
    await user.type(screen.getAllByLabelText(/Kunci voucher/)[0]!, KEY)
    await user.click(within(form).getByRole('button', { name: 'Hitung hash dan enkripsi' }))
    await screen.findByTestId('license-prepared')
    const serve = screen.getByRole('region', { name: 'Layani pembelian' })
    await user.type(within(serve).getByLabelText('Nomor pembelian'), 'p7')
    await user.click(within(serve).getByRole('button', { name: 'Buka pembelian' }))
    await within(serve).findByTestId('serve')
    await user.type(within(serve).getByLabelText('Alamat atau CID'), 'https://cdn.example.com/d.enc')
    status = 'cipher_posted' // what the book answers once the notice is in: the page reads it again
    await user.click(within(serve).getByRole('button', { name: 'Catat ciphertext' }))
    await within(serve).findByText('Ciphertext dicatat.')
    const posted = requests().find((r) => r.method === 'POST' && r.path.includes('/purchases/p7'))!
    expect(posted.body.notice).toMatchObject({ purchase_id: 'p7', actor: SELLER, action: 'cipher_posted', source: { kind: 'https', ref: 'https://cdn.example.com/d.enc' }, cipher_hash: expect.stringMatching(/^[0-9a-f]{64}$/) })
    expect(Object.keys(posted.body.notice)).toEqual(['circle', 'purchase_id', 'actor', 'action', 'at', 'source', 'cipher_hash'])
    await user.click(await within(serve).findByRole('button', { name: 'Periksa kunci pembeli di kontrak' }))
    const fingerprint = (await within(serve).findByTestId('buyer-fingerprint')).textContent!
    expect(fingerprint).toMatch(/^[0-9a-f]{4}( [0-9a-f]{4}){3}$/)
    await user.click(await within(serve).findByRole('button', { name: `Lepas kunci ke ${BUYER} (sidik jari ${fingerprint})` }))
    await within(serve).findByText(/Kunci dilepas/)
    const released = requests().filter((r) => r.method === 'POST' && r.path.includes('/purchases/p7'))[1]!
    // the notice is a LicenseRelease: the buyer's SDK opens it, and nothing in the request holds the key of the file or the key of the voucher
    expect(Object.keys(released.body.notice)).toEqual(['circle', 'license_hash', 'buyer', 'content_hash', 'cipher_hash', 'sealed_key', 'at', 'content_size', 'cipher_size', 'key_commitment', 'purchase_id'])
    expect(JSON.stringify(released.body)).not.toContain(KEY)
    const prepared = screen.getByTestId('license-key').textContent!
    expect(JSON.stringify(released.body)).not.toContain(prepared)
    expect(verifyRelease(released.body.notice, released.body.signature, licensePublicKey(KEY))).toBe(true)
    const opened = openSealedKey(fromHex(released.body.notice.sealed_key), buyerKeys.secretKey)
    expect(toHex(opened)).toBe(prepared)
    expect(() => openSealedKey(fromHex(released.body.notice.sealed_key), attackerKeys.secretKey)).toThrow() // the key the API named cannot open it
  })

  it('TC-FE-028-11 the detail of a license listing holds what BE-056 asks (license_doc, content_hash, license_id, exclusive, kind) and the preview with its hash only when there is one', async () => {
    const data = text('rows')
    const base = { circle: CIRCLE, seller: SELLER, bytes: data, assetType: 'data:dataset', licenseId: 'personal', licenseText: 'terms', exclusive: true, nonce: 'n1' }
    const without = JSON.parse((await prepareLicense({ ...base, previewText: '' })).detail)
    expect(Object.keys(without).sort()).toEqual(['asset_type', 'content_hash', 'exclusive', 'kind', 'license_doc', 'license_hash', 'license_id'].sort())
    expect(without).toMatchObject({ kind: 'license', exclusive: true })
    const withPreview = JSON.parse((await prepareLicense({ ...base, previewText: '  name,city  ' })).detail)
    expect(withPreview.preview).toBe('name,city')
    expect(withPreview.preview_hash).toBe(await sha256Hex('name,city'))
    expect(toPurchaseView({ purchaseId: '1', status: 'confirmed', buyer: BUYER, seller: SELLER, exclusive: true, needsBond: true, autoConfirmed: true })).toMatchObject({ exclusive: true, needsBond: true, autoConfirmed: true })
  })
})
