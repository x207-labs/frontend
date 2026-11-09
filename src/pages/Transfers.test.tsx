import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { generateVoucherKeypair, listingHash, signListing, transferDocumentHash, transferNeedsBond, transferResource, verifyVoucher, voucherPublicKey, type TransferDocument } from '@x207/core'
import { forgetHeld } from '../lib/codeFlow'
import { base58Encode } from '../lib/barter'
import { parseTransferListing, prepareTransfer, windowSecondsLeft } from '../lib/transferFlow'
import { CONTRACT_ID } from '../config'
import { renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const SELLER = 'seller.x207-circle.near'
const BUYER = 'buyer.x207-circle.near'
const SEED = Uint8Array.from(new Array<number>(32).fill(5))
const KEY = `ed25519:${base58Encode(SEED)}`
const rpcResult = (value: unknown) => ({ status: 200, body: { jsonrpc: '2.0', id: 'x207', result: { result: Array.from(new TextEncoder().encode(JSON.stringify(value))) } } })
const rpcMethod = (init?: RequestInit): string | undefined => (init?.body ? (JSON.parse(String(init.body)) as { params?: { method_name?: string } }).params?.method_name : undefined)

const docOf = (over: Partial<TransferDocument> = {}): TransferDocument => ({
  circle: CONTRACT_ID, seller: SELLER, platform: 'domain', transfer_ref: 'example-shop.com', proof_method: 'dns_txt', estimate_seconds: 86_400, value: '30000000', nonce: 'n1', ...over,
})
/** A listing of a transfer, really signed, as the read API would answer it. `detailOver` changes the detail after the hash was made (a hostile API). */
function signedTransferListing(sellerKeys: { secretKey: string }, doc: TransferDocument = docOf(), detailOver: Record<string, unknown> = {}) {
  const detail = JSON.stringify({
    kind: 'transfer', transfer_doc: transferDocumentHash(doc), platform: doc.platform, transfer_ref: doc.transfer_ref, proof_method: doc.proof_method, estimate_seconds: doc.estimate_seconds, nonce: doc.nonce, ...detailOver,
  })
  const asset = doc.platform === 'domain' ? 'transfer:domain' : doc.platform === 'game_item' ? 'transfer:game-item' : 'transfer:ticket'
  const listing = {
    circle: CONTRACT_ID, account: SELLER, offer: { asset_type: asset, asset_class: 'B' as const, quantity: 1, value: doc.value }, want: { asset_type: 'x', asset_class: 'A' as const, quantity: 1, value: doc.value },
    terms: '', detail, expires_at: 1_893_456_000, discount_bps: 0, accept_payment: true, discoverable: true, nonce: 'l1',
  }
  const view = {
    listingHash: listingHash(listing), account: SELLER, offer: { assetType: asset, assetClass: 'B', quantity: 1, value: doc.value }, want: { assetType: 'x', assetClass: 'A', quantity: 1, value: doc.value },
    terms: '', detail, expiresAt: '2030-01-01T00:00:00Z', discountBps: 0, acceptPayment: true, discoverable: true, nonce: 'l1', signature: signListing(listing, sellerKeys.secretKey as `ed25519:${string}`), status: 'open',
  }
  return { typed: listingHash(listing), view }
}
const errWith = (status: number, code: string, details: Record<string, unknown>) => ({ status, body: { error: { code, message: code, details } } })
const transferBody = (over: Record<string, unknown> = {}) => ({
  transferId: 7, listingHash: 'a'.repeat(64), buyer: BUYER, seller: SELLER, platform: 'domain', proofMethod: 'dns_txt', transferRef: 'example-shop.com', status: 'paid_held',
  windowUntil: Math.floor(Date.now() / 1000) + 3 * 86_400, tradeOfferId: null, proof: null, cancelReason: null, ...over,
})

describe('FE-033 transfers through the official feature of a platform', () => {
  it('TC-FE-033-01 the seller prepares a domain listing: the document, its hash, the detail without any secret, and the TXT steps with the listing hash', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/transfers', undefined, false, createMockWallet(SELLER, SELLER))
    const form = await screen.findByRole('form', { name: 'Prepare transfer listing' })
    await user.type(within(form).getByLabelText(/^Domain name/), 'example-shop.com')
    await user.type(within(form).getByLabelText(/^Estimated time/), '86400')
    await user.type(within(form).getByLabelText('Price (credit)'), '30')
    await user.click(within(form).getByRole('button', { name: 'Prepare listing' }))
    const out = await screen.findByTestId('transfer-prepared')
    const detail = JSON.parse(screen.getByTestId('transfer-detail').textContent!) as Record<string, unknown>
    expect(detail).toMatchObject({ kind: 'transfer', platform: 'domain', transfer_ref: 'example-shop.com', proof_method: 'dns_txt', estimate_seconds: 86_400 })
    expect(out).toHaveTextContent(String(detail.transfer_doc))
    expect(out).toHaveTextContent('transfer:domain')
    expect(screen.getByTestId('sell-txt')).toHaveTextContent('x207-sell=<listing hash>')
    const hash = 'b'.repeat(64)
    await user.type(within(form).getByLabelText('Listing hash'), hash)
    expect(screen.getByTestId('sell-txt')).toHaveTextContent(`x207-sell=${hash}`)
    expect(screen.getByTestId('platform-limits')).toHaveTextContent('60 days')
    expect(requests().filter((r) => r.method === 'POST')).toHaveLength(0) // nothing is sent
  })

  it('TC-FE-033-02 a ticket shows the warning about the resale law and the limit of 100 credit; a ticket above it is refused by the SDK; a price of 100 credit or more says that it needs a bond', async () => {
    const user = userEvent.setup()
    renderApp('/transfers', undefined, false, createMockWallet(SELLER, SELLER))
    const form = await screen.findByRole('form', { name: 'Prepare transfer listing' })
    await user.selectOptions(within(form).getByLabelText('Platform'), 'ticket')
    expect(within(form).getByTestId('ticket-legal')).toHaveTextContent('local law')
    expect(within(form).getByTestId('ticket-legal')).toHaveTextContent('100 credit')
    await user.type(within(form).getByLabelText(/^Ticket/), 'Concert A, row 4')
    await user.type(within(form).getByLabelText(/^Estimated time/), '3600')
    await user.type(within(form).getByLabelText('Price (credit)'), '150')
    await user.click(within(form).getByRole('button', { name: 'Prepare listing' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('transfer_ticket_over_limit')
    await user.selectOptions(within(form).getByLabelText('Platform'), 'domain')
    await user.clear(within(form).getByLabelText(/^Domain name|^Ticket|^Item/))
    await user.type(within(form).getByLabelText(/^Domain name/), 'big-shop.com')
    await user.clear(within(form).getByLabelText(/^Estimated time/))
    await user.type(within(form).getByLabelText(/^Estimated time/), '3600')
    await user.clear(within(form).getByLabelText('Price (credit)'))
    await user.type(within(form).getByLabelText('Price (credit)'), '250')
    await user.click(within(form).getByRole('button', { name: 'Prepare listing' }))
    expect(await within(form).findByTestId('bond-needed')).toHaveTextContent('needs a bond')
  })

  it('TC-FE-033-03 the listing is rebuilt from the signed listing and must hash to transfer_doc: a changed detail or a changed price is not a valid transfer listing', () => {
    const sellerKeys = generateVoucherKeypair()
    const good = signedTransferListing(sellerKeys)
    const parsed = parseTransferListing(CONTRACT_ID, good.view as never)
    expect(parsed).toMatchObject({ documentHash: transferDocumentHash(docOf()), needsBond: false, windowSeconds: 604_800 })
    expect(parseTransferListing(CONTRACT_ID, signedTransferListing(sellerKeys, docOf(), { transfer_ref: 'other-shop.com' }).view as never)).toBeNull()
    expect(parseTransferListing(CONTRACT_ID, { ...good.view, offer: { ...good.view.offer, value: '1' } } as never)).toBeNull() // the price came from the listing, so the document changes
    expect(parseTransferListing(CONTRACT_ID, { ...good.view, detail: 'plain note' } as never)).toBeNull()
    expect(parseTransferListing(CONTRACT_ID, { ...good.view, detail: JSON.stringify({ kind: 'code' }) } as never)).toBeNull()
    expect(parseTransferListing(CONTRACT_ID, signedTransferListing(sellerKeys, docOf({ value: '250000000' })).view as never)).toMatchObject({ needsBond: true })
    const prepared = prepareTransfer({ circle: CONTRACT_ID, seller: SELLER, platform: 'domain', transferRef: 'example-shop.com', estimateSeconds: 86_400, value: '30000000', nonce: 'n1' })
    expect(prepared.resource).toBe(transferResource(prepared.documentHash))
    expect(transferNeedsBond(prepared.document)).toBe(false)
  })

  it('TC-FE-033-04 the buyer checks the listing (what, proof, window, price, key of the seller), then buys: the voucher has the resource of the document and continues the pair, and the key stays in the browser', async () => {
    forgetHeld()
    const user = userEvent.setup()
    const sellerKeys = generateVoucherKeypair()
    const { typed, view } = signedTransferListing(sellerKeys)
    const { requests } = renderApp('/transfers', (p, init) => {
      if (!init?.method && p.endsWith(`/listings/${typed}`)) return { status: 200, body: view }
      if (init?.method === 'POST' && p.endsWith(`/listings/${typed}/transfers`)) return { status: 201, body: transferBody({ instructions: { setTxtAfterTransfer: 'x207-own=7', on: 'example-shop.com' } }) }
      if (!init?.method && p.endsWith('/epochs')) return { status: 200, body: { items: [{ epoch: 42, phase: 'open', proposalDeadline: null }], nextCursor: null } }
      if (!init?.method && p.endsWith('/transfers/7')) return { status: 200, body: transferBody() }
      if (rpcMethod(init) === 'member') return rpcResult({ account_id: SELLER, pubkey_voucher: sellerKeys.publicKey, status: 'active' })
      if (rpcMethod(init) === 'obligation') return rpcResult({ cumulative: '2000000', last_seq: 3 })
      return undefined
    }, false, createMockWallet(BUYER, BUYER))
    const section = await screen.findByRole('region', { name: 'Buy a transfer' })
    await user.type(within(section).getByLabelText(/Voucher key/), KEY)
    await user.type(within(section).getByLabelText('Transfer listing hash'), typed)
    await user.click(within(section).getByRole('button', { name: 'Check listing' }))
    const summary = await within(section).findByTestId('transfer-summary')
    expect(summary).toHaveTextContent('example-shop.com')
    expect(summary).toHaveTextContent('DNS TXT record')
    expect(summary).toHaveTextContent('7 d 0 h')
    expect(summary).toHaveTextContent('30 credit')
    expect(summary).toHaveTextContent('never moves')
    expect(summary).toHaveTextContent(SELLER) // the seller moved from the button name into the summary card
    expect(requests().filter((r) => r.method === 'POST' && r.path.includes('/x207/'))).toHaveLength(0) // nothing is signed before the click
    await user.click(within(summary).getByRole('button', { name: 'Buy for 30 credit' }))
    await waitFor(() => expect(requests().some((r) => r.method === 'POST' && r.path.endsWith('/transfers'))).toBe(true))
    const post = requests().find((r) => r.method === 'POST' && r.path.endsWith('/transfers'))!
    expect(post.body.voucher).toMatchObject({ payer: BUYER, payee: SELLER, epoch: 42, seq: 4, cumulativeAmount: '32000000', unit: 'credit', resource: transferResource(transferDocumentHash(docOf())) })
    expect(verifyVoucher({ ...post.body.voucher, signature: post.body.signature }, voucherPublicKey(SEED))).toBe(true)
    expect(post.body.buyer_ref).toBeUndefined()
    expect(JSON.stringify(post.body)).not.toContain(KEY)
    expect(await screen.findByTestId('transfer')).toHaveTextContent('Paid, on hold')
    forgetHeld()
  })

  it('TC-FE-033-05 a game item needs the Steam account of the buyer, which goes as buyer_ref; a price that needs a bond cannot be bought here; a hostile API with a changed detail is refused', async () => {
    forgetHeld()
    const user = userEvent.setup()
    const sellerKeys = generateVoucherKeypair()
    const game = docOf({ platform: 'game_item', transfer_ref: '730:1234567890', proof_method: 'trade_api', estimate_seconds: 3600, value: '12000000' })
    const { typed, view } = signedTransferListing(sellerKeys, game)
    const { requests } = renderApp('/transfers', (p, init) => {
      if (!init?.method && p.endsWith(`/listings/${typed}`)) return { status: 200, body: view }
      if (init?.method === 'POST' && p.endsWith(`/listings/${typed}/transfers`)) return { status: 201, body: transferBody({ platform: 'game_item', proofMethod: 'trade_api', transferRef: '730:1234567890' }) }
      if (!init?.method && p.endsWith('/epochs')) return { status: 200, body: { items: [{ epoch: 42, phase: 'open', proposalDeadline: null }], nextCursor: null } }
      if (rpcMethod(init) === 'member') return rpcResult({ account_id: SELLER, pubkey_voucher: sellerKeys.publicKey, status: 'active' })
      if (rpcMethod(init) === 'obligation') return rpcResult(null)
      return undefined
    }, false, createMockWallet(BUYER, BUYER))
    const section = await screen.findByRole('region', { name: 'Buy a transfer' })
    await user.type(within(section).getByLabelText(/Voucher key/), KEY)
    await user.type(within(section).getByLabelText('Transfer listing hash'), typed)
    await user.click(within(section).getByRole('button', { name: 'Check listing' }))
    const summary = await within(section).findByTestId('transfer-summary')
    const buy = within(summary).getByRole('button', { name: /^Buy for/ })
    expect(buy).toBeDisabled() // no Steam account id yet
    expect(summary).toHaveTextContent('1 h')
    await user.type(within(summary).getByLabelText(/Steam account id/), '76561198000000000')
    expect(buy).toBeEnabled()
    await user.click(buy)
    await waitFor(() => expect(requests().some((r) => r.method === 'POST' && r.path.endsWith('/transfers'))).toBe(true))
    expect(requests().find((r) => r.method === 'POST' && r.path.endsWith('/transfers'))!.body.buyer_ref).toBe('76561198000000000')
    forgetHeld()
  })

  it('TC-FE-033-06 a listing that is a bond case or hostile stops before any voucher is signed', async () => {
    const user = userEvent.setup()
    const sellerKeys = generateVoucherKeypair()
    for (const [name, listing, text] of [
      ['needs a bond', signedTransferListing(sellerKeys, docOf({ value: '250000000' })), /needs a bond/],
      ['detail changed after the hash', signedTransferListing(sellerKeys, docOf(), { transfer_ref: 'other-shop.com' }), /not a valid transfer listing/],
      ['not a transfer', signedTransferListing(sellerKeys, docOf(), { kind: 'code' }), /not a valid transfer listing/],
    ] as const) {
      const { typed, view } = listing
      const { requests, unmount } = renderApp('/transfers', (p, init) => {
        if (!init?.method && p.endsWith(`/listings/${typed}`)) return { status: 200, body: view }
        if (rpcMethod(init) === 'member') return rpcResult({ account_id: SELLER, pubkey_voucher: sellerKeys.publicKey, status: 'active' })
        return undefined
      }, false, createMockWallet(BUYER, BUYER))
      const section = await screen.findByRole('region', { name: 'Buy a transfer' })
      await user.type(within(section).getByLabelText(/Voucher key/), KEY)
      await user.type(within(section).getByLabelText('Transfer listing hash'), typed)
      await user.click(within(section).getByRole('button', { name: 'Check listing' }))
      if (name === 'needs a bond') {
        const summary = await within(section).findByTestId('transfer-summary')
        expect(within(summary).getByTestId('bond-needed-buyer')).toHaveTextContent(text)
        expect(within(summary).getByRole('button', { name: /^Buy for/ }), name).toBeDisabled()
      } else {
        expect(await within(section).findByText(text), name).toBeInTheDocument()
        expect(within(section).queryByTestId('transfer-summary'), name).not.toBeInTheDocument()
      }
      expect(requests().filter((r) => r.method === 'POST' && r.path.includes('/x207/')), name).toHaveLength(0)
      unmount()
    }
  })

  async function openTransfer(user: ReturnType<typeof userEvent.setup>, reply: (p: string, init?: RequestInit) => { status: number; body: unknown } | undefined, account = BUYER) {
    const rendered = renderApp('/transfers', reply, false, createMockWallet(account, account))
    const section = await screen.findByRole('region', { name: 'Transfer status' })
    await user.type(within(section).getByLabelText('Transfer number'), '7')
    await user.click(within(section).getByRole('button', { name: 'Open transfer' }))
    await within(section).findByTestId('transfer')
    return { section, ...rendered }
  }

  it('TC-FE-033-07 a domain: the buyer sees the TXT x207-own=<id> to add, asks the proof, and the three answers (met, not yet, platform down) are said in words; the window is counted down', async () => {
    const user = userEvent.setup()
    let answer: { status: number; body: unknown } = errWith(409, 'transfer_proof_pending', { retryAfterSeconds: 30 })
    const { section, requests } = await openTransfer(user, (p, init) => {
      if (!init?.method && p.endsWith('/transfers/7')) return { status: 200, body: transferBody() }
      if (init?.method === 'POST' && p.endsWith('/transfers/7/proof')) return answer
      return undefined
    })
    expect(within(section).getByTestId('own-txt')).toHaveTextContent('x207-own=7')
    expect(within(section).getByTestId('window-left')).toHaveTextContent(/Closes in [23] d/)
    expect(within(section).getByTestId('transfer-limits')).toHaveTextContent('60 days')
    await user.click(within(section).getByRole('button', { name: 'Check the proof' }))
    await within(section).findByText(/does not show the transfer yet; the voucher is still held. Ask again in 30 seconds/)
    expect(requests().find((r) => r.method === 'POST' && r.path.endsWith('/proof'))!.body).toEqual({})
    answer = errWith(503, 'transfer_platform_unavailable', {})
    await user.click(within(section).getByRole('button', { name: 'Check the proof' }))
    await within(section).findByText(/The platform did not answer. Nothing was decided/)
    answer = { status: 200, body: transferBody({ status: 'confirmed', voucher: { payer: BUYER }, voucherSignature: 'ed25519:x' }) }
    await user.click(within(section).getByRole('button', { name: 'Check the proof' }))
    await within(section).findByText(/The proof is met/)
  })

  it('TC-FE-033-08 a ticket: the buyer confirms with a signed notice (keys in the order of the backend, no key of the voucher in the request) and can cancel; the legal warning is shown', async () => {
    const user = userEvent.setup()
    const ticket = { platform: 'ticket', proofMethod: 'buyer_confirm', transferRef: 'Concert A, row 4' }
    const { section, requests } = await openTransfer(user, (p, init) => {
      if (!init?.method && p.endsWith('/transfers/7')) return { status: 200, body: transferBody(ticket) }
      if (init?.method === 'POST' && p.endsWith('/transfers/7')) return { status: 201, body: transferBody({ ...ticket, status: 'confirmed' }) }
      return undefined
    })
    expect(within(section).getByTestId('ticket-steps')).toHaveTextContent('local law')
    const confirm = within(section).getByRole('button', { name: 'Confirm that I received the ticket' })
    expect(confirm).toBeDisabled() // no voucher key yet
    await user.type(screen.getAllByLabelText(/Voucher key/)[0]!, KEY)
    await user.click(confirm)
    await within(section).findByText(/Confirmed: the voucher goes to the seller/)
    const post = requests().find((r) => r.method === 'POST' && r.path.endsWith('/transfers/7'))!
    expect(Object.keys(post.body.notice)).toEqual(['circle', 'transfer_id', 'actor', 'action', 'at'])
    expect(post.body.notice).toMatchObject({ transfer_id: 7, actor: BUYER, action: 'confirmed' })
    expect(post.body.signature).toMatch(/^ed25519:/)
    expect(JSON.stringify(post.body)).not.toContain(KEY)
  })

  it('TC-FE-033-09 a game item asks for the trade offer id the first time, and sends it with the check; a cancelled transfer says why and shows no proof steps', async () => {
    const user = userEvent.setup()
    const game = { platform: 'game_item', proofMethod: 'trade_api', transferRef: '730:1234567890' }
    const { section, requests } = await openTransfer(user, (p, init) => {
      if (!init?.method && p.endsWith('/transfers/7')) return { status: 200, body: transferBody(game) }
      if (init?.method === 'POST' && p.endsWith('/transfers/7/proof')) return errWith(409, 'transfer_proof_pending', { retryAfterSeconds: 3600 })
      return undefined
    })
    const check = within(section).getByRole('button', { name: 'Check the trade' })
    expect(check).toBeDisabled()
    await user.type(within(section).getByLabelText(/Trade offer id/), '5551234')
    await user.click(check)
    await within(section).findByText(/Ask again in 3600 seconds/)
    expect(requests().find((r) => r.method === 'POST' && r.path.endsWith('/proof'))!.body).toEqual({ tradeoffer_id: '5551234' })
  })

  it('TC-FE-033-10 a cancelled transfer says why and has no proof steps; the seconds left never go below zero', async () => {
    const user = userEvent.setup()
    const { section } = await openTransfer(user, (p, init) => (!init?.method && p.endsWith('/transfers/7') ? { status: 200, body: transferBody({ status: 'cancelled', cancelReason: 'transfer_window_passed' }) } : undefined))
    expect(within(section).getByTestId('cancel-reason')).toHaveTextContent('transfer_window_passed')
    expect(within(section).queryByTestId('buyer-txt-steps')).not.toBeInTheDocument()
    expect(within(section).getByText(/The voucher never moved/)).toBeInTheDocument()
    expect(windowSecondsLeft(1000, 400)).toBe(600)
    expect(windowSecondsLeft(1000, 2000)).toBe(0)
  })
})
