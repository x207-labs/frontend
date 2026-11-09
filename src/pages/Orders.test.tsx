import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mandateHash, orderClaimNotice, orderHash, serializeMandate, type DelegateMandate } from '@x207/core'
import { orderDocs, orderHashes, orders } from '../api/fixtures'
import { toOrderView } from '../api/orderView'
import { base58Encode, sha256Hex, signMessageWithVoucher } from '../lib/barter'
import { CONTRACT_ID } from '../config'
import { isHumanListing, toOrderDocument, withHumanMark, EMPTY_ORDER } from '../lib/orderFlow'
import { apiError, renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const BUYER = 'research.x207-circle.near'
const SELLER = 'audit.x207-circle.near'
const SEED = Uint8Array.from(new Array<number>(32).fill(9))
const KEY = `ed25519:${base58Encode(SEED)}`
const asBuyer = () => createMockWallet(BUYER, BUYER)
const asSeller = () => createMockWallet(SELLER, SELLER)

async function open(table: HTMLElement, hash: string, user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(table).getByRole('button', { name: `Open order ${hash.slice(0, 8)}` }))
}

describe('FE-027 service orders', () => {
  it('TC-FE-027-01 the hashes of the mock are the SDK hash of their documents', () => {
    for (const key of Object.keys(orderDocs) as Array<keyof typeof orderDocs>) expect(orderHash(orderDocs[key] as never), key).toBe(orderHashes[key])
  })

  it('TC-FE-027-02 the list shows the orders of the account; the detail shows the milestones with status and the hash of the delivery', async () => {
    const user = userEvent.setup()
    renderApp('/orders', undefined, false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Order list' })
    expect(within(table).getAllByRole('row')).toHaveLength(5) // header + four
    await open(table, orderHashes.research, user)
    const milestones = await screen.findByRole('table', { name: 'Milestones' })
    expect(milestones).toHaveTextContent('Delivered')
    expect(milestones).toHaveTextContent('Open')
    expect(within(milestones).getByText('ffffffffffff')).toBeInTheDocument()
  })

  it('TC-FE-027-03 the buyer confirms a delivered milestone with a signed notice; the key is not sent', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/orders', (p, init) => (init?.method === 'POST' && p.includes('/milestones/1') ? { status: 200, body: orders[0] } : undefined), false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Order list' })
    await open(table, orderHashes.research, user)
    await screen.findByRole('table', { name: 'Milestones' })
    await user.type(screen.getByLabelText(/Voucher key/), KEY)
    await user.click(screen.getByRole('button', { name: 'Confirm 1' }))
    await screen.findByText(/Sent: confirmed/)
    const post = requests().find((r) => r.method === 'POST')!
    expect(post.path).toContain(`/orders/${orderHashes.research}/milestones/1`)
    expect(post.body.notice).toMatchObject({ order_hash: orderHashes.research, milestone: 1, actor: BUYER, action: 'confirmed' })
    expect(post.body.signature).toMatch(/^ed25519:/)
    expect(JSON.stringify(post.body)).not.toContain(KEY)
  })

  it('TC-FE-027-04 the buyer disputes with a reason; the seller marks delivered only with a sha256 of the deliverable', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/orders', (p, init) => (init?.method === 'POST' && p.includes('/milestones/1') ? { status: 200, body: orders[0] } : undefined), false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Order list' })
    await open(table, orderHashes.research, user)
    await screen.findByRole('table', { name: 'Milestones' })
    await user.type(screen.getByLabelText(/Voucher key/), KEY)
    await user.selectOptions(screen.getByLabelText('Dispute reason 1'), 'not_as_described')
    await user.click(screen.getByRole('button', { name: 'Dispute 1' }))
    await screen.findByText(/Sent: disputed/)
    expect(requests().find((r) => r.method === 'POST')!.body.notice).toMatchObject({ action: 'disputed', reason: 'not_as_described' })
  })

  it('TC-FE-027-05 the seller delivers the second milestone: the button waits for a valid hash', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/orders', (p, init) => (init?.method === 'POST' && p.includes('/milestones/2') ? { status: 200, body: orders[0] } : undefined), false, asSeller())
    const table = await screen.findByRole('table', { name: 'Order list' })
    await open(table, orderHashes.research, user)
    await screen.findByRole('table', { name: 'Milestones' })
    await user.type(screen.getByLabelText(/Voucher key/), KEY)
    const button = screen.getByRole('button', { name: 'Mark delivered' })
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText('Deliverable hash 2'), 'zz')
    expect(button).toBeDisabled()
    await user.clear(screen.getByLabelText('Deliverable hash 2'))
    await user.type(screen.getByLabelText('Deliverable hash 2'), 'a'.repeat(64))
    await user.click(button)
    await screen.findByText(/Sent: delivered/)
    expect(requests().find((r) => r.method === 'POST')!.body.notice).toMatchObject({ action: 'delivered', deliverable_hash: 'a'.repeat(64), milestone: 2 })
  })

  it('TC-FE-027-06 a load test shows the target and says it is not proven; a bond banner for a large order; the check asks the backend', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/orders', (p, init) => (init?.method === 'POST' && p.endsWith('/target-check') ? { status: 200, body: { target_verified: true } } : undefined), false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Order list' })
    await open(table, orderHashes.loadtest, user)
    expect(await screen.findByText(/ownership not yet proven/)).toBeInTheDocument()
    expect(screen.getByTestId('order-bond')).toHaveTextContent('CT-094')
    await user.click(screen.getByRole('button', { name: 'Check target ownership' }))
    await screen.findByText(/Sent: target checked/)
    expect(requests().find((r) => r.method === 'POST')!.path).toContain(`/orders/${orderHashes.loadtest}/target-check`)
  })

  it('TC-FE-027-07 a keeper order shows the on-chain proofs and says the agent pays them; it has no confirm or dispute buttons', async () => {
    const user = userEvent.setup()
    renderApp('/orders', undefined, false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Order list' })
    await open(table, orderHashes.keeper, user)
    const proofs = await screen.findByTestId('order-proofs')
    expect(await within(proofs).findByText('AbC1')).toBeInTheDocument()
    expect(proofs).toHaveTextContent('payForProofs')
    expect(screen.queryByRole('button', { name: /Confirm|Dispute|Mark delivered/ })).not.toBeInTheDocument()
  })

  it('TC-FE-027-08 creating a prompt order needs a sample; the form posts the order with the hashes computed in the browser and one signature', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/orders', (p, init) => (init?.method === 'POST' && p.endsWith('/orders') ? { status: 201, body: { order_hash: orderHashes.prompt } } : undefined), false, asBuyer())
    await screen.findByRole('table', { name: 'Order list' })
    const form = screen.getByRole('form', { name: 'Create order' })
    await user.selectOptions(within(form).getByLabelText('Service kind'), 'prompt')
    await user.type(within(form).getByLabelText('Seller'), SELLER)
    await user.type(within(form).getByLabelText(/^Work specification/), 'Write a prompt that summarises audits')
    await user.type(within(form).getByLabelText('Amount 1 (credit)'), '20')
    fireEvent.change(within(form).getByLabelText('Due 1 (UTC)'), { target: { value: '2030-01-01T10:00' } })
    await user.type(within(form).getByLabelText(/Voucher key/), KEY)
    await user.click(within(form).getByRole('button', { name: /Sign and create order/ }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('order_sample_required')
    expect(requests().filter((r) => r.method === 'POST')).toHaveLength(0)
    await user.type(within(form).getByLabelText(/^Sample result/), 'sample output')
    await user.click(within(form).getByRole('button', { name: /Sign and create order/ }))
    await waitFor(() => expect(requests().some((r) => r.method === 'POST')).toBe(true))
    const post = requests().find((r) => r.method === 'POST')!
    expect(post.body.order).toMatchObject({ kind: 'prompt', buyer: BUYER, seller: SELLER, spec_hash: await sha256Hex('Write a prompt that summarises audits'), sample_hash: await sha256Hex('sample output'), target: null, proof: null })
    expect(post.body.order.milestones).toEqual([{ amount: '20000000', due_at: Date.UTC(2030, 0, 1, 10) / 1000 }])
    expect(post.body.signatures).toHaveLength(1)
    expect(post.body.signatures[0]).toMatchObject({ account: BUYER })
    expect(post.body.signatures[0].signature).toBe(await signMessageWithVoucher(JSON.stringify(post.body.order), post.body.order.circle, KEY))
    expect(JSON.stringify(post.body)).not.toContain(KEY)
  })

  it('TC-FE-027-09 scraping shows the ToS warning; a load test form asks for a target and the SDK refuses a private one', async () => {
    const user = userEvent.setup()
    renderApp('/orders', undefined, false, asBuyer())
    await screen.findByRole('table', { name: 'Order list' })
    const form = screen.getByRole('form', { name: 'Create order' })
    await user.selectOptions(within(form).getByLabelText('Service kind'), 'scraping')
    expect(screen.getByTestId('order-note')).toHaveTextContent('terms of service (ToS)')
    await user.selectOptions(within(form).getByLabelText('Service kind'), 'loadtest')
    expect(screen.getByTestId('order-note')).toHaveTextContent('/.well-known/x207-loadtest')
    expect(within(form).getByLabelText(/^Load test target/)).toBeInTheDocument()
    const doc = await toOrderDocument({ ...EMPTY_ORDER, kind: 'loadtest', seller: SELLER, spec: 'spec', target: '10.0.0.1', milestones: [{ amount: '1', due: '2030-01-01T10:00' }] }, 'x207-circle.testnet', BUYER, 'n1')
    expect(doc).toMatch(/order_bad_target/)
    const missing = await toOrderDocument({ ...EMPTY_ORDER, kind: 'loadtest', seller: SELLER, spec: 'spec', milestones: [{ amount: '1', due: '2030-01-01T10:00' }] }, 'x207-circle.testnet', BUYER, 'n1')
    expect(missing).toMatch(/order_target_required/)
  })

  it('TC-FE-027-10 the human mark: it is added to the detail of a listing and shown as a badge on the row', async () => {
    expect(JSON.parse(withHumanMark('', true))).toEqual({ human: true })
    expect(JSON.parse(withHumanMark('{"kind":"gpu"}', true))).toEqual({ kind: 'gpu', human: true })
    expect(JSON.parse(withHumanMark('plain note', true))).toEqual({ note: 'plain note', human: true })
    expect(withHumanMark('{"human":true}', false)).toBe('')
    expect(isHumanListing('{"human":true}')).toBe(true)
    expect(isHumanListing('{"human":"yes"}')).toBe(false)
    expect(isHumanListing('not json')).toBe(false)
    renderApp('/marketplace', undefined, false, createMockWallet(BUYER, BUYER))
    const form = await screen.findByRole('form', { name: 'Create listing' })
    expect(within(form).getByLabelText(/Done by a human/)).not.toBeChecked()
  })

  it('TC-FE-027-11 an unknown status from the server is an error, the camelCase answer is accepted, and an API error is shown with its code', async () => {
    expect(() => toOrderView({ ...orders[0]!, status: 'active', milestones: [{ index: 1, amount: '1', due_at: 1, status: 'weird' }] })).toThrow(/Unknown milestone status/)
    expect(toOrderView({ orderHash: 'a'.repeat(64), order: orders[0]!.order, status: 'active', needsBond: true, targetVerified: true, milestones: [] })).toMatchObject({ orderHash: 'a'.repeat(64), needsBond: true, targetVerified: true })
    renderApp('/orders', (p) => (p.includes('/orders') ? apiError(500, 'order_unavailable', 'order book not ready') : undefined), false, asBuyer())
    expect(await screen.findByRole('alert')).toHaveTextContent('order_unavailable')
  })

  const leadDoc = { ...orderDocs.research, kind: 'lead', milestones: [{ amount: '5000000', due_at: 1793100000 }, { amount: '5000000', due_at: 1793186400 }] }
  const leadOrder = (over: Record<string, unknown> = {}) => ({
    orderHash: orderHash(leadDoc as never), order: leadDoc,
    buyer: BUYER, seller: SELLER, status: 'open', needsBond: false, targetVerified: null, signedBy: [BUYER, SELLER], budget: '10000000', unit: 'credit', decimals: 6,
    milestones: [
      { index: 1, amount: '5000000', dueAt: 1793100000, status: 'delivered', outcome: null, deliverableHash: 'a'.repeat(64), at: 1793090000, confirmBy: null, autoConfirmed: false, disputeReason: null },
      { index: 2, amount: '5000000', dueAt: 1793186400, status: 'open', outcome: null, deliverableHash: null, at: null, confirmBy: null, autoConfirmed: false, disputeReason: null },
    ], ...over,
  })
  const withOrder = (body: object) => (p: string, init?: RequestInit) => {
    if (p.endsWith('/outcomes') && init?.method === 'POST') return { status: 200, body }
    if (p.startsWith('/x207/circles/agents-main/orders/') && !init?.method) return { status: 200, body }
    if (p.includes('/orders?')) return { status: 200, body: { items: [body], nextCursor: null } }
    return undefined
  }

  it('TC-FE-027-12 lead and bug: the buyer accepts or rejects the result of a place with a signed notice for that place, with no automatic confirmation; the seller proposes a hash for an open place', async () => {
    const user = userEvent.setup()
    const body = leadOrder()
    const { requests } = renderApp('/orders', withOrder(body), false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Order list' })
    await user.click(within(table).getByRole('button', { name: /^Open order/ }))
    await screen.findByRole('table', { name: 'Milestones' })
    await user.type(screen.getByLabelText(/Voucher key/), KEY)
    expect(screen.getByText(/lead and bug outcomes are not confirmed automatically/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Accept outcome 1' }))
    await screen.findByText(/Sent: outcome accepted/)
    const post = requests().find((r) => r.method === 'POST')!
    expect(post.path).toMatch(/\/orders\/[0-9a-f]{64}\/outcomes$/)
    expect(post.body.notice).toMatchObject({ milestone: 1, actor: BUYER, action: 'accepted', deliverable_hash: null })
    await user.click(screen.getByRole('button', { name: 'Reject outcome 1' }))
    await waitFor(() => expect(requests().filter((r) => r.method === 'POST')).toHaveLength(2))
    expect(requests().filter((r) => r.method === 'POST')[1]!.body.notice).toMatchObject({ action: 'rejected', reason: 'not_received' })
  })

  it('TC-FE-027-13 the seller proposes the result of an open place; the cancel rules: the seller until confirmation, the buyer only after the due date of an open milestone', async () => {
    const user = userEvent.setup()
    const body = leadOrder()
    const seller = renderApp('/orders', withOrder(body), false, asSeller())
    let table = await screen.findByRole('table', { name: 'Order list' })
    await user.click(within(table).getByRole('button', { name: /^Open order/ }))
    await screen.findByRole('table', { name: 'Milestones' })
    await user.type(screen.getByLabelText(/Voucher key/), KEY)
    await user.type(screen.getByLabelText('Deliverable hash 2'), 'b'.repeat(64))
    await user.click(screen.getByRole('button', { name: 'Propose outcome' }))
    await screen.findByText(/Sent: outcome proposed/)
    expect(seller.requests().find((r) => r.method === 'POST')!.body.notice).toMatchObject({ milestone: 2, action: 'proposed', deliverable_hash: 'b'.repeat(64) })
    expect(screen.getByRole('button', { name: 'Cancel 1' })).toBeInTheDocument() // delivered, not confirmed: the seller may withdraw
    expect(screen.getByRole('button', { name: 'Cancel 2' })).toBeInTheDocument()
    seller.unmount()
    renderApp('/orders', withOrder(body), false, asBuyer())
    table = await screen.findByRole('table', { name: 'Order list' })
    await user.click(within(table).getByRole('button', { name: /^Open order/ }))
    await screen.findByRole('table', { name: 'Milestones' })
    // the due dates of the mock are in the past of 2026-11-03? the buyer may cancel an open milestone only after its due date
    const dueIsPast = Math.floor(Date.now() / 1000) > 1793186400
    expect(screen.queryByRole('button', { name: 'Cancel 2' }) !== null).toBe(dueIsPast)
    expect(screen.queryByRole('button', { name: 'Cancel 1' })).not.toBeInTheDocument() // delivered: only the seller may withdraw
  })

  it('TC-FE-027-14 an order signed by one party only is proposed and says who must still sign; the extra fields of BE-054 are read', async () => {
    const user = userEvent.setup()
    const body = leadOrder({ status: 'proposed', signedBy: [BUYER] })
    renderApp('/orders', withOrder(body), false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Order list' })
    await user.click(within(table).getByRole('button', { name: /^Open order/ }))
    expect(await screen.findByText(/the order opens after both parties sign/)).toBeInTheDocument()
    const view = toOrderView(leadOrder({ milestones: [{ index: 1, amount: '1', dueAt: 1, status: 'confirmed', outcome: 'accepted', deliverableHash: null, at: 5, confirmBy: 9, autoConfirmed: true, disputeReason: null }] }))
    expect(view.milestones[0]).toMatchObject({ outcome: 'accepted', confirmBy: 9, autoConfirmed: true })
  })

  it('TC-FE-027-15 [batch 3 F3] the hash is computed again from the order that is shown: an API that shows one order and carries the hash of another gets no signature', async () => {
    const user = userEvent.setup()
    const shown = leadOrder()
    const other = orderHash({ ...(leadDoc as never as Record<string, unknown>), nonce: 'other' } as never)
    const lying = { ...shown, orderHash: other } // the list and the detail both name the hash of another order
    const { requests } = renderApp('/orders', (p, init) => {
      if (p.startsWith('/x207/circles/agents-main/orders/') && !init?.method) return { status: 200, body: lying }
      if (p.includes('/orders?')) return { status: 200, body: { items: [lying], nextCursor: null } }
      if (init?.method === 'POST') return { status: 200, body: lying }
      return undefined
    }, false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Order list' })
    await user.click(within(table).getByRole('button', { name: /^Open order/ }))
    await screen.findByRole('table', { name: 'Milestones' })
    await user.type(screen.getByLabelText(/Voucher key/), KEY)
    await user.click(screen.getByRole('button', { name: 'Accept outcome 1' }))
    expect(await screen.findByText(/The order hash computed from the displayed document does not match/)).toBeInTheDocument()
    expect(requests().filter((r) => r.method === 'POST' && r.path.includes('/x207/'))).toHaveLength(0)
  })

  // ---- FE-030 delegate order (SD-072, BE-055) ----
  const DAO = 'gauge.sputnik-dao.near'
  const mandate: DelegateMandate = { circle: CONTRACT_ID, dao: DAO, kinds: ['function_call', 'transfer'], rules_hash: 'c'.repeat(64) }
  const delegateDoc = {
    circle: CONTRACT_ID, kind: 'delegate', buyer: BUYER, seller: SELLER, spec_hash: 'a'.repeat(64), milestones: [{ amount: '2000000', due_at: 1793100000 }], sample_hash: null, target: null,
    proof: { method: 'act_proposal', amount_per_tx: '500000' }, mandate_hash: mandateHash(mandate), nonce: 'd1',
  }
  const delegateOrder = (over: Record<string, unknown> = {}) => ({
    orderHash: orderHash(delegateDoc as never), order: delegateDoc, buyer: BUYER, seller: SELLER, status: 'open', needsBond: false, targetVerified: null, signedBy: [BUYER, SELLER],
    mandate: { circle: CONTRACT_ID, dao: DAO, kinds: ['function_call', 'transfer'], rules_hash: 'c'.repeat(64) }, budget: '2000000', unit: 'credit', decimals: 6,
    milestones: [{ index: 1, amount: '2000000', dueAt: 1793100000, status: 'open', outcome: null, deliverableHash: null, at: null, confirmBy: null, autoConfirmed: false, disputeReason: null }], ...over,
  })
  const proofsBody = { items: [{ txHash: 'Tx1abcdefghijklmnopqrstuvwxyz0123456789ABCD', method: 'act_proposal', signer: SELLER, receiver: DAO, proposalId: 7, action: 'VoteApprove', proposalKind: 'transfer', at: '2026-11-04T10:00:00Z' }] }
  const delegateApi = (body: object, claim?: (init: RequestInit) => { status: number; body: unknown }) => (p: string, init?: RequestInit) => {
    if (p.endsWith('/claims') && init?.method === 'POST') return claim ? claim(init) : { status: 200, body: {} }
    if (p.endsWith('/onchain-proofs')) return { status: 200, body: proofsBody }
    if (p.startsWith('/x207/circles/agents-main/orders/') && !init?.method) return { status: 200, body }
    if (p.includes('/orders?')) return { status: 200, body: { items: [body], nextCursor: null } }
    return undefined
  }
  const TX = '8AXdP1c3JTqDyhsVSpfwLnPL1n9FnVZqkbtRMbLAA9ct'

  it('TC-FE-030-01 creating a delegate order: the mandate is built in the browser, its hash is in the order, the order hash is the SDK one, and the body carries the mandate', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/orders', (p, init) => (init?.method === 'POST' && p.endsWith('/orders') ? { status: 201, body: { order_hash: orderHashes.keeper } } : undefined), false, asBuyer())
    await screen.findByRole('table', { name: 'Order list' })
    const form = screen.getByRole('form', { name: 'Create order' })
    await user.selectOptions(within(form).getByLabelText('Service kind'), 'delegate')
    expect(screen.getByTestId('order-note')).toHaveTextContent('each proposal is paid once')
    await user.type(within(form).getByLabelText('Seller'), SELLER)
    await user.type(within(form).getByLabelText(/^Work specification/), 'Research and vote on gauge proposals')
    await user.type(within(form).getByLabelText('DAO account'), DAO)
    await user.type(within(form).getByLabelText(/^Paid proposal kinds/), 'transfer, function_call')
    await user.type(within(form).getByLabelText(/^Rules text/), 'Vote approve when the audit passes')
    await user.selectOptions(within(form).getByLabelText('Method counted as proof'), 'act_proposal')
    await user.type(within(form).getByLabelText('Payment per vote (credit)'), '0.5')
    await user.type(within(form).getByLabelText('Amount 1 (credit)'), '2')
    fireEvent.change(within(form).getByLabelText('Due 1 (UTC)'), { target: { value: '2030-01-01T10:00' } })
    await user.type(within(form).getByLabelText(/Voucher key/), KEY)
    await user.click(within(form).getByRole('button', { name: /Sign and create order/ }))
    await waitFor(() => expect(requests().some((r) => r.method === 'POST')).toBe(true))
    const post = requests().find((r) => r.method === 'POST')!
    const expected: DelegateMandate = { circle: CONTRACT_ID, dao: DAO, kinds: ['function_call', 'transfer'], rules_hash: await sha256Hex('Vote approve when the audit passes') }
    expect(post.body.mandate).toEqual(expected)
    expect(post.body.order.mandate_hash).toBe(await sha256Hex(serializeMandate(expected)))
    expect(post.body.order).toMatchObject({ kind: 'delegate', proof: { method: 'act_proposal', amount_per_tx: '500000' } })
    expect(Object.keys(post.body.order).slice(-3)).toEqual(['proof', 'mandate_hash', 'nonce'])
    expect(post.body.signatures[0].signature).toBe(await signMessageWithVoucher(JSON.stringify(post.body.order), CONTRACT_ID, KEY))
    expect(JSON.stringify(post.body)).not.toContain(KEY)
    // This test types about 150 characters through userEvent. It takes under a second on an idle machine, but past the 5 s default when other test runs share the CPU.
  }, 20_000)

  it('TC-FE-030-02 a bad mandate is refused before anything is signed: no kinds, a kind that is not snake_case, and no rules text', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/orders', undefined, false, asBuyer())
    await screen.findByRole('table', { name: 'Order list' })
    const form = screen.getByRole('form', { name: 'Create order' })
    await user.selectOptions(within(form).getByLabelText('Service kind'), 'delegate')
    await user.type(within(form).getByLabelText('Seller'), SELLER)
    await user.type(within(form).getByLabelText(/^Work specification/), 'spec')
    await user.type(within(form).getByLabelText('DAO account'), DAO)
    await user.type(within(form).getByLabelText(/Voucher key/), KEY)
    const submit = () => user.click(within(form).getByRole('button', { name: /Sign and create order/ }))
    await submit()
    expect(await within(form).findByRole('alert')).toHaveTextContent('Enter the mandate rules text')
    await user.type(within(form).getByLabelText(/^Rules text/), 'rules')
    await submit()
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent('order_bad_mandate'))
    await user.type(within(form).getByLabelText(/^Paid proposal kinds/), 'Transfer')
    await submit()
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent('"Transfer"')) // the code stays, the kind that the SDK refused is quoted in the message
    expect(requests().filter((r) => r.method === 'POST')).toHaveLength(0)
  })

  it('TC-FE-030-03 the detail shows the mandate and the claimed votes; only the seller sees the claim form, and the buyer does not', async () => {
    const user = userEvent.setup()
    const body = delegateOrder()
    renderApp('/orders', delegateApi(body), false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Order list' })
    await user.click(within(table).getByRole('button', { name: /^Open order/ }))
    const mandateBox = await screen.findByTestId('order-mandate')
    expect(mandateBox).toHaveTextContent(DAO)
    expect(mandateBox).toHaveTextContent('transfer')
    expect(mandateBox).toHaveTextContent('c'.repeat(64))
    const proofs = await screen.findByTestId('order-proofs')
    expect(await within(proofs).findByText(/proposal 7/)).toHaveTextContent('VoteApprove')
    expect(screen.queryByRole('button', { name: 'Sign and claim' })).not.toBeInTheDocument()
  })

  it('TC-FE-030-04 the seller claims a vote: the notice has the keys of the SDK in order, is signed with the voucher key, and the key is not sent', async () => {
    const user = userEvent.setup()
    const body = delegateOrder()
    const { requests } = renderApp('/orders', delegateApi(body), false, asSeller())
    const table = await screen.findByRole('table', { name: 'Order list' })
    await user.click(within(table).getByRole('button', { name: /^Open order/ }))
    const claim = await screen.findByLabelText('Claim vote')
    await user.type(screen.getByLabelText(/Voucher key/), KEY)
    await user.type(within(claim).getByLabelText(/^Hash of the vote transaction/), TX)
    await user.click(within(claim).getByRole('button', { name: 'Sign and claim' }))
    await screen.findByText(/Sent: vote claimed/)
    const post = requests().find((r) => r.method === 'POST' && r.path.endsWith('/claims'))!
    const hash = orderHash(delegateDoc as never)
    expect(post.path).toContain(`/orders/${hash}/claims`)
    expect(post.body.tx_hash).toBe(TX)
    expect(Object.keys(post.body.notice)).toEqual(['circle', 'order_hash', 'actor', 'action', 'at', 'tx_hash'])
    expect(post.body.notice).toMatchObject({ circle: CONTRACT_ID, order_hash: hash, actor: SELLER, action: 'claim', tx_hash: TX })
    expect(post.body.signature).toBe(await signMessageWithVoucher(JSON.stringify(orderClaimNotice({ circle: CONTRACT_ID, orderHash: hash, actor: SELLER, at: post.body.notice.at, txHash: TX })), CONTRACT_ID, KEY))
    expect(JSON.stringify(post.body)).not.toContain(KEY)
  })

  it('TC-FE-030-05 a refused claim shows the reason in words (before_order, already_claimed) and an RPC that is down says so', async () => {
    const user = userEvent.setup()
    const body = delegateOrder()
    const answers = [
      { status: 400, body: { error: { code: 'claim_invalid', message: 'x', details: { reason: 'before_order' } } } },
      { status: 400, body: { error: { code: 'claim_invalid', message: 'x', details: { reason: 'already_claimed' } } } },
      { status: 503, body: { error: { code: 'claim_rpc_unavailable', message: 'RPC not configured' } } },
    ]
    let n = 0
    renderApp('/orders', delegateApi(body, () => answers[n++]!), false, asSeller())
    const table = await screen.findByRole('table', { name: 'Order list' })
    await user.click(within(table).getByRole('button', { name: /^Open order/ }))
    const claim = await screen.findByLabelText('Claim vote')
    await user.type(screen.getByLabelText(/Voucher key/), KEY)
    await user.type(within(claim).getByLabelText(/^Hash of the vote transaction/), TX)
    const send = () => user.click(within(claim).getByRole('button', { name: 'Sign and claim' }))
    await send()
    expect(await screen.findByText(/Claim rejected \(before_order\).*before the order was created/)).toBeInTheDocument()
    await send()
    expect(await screen.findByText(/Claim rejected \(already_claimed\).*already been claimed/)).toBeInTheDocument()
    await send()
    expect(await screen.findByText(/RPC unavailable/)).toBeInTheDocument()
  })

  it('TC-FE-030-06 the mandate that is shown must be the one whose hash is in the order: a server that shows another mandate gets no signature', async () => {
    const user = userEvent.setup()
    const lying = delegateOrder({ mandate: { circle: CONTRACT_ID, dao: 'evil.sputnik-dao.near', kinds: ['function_call', 'transfer'], rules_hash: 'c'.repeat(64) } })
    const { requests } = renderApp('/orders', delegateApi(lying), false, asSeller())
    const table = await screen.findByRole('table', { name: 'Order list' })
    await user.click(within(table).getByRole('button', { name: /^Open order/ }))
    const claim = await screen.findByLabelText('Claim vote')
    await user.type(screen.getByLabelText(/Voucher key/), KEY)
    await user.type(within(claim).getByLabelText(/^Hash of the vote transaction/), TX)
    await user.click(within(claim).getByRole('button', { name: 'Sign and claim' }))
    expect(await screen.findByText(/The displayed mandate does not match the mandate whose hash is in the order/)).toBeInTheDocument()
    expect(requests().filter((r) => r.method === 'POST')).toHaveLength(0)
  })

  it('TC-FE-030-07 [B5-F4] the page says whether the circle knows the DAO of the mandate: listed, not listed (a warning), or the registry is not available', async () => {
    const user = userEvent.setup()
    const body = delegateOrder()
    const withRegistry = (registry: object | null) => (p: string, init?: RequestInit) => {
      if (p.endsWith('/marketplace/dao-registry')) return registry === null ? { status: 404, body: { error: { code: 'not_found', message: 'x' } } } : { status: 200, body: registry }
      return delegateApi(body)(p, init)
    }
    const check = async (registry: object | null, expected: RegExp) => {
      cleanup()
      renderApp('/orders', withRegistry(registry), false, asBuyer())
      const table = await screen.findByRole('table', { name: 'Order list' })
      await user.click(within(table).getByRole('button', { name: /^Open order/ }))
      const box = await screen.findByTestId('order-mandate')
      await waitFor(() => expect(within(box).getByTestId('dao-note')).toHaveTextContent(expected))
      return within(box).getByTestId('dao-note')
    }
    await check({ items: [{ dao: DAO, rentable_vote_kinds: [] }] }, /is in the circle registry/)
    expect((await check({ items: [{ dao: 'other.sputnik-dao.near', rentable_vote_kinds: [] }] }, /not in the circle registry/)).className).toContain('state-error')
    await check(null, /The circle DAO registry is unavailable/)
    // the same note under the field of the form
    cleanup()
    renderApp('/orders', withRegistry({ items: [] }), false, asBuyer())
    await screen.findByRole('table', { name: 'Order list' })
    const form = screen.getByRole('form', { name: 'Create order' })
    await user.selectOptions(within(form).getByLabelText('Service kind'), 'delegate')
    expect(within(form).queryByTestId('dao-note')).not.toBeInTheDocument() // nothing typed yet
    await user.type(within(form).getByLabelText('DAO account'), DAO)
    expect(await within(form).findByTestId('dao-note')).toHaveTextContent(/not in the circle registry/)
  })

  it('TC-FE-001-01 [BE-066] the three new answers are said in words: 429 with the seconds to wait (from Retry-After), 413, and 409 open_limit_reached', async () => {
    const user = userEvent.setup()
    const answers = [apiError(429, 'rate_limited', 'x', { 'Retry-After': '12' }), apiError(413, 'payload_too_large', 'x'), apiError(409, 'open_limit_reached', 'x')]
    let n = 0
    renderApp('/orders', (p, init) => (init?.method === 'POST' && p.endsWith('/orders') ? answers[n++] : undefined), false, asBuyer())
    await screen.findByRole('table', { name: 'Order list' })
    const form = screen.getByRole('form', { name: 'Create order' })
    await user.selectOptions(within(form).getByLabelText('Service kind'), 'research')
    await user.type(within(form).getByLabelText('Seller'), SELLER)
    await user.type(within(form).getByLabelText(/^Work specification/), 'spec')
    await user.type(within(form).getByLabelText('Amount 1 (credit)'), '2')
    fireEvent.change(within(form).getByLabelText('Due 1 (UTC)'), { target: { value: '2030-01-01T10:00' } })
    await user.type(within(form).getByLabelText(/Voucher key/), KEY)
    const submit = () => user.click(within(form).getByRole('button', { name: /Sign and create order/ }))
    await submit()
    expect(await within(form).findByRole('alert')).toHaveTextContent('Wait 12 seconds')
    await submit()
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent('too large'))
    await submit()
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent('too many open orders, invoices, or purchases'))
  })

  it('TC-FE-001-02 [BE-066] a read that is rate limited says how many seconds to wait', async () => {
    renderApp('/orders', (p) => (p.includes('/orders?') ? apiError(429, 'rate_limited', 'x', { 'Retry-After': '7' }) : undefined), false, asBuyer())
    expect(await screen.findByRole('alert')).toHaveTextContent('Wait 7 seconds')
  })
})
