import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { orderHash } from '@x207/core'
import { orderDocs, orderHashes, orders } from '../api/fixtures'
import { toOrderView } from '../api/orderView'
import { base58Encode, sha256Hex, signMessageWithVoucher } from '../lib/barter'
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
  await user.click(within(table).getByRole('button', { name: `Buka pesanan ${hash.slice(0, 8)}` }))
}

describe('FE-027 service orders', () => {
  it('TC-FE-027-01 the hashes of the mock are the SDK hash of their documents', () => {
    for (const key of Object.keys(orderDocs) as Array<keyof typeof orderDocs>) expect(orderHash(orderDocs[key] as never), key).toBe(orderHashes[key])
  })

  it('TC-FE-027-02 the list shows the orders of the account; the detail shows the milestones with status and the hash of the delivery', async () => {
    const user = userEvent.setup()
    renderApp('/pesanan', undefined, false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Daftar pesanan' })
    expect(within(table).getAllByRole('row')).toHaveLength(5) // header + four
    await open(table, orderHashes.research, user)
    const milestones = await screen.findByRole('table', { name: 'Tonggak' })
    expect(milestones).toHaveTextContent('Terkirim')
    expect(milestones).toHaveTextContent('Terbuka')
    expect(within(milestones).getByText('ffffffffffff')).toBeInTheDocument()
  })

  it('TC-FE-027-03 the buyer confirms a delivered milestone with a signed notice; the key is not sent', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/pesanan', (p, init) => (init?.method === 'POST' && p.includes('/milestones/1') ? { status: 200, body: orders[0] } : undefined), false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Daftar pesanan' })
    await open(table, orderHashes.research, user)
    await screen.findByRole('table', { name: 'Tonggak' })
    await user.type(screen.getByLabelText(/Kunci voucher/), KEY)
    await user.click(screen.getByRole('button', { name: 'Konfirmasi 1' }))
    await screen.findByText(/Terkirim: confirmed/)
    const post = requests().find((r) => r.method === 'POST')!
    expect(post.path).toContain(`/orders/${orderHashes.research}/milestones/1`)
    expect(post.body.notice).toMatchObject({ order_hash: orderHashes.research, milestone: 1, actor: BUYER, action: 'confirmed' })
    expect(post.body.signature).toMatch(/^ed25519:/)
    expect(JSON.stringify(post.body)).not.toContain(KEY)
  })

  it('TC-FE-027-04 the buyer disputes with a reason; the seller marks delivered only with a sha256 of the deliverable', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/pesanan', (p, init) => (init?.method === 'POST' && p.includes('/milestones/1') ? { status: 200, body: orders[0] } : undefined), false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Daftar pesanan' })
    await open(table, orderHashes.research, user)
    await screen.findByRole('table', { name: 'Tonggak' })
    await user.type(screen.getByLabelText(/Kunci voucher/), KEY)
    await user.selectOptions(screen.getByLabelText('Alasan sengketa 1'), 'not_as_described')
    await user.click(screen.getByRole('button', { name: 'Sengketakan 1' }))
    await screen.findByText(/Terkirim: disputed/)
    expect(requests().find((r) => r.method === 'POST')!.body.notice).toMatchObject({ action: 'disputed', reason: 'not_as_described' })
  })

  it('TC-FE-027-05 the seller delivers the second milestone: the button waits for a valid hash', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/pesanan', (p, init) => (init?.method === 'POST' && p.includes('/milestones/2') ? { status: 200, body: orders[0] } : undefined), false, asSeller())
    const table = await screen.findByRole('table', { name: 'Daftar pesanan' })
    await open(table, orderHashes.research, user)
    await screen.findByRole('table', { name: 'Tonggak' })
    await user.type(screen.getByLabelText(/Kunci voucher/), KEY)
    const button = screen.getByRole('button', { name: 'Tandai terkirim' })
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText('Hash kiriman 2'), 'zz')
    expect(button).toBeDisabled()
    await user.clear(screen.getByLabelText('Hash kiriman 2'))
    await user.type(screen.getByLabelText('Hash kiriman 2'), 'a'.repeat(64))
    await user.click(button)
    await screen.findByText(/Terkirim: delivered/)
    expect(requests().find((r) => r.method === 'POST')!.body.notice).toMatchObject({ action: 'delivered', deliverable_hash: 'a'.repeat(64), milestone: 2 })
  })

  it('TC-FE-027-06 a load test shows the target and says it is not proven; a bond banner for a large order; the check asks the backend', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/pesanan', (p, init) => (init?.method === 'POST' && p.endsWith('/target-check') ? { status: 200, body: { target_verified: true } } : undefined), false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Daftar pesanan' })
    await open(table, orderHashes.loadtest, user)
    expect(await screen.findByText(/kepemilikan belum terbukti/)).toBeInTheDocument()
    expect(screen.getByTestId('order-bond')).toHaveTextContent('CT-094')
    await user.click(screen.getByRole('button', { name: 'Periksa kepemilikan target' }))
    await screen.findByText(/Terkirim: target diperiksa/)
    expect(requests().find((r) => r.method === 'POST')!.path).toContain(`/orders/${orderHashes.loadtest}/target-check`)
  })

  it('TC-FE-027-07 a keeper order shows the on-chain proofs and says the agent pays them; it has no confirm or dispute buttons', async () => {
    const user = userEvent.setup()
    renderApp('/pesanan', undefined, false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Daftar pesanan' })
    await open(table, orderHashes.keeper, user)
    const proofs = await screen.findByTestId('order-proofs')
    expect(await within(proofs).findByText('AbC1')).toBeInTheDocument()
    expect(proofs).toHaveTextContent('payForProofs')
    expect(screen.queryByRole('button', { name: /Konfirmasi|Sengketakan|Tandai terkirim/ })).not.toBeInTheDocument()
  })

  it('TC-FE-027-08 creating a prompt order needs a sample; the form posts the order with the hashes computed in the browser and one signature', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/pesanan', (p, init) => (init?.method === 'POST' && p.endsWith('/orders') ? { status: 201, body: { order_hash: orderHashes.prompt } } : undefined), false, asBuyer())
    await screen.findByRole('table', { name: 'Daftar pesanan' })
    const form = screen.getByRole('form', { name: 'Buat pesanan' })
    await user.selectOptions(within(form).getByLabelText('Jenis jasa'), 'prompt')
    await user.type(within(form).getByLabelText(/^Penjual/), SELLER)
    await user.type(within(form).getByLabelText(/^Spesifikasi kerja/), 'Write a prompt that summarises audits')
    await user.type(within(form).getByLabelText('Jumlah 1 (credit)'), '20')
    fireEvent.change(within(form).getByLabelText('Tenggat 1 (UTC)'), { target: { value: '2030-01-01T10:00' } })
    await user.type(within(form).getByLabelText(/Kunci voucher/), KEY)
    await user.click(within(form).getByRole('button', { name: /Tanda tangani dan buat pesanan/ }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('order_sample_required')
    expect(requests().filter((r) => r.method === 'POST')).toHaveLength(0)
    await user.type(within(form).getByLabelText(/^Contoh hasil/), 'sample output')
    await user.click(within(form).getByRole('button', { name: /Tanda tangani dan buat pesanan/ }))
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
    renderApp('/pesanan', undefined, false, asBuyer())
    await screen.findByRole('table', { name: 'Daftar pesanan' })
    const form = screen.getByRole('form', { name: 'Buat pesanan' })
    await user.selectOptions(within(form).getByLabelText('Jenis jasa'), 'scraping')
    expect(screen.getByTestId('order-note')).toHaveTextContent('ketentuan layanan (ToS)')
    await user.selectOptions(within(form).getByLabelText('Jenis jasa'), 'loadtest')
    expect(screen.getByTestId('order-note')).toHaveTextContent('/.well-known/x207-loadtest')
    expect(within(form).getByLabelText(/^Target uji beban/)).toBeInTheDocument()
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
    const form = await screen.findByRole('form', { name: 'Buat listing' })
    expect(within(form).getByLabelText(/Dikerjakan oleh manusia/)).not.toBeChecked()
  })

  it('TC-FE-027-11 an unknown status from the server is an error, the camelCase answer is accepted, and an API error is shown with its code', async () => {
    expect(() => toOrderView({ ...orders[0]!, status: 'active', milestones: [{ index: 1, amount: '1', due_at: 1, status: 'weird' }] })).toThrow(/tidak dikenal/)
    expect(toOrderView({ orderHash: 'a'.repeat(64), order: orders[0]!.order, status: 'active', needsBond: true, targetVerified: true, milestones: [] })).toMatchObject({ orderHash: 'a'.repeat(64), needsBond: true, targetVerified: true })
    renderApp('/pesanan', (p) => (p.includes('/orders') ? apiError(500, 'order_unavailable', 'buku pesanan belum siap') : undefined), false, asBuyer())
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
    const { requests } = renderApp('/pesanan', withOrder(body), false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Daftar pesanan' })
    await user.click(within(table).getByRole('button', { name: /^Buka pesanan/ }))
    await screen.findByRole('table', { name: 'Tonggak' })
    await user.type(screen.getByLabelText(/Kunci voucher/), KEY)
    expect(screen.getByText(/lead dan bug tidak dikonfirmasi otomatis/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Terima hasil 1' }))
    await screen.findByText(/Terkirim: hasil accepted/)
    const post = requests().find((r) => r.method === 'POST')!
    expect(post.path).toMatch(/\/orders\/[0-9a-f]{64}\/outcomes$/)
    expect(post.body.notice).toMatchObject({ milestone: 1, actor: BUYER, action: 'accepted', deliverable_hash: null })
    await user.click(screen.getByRole('button', { name: 'Tolak hasil 1' }))
    await waitFor(() => expect(requests().filter((r) => r.method === 'POST')).toHaveLength(2))
    expect(requests().filter((r) => r.method === 'POST')[1]!.body.notice).toMatchObject({ action: 'rejected', reason: 'not_received' })
  })

  it('TC-FE-027-13 the seller proposes the result of an open place; the cancel rules: the seller until confirmation, the buyer only after the due date of an open milestone', async () => {
    const user = userEvent.setup()
    const body = leadOrder()
    const seller = renderApp('/pesanan', withOrder(body), false, asSeller())
    let table = await screen.findByRole('table', { name: 'Daftar pesanan' })
    await user.click(within(table).getByRole('button', { name: /^Buka pesanan/ }))
    await screen.findByRole('table', { name: 'Tonggak' })
    await user.type(screen.getByLabelText(/Kunci voucher/), KEY)
    await user.type(screen.getByLabelText('Hash kiriman 2'), 'b'.repeat(64))
    await user.click(screen.getByRole('button', { name: 'Ajukan hasil' }))
    await screen.findByText(/Terkirim: hasil proposed/)
    expect(seller.requests().find((r) => r.method === 'POST')!.body.notice).toMatchObject({ milestone: 2, action: 'proposed', deliverable_hash: 'b'.repeat(64) })
    expect(screen.getByRole('button', { name: 'Batalkan 1' })).toBeInTheDocument() // delivered, not confirmed: the seller may withdraw
    expect(screen.getByRole('button', { name: 'Batalkan 2' })).toBeInTheDocument()
    seller.unmount()
    renderApp('/pesanan', withOrder(body), false, asBuyer())
    table = await screen.findByRole('table', { name: 'Daftar pesanan' })
    await user.click(within(table).getByRole('button', { name: /^Buka pesanan/ }))
    await screen.findByRole('table', { name: 'Tonggak' })
    // the due dates of the mock are in the past of 2026-11-03? the buyer may cancel an open milestone only after its due date
    const dueIsPast = Math.floor(Date.now() / 1000) > 1793186400
    expect(screen.queryByRole('button', { name: 'Batalkan 2' }) !== null).toBe(dueIsPast)
    expect(screen.queryByRole('button', { name: 'Batalkan 1' })).not.toBeInTheDocument() // delivered: only the seller may withdraw
  })

  it('TC-FE-027-14 an order signed by one party only is proposed and says who must still sign; the extra fields of BE-054 are read', async () => {
    const user = userEvent.setup()
    const body = leadOrder({ status: 'proposed', signedBy: [BUYER] })
    renderApp('/pesanan', withOrder(body), false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Daftar pesanan' })
    await user.click(within(table).getByRole('button', { name: /^Buka pesanan/ }))
    expect(await screen.findByText(/pesanan terbuka setelah kedua pihak menandatangani/)).toBeInTheDocument()
    const view = toOrderView(leadOrder({ milestones: [{ index: 1, amount: '1', dueAt: 1, status: 'confirmed', outcome: 'accepted', deliverableHash: null, at: 5, confirmBy: 9, autoConfirmed: true, disputeReason: null }] }))
    expect(view.milestones[0]).toMatchObject({ outcome: 'accepted', confirmBy: 9, autoConfirmed: true })
  })

  it('TC-FE-027-15 [batch 3 F3] the hash is computed again from the order that is shown: an API that shows one order and carries the hash of another gets no signature', async () => {
    const user = userEvent.setup()
    const shown = leadOrder()
    const other = orderHash({ ...(leadDoc as never as Record<string, unknown>), nonce: 'other' } as never)
    const lying = { ...shown, orderHash: other } // the list and the detail both name the hash of another order
    const { requests } = renderApp('/pesanan', (p, init) => {
      if (p.startsWith('/x207/circles/agents-main/orders/') && !init?.method) return { status: 200, body: lying }
      if (p.includes('/orders?')) return { status: 200, body: { items: [lying], nextCursor: null } }
      if (init?.method === 'POST') return { status: 200, body: lying }
      return undefined
    }, false, asBuyer())
    const table = await screen.findByRole('table', { name: 'Daftar pesanan' })
    await user.click(within(table).getByRole('button', { name: /^Buka pesanan/ }))
    await screen.findByRole('table', { name: 'Tonggak' })
    await user.type(screen.getByLabelText(/Kunci voucher/), KEY)
    await user.click(screen.getByRole('button', { name: 'Terima hasil 1' }))
    expect(await screen.findByText(/Hash pesanan yang dihitung dari dokumen yang ditampilkan tidak sama/)).toBeInTheDocument()
    expect(requests().filter((r) => r.method === 'POST' && r.path.includes('/x207/'))).toHaveLength(0)
  })
})
