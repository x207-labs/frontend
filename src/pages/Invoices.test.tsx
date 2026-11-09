import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { invoiceHash, signVoucher, verifyVoucher, voucherPublicKey } from '@x207/core'
import { invoiceDocs, invoiceHashes, invoices } from '../api/fixtures'
import { toInvoiceView } from '../api/invoiceView'
import { base58Encode, signVoucherInBrowser } from '../lib/barter'
import { apiError, renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const MAKER = 'maker.x207-circle.near'
const SUPPLIER = 'supplier.x207-circle.near'
const SEED = Uint8Array.from(new Array<number>(32).fill(7))
const KEY = `ed25519:${base58Encode(SEED)}`
const PUBLIC = voucherPublicKey(SEED)
const CIRCLE = 'x207-circle.testnet'

describe('FE-025 invoice and installments', () => {
  it('TC-FE-025-01 the hashes of the mock are the SDK hash of their documents, and the browser voucher signature equals the SDK signature', async () => {
    invoiceDocs.forEach((doc, i) => expect(invoiceHash(doc)).toBe(invoiceHashes[i]))
    const v = { circle: CIRCLE, payer: MAKER, payee: SUPPLIER, epoch: 44, seq: 1, cumulativeAmount: '100000000', unit: 'credit', resource: `x207:invoice:${invoiceHashes[0]}` } as const
    const sdk = signVoucher(v, SEED)
    expect(await signVoucherInBrowser(v, KEY)).toBe(sdk.signature)
    expect(verifyVoucher({ ...v, signature: await signVoucherInBrowser(v, KEY) as `ed25519:${string}` }, PUBLIC)).toBe(true)
  })

  it('TC-FE-025-02 the list shows the invoices of the account with status and installments, and the detail shows the schedule with the reason of a failed one', async () => {
    const user = userEvent.setup()
    renderApp('/invoices', undefined, false, createMockWallet(SUPPLIER, SUPPLIER))
    const table = await screen.findByRole('table', { name: 'Invoice list' })
    expect(within(table).getByText('INV-2026-001')).toBeInTheDocument()
    expect(within(table).getByText('INV-2026-002')).toBeInTheDocument()
    await user.click(within(table).getByRole('button', { name: 'Open INV-2026-002' }))
    const schedule = await screen.findByRole('table', { name: 'Installment schedule' })
    expect(within(schedule).getAllByRole('row')).toHaveLength(4)
    expect(schedule).toHaveTextContent('debtor headroom exhausted')
    expect(screen.getByTestId('invoice-bond')).toHaveTextContent('CT-094')
    // the supplier is the debtor of this invoice: the catch-up is offered for the installment that failed for headroom, and only for that one
    expect(screen.getAllByRole('button', { name: /Catch-up installment/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Catch-up installment 2' })).toBeInTheDocument()
  })

  it('TC-FE-025-03 the filter by status is sent to the API', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/invoices', undefined, false, createMockWallet(SUPPLIER, SUPPLIER))
    await screen.findByRole('table', { name: 'Invoice list' })
    await user.selectOptions(screen.getByLabelText('Status'), 'approved')
    await waitFor(() => expect(calls().some((c) => c.includes('/invoices?') && c.includes('status=approved') && c.includes(`party=${encodeURIComponent(SUPPLIER)}`))).toBe(true))
  })

  it('TC-FE-025-04 an invoice that is already approved has nothing to approve, and the issuer of a requested one only waits', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/invoices', undefined, false, createMockWallet(SUPPLIER, SUPPLIER))
    const table = await screen.findByRole('table', { name: 'Invoice list' })
    await user.click(within(table).getByRole('button', { name: 'Open INV-2026-002' }))
    await screen.findByRole('table', { name: 'Installment schedule' })
    expect(screen.queryByRole('button', { name: /Approve and sign/ })).not.toBeInTheDocument()
    await user.click(within(table).getByRole('button', { name: 'Open INV-2026-001' }))
    expect(await screen.findByText('Waiting for the debtor to approve.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Reject invoice/ })).not.toBeInTheDocument()
    expect(requests().filter((r) => r.method === 'POST')).toHaveLength(0)
  })

  it('TC-FE-025-05 approval of a requested invoice signs all installments at once and posts them to approve', async () => {
    const user = userEvent.setup()
    const requested = { ...invoices[1]!, status: 'requested', installments: invoices[1]!.installments.map((i) => ({ ...i, status: 'scheduled', reason: null })) }
    const { requests } = renderApp(
      '/invoices',
      (p, init) => {
        if (init?.method === 'POST' && p.endsWith('/approve')) return { status: 200, body: { ...requested, status: 'approved' } }
        if (p.startsWith('/x207/circles/agents-main/invoices/') && !init?.method) return { status: 200, body: requested }
        if (p.includes('/invoices?')) return { status: 200, body: { items: [requested], nextCursor: null } }
        return undefined
      },
      false,
      createMockWallet(SUPPLIER, SUPPLIER),
    )
    const table = await screen.findByRole('table', { name: 'Invoice list' })
    await user.click(within(table).getByRole('button', { name: 'Open INV-2026-002' }))
    expect(await screen.findByTestId('invoice-advance-note')).toHaveTextContent('3 voucher')
    expect(screen.getByTestId('invoice-advance-note')).toHaveTextContent('not a guarantee')
    await user.type(screen.getByLabelText(/Voucher key/), KEY)
    await user.click(screen.getByRole('button', { name: /Approve and sign/ }))
    await screen.findByText(/3 installment vouchers signed/)
    const post = requests().find((r) => r.method === 'POST' && r.path.endsWith('/approve'))!
    expect(post.path).toContain(`/invoices/${invoiceHashes[1]}/approve`)
    const sent = post.body.vouchers as Array<{ voucher: Record<string, unknown>; signature: `ed25519:${string}` }>
    expect(sent.map((s) => [s.voucher.epoch, s.voucher.seq, s.voucher.cumulativeAmount])).toEqual([[44, 1, '30000000'], [45, 1, '30000000'], [46, 1, '30000000']])
    for (const s of sent) {
      expect(s.voucher).toMatchObject({ payer: SUPPLIER, payee: 'retailer.x207-circle.near', unit: 'credit', resource: `x207:invoice:${invoiceHashes[1]}` })
      expect(verifyVoucher({ ...s.voucher, signature: s.signature } as never, PUBLIC)).toBe(true)
    }
    expect(JSON.stringify(post.body)).not.toContain(KEY)
  })

  it('TC-FE-025-06 the debtor refuses to sign when the server hash does not match the document or the schedule differs from the plan', async () => {
    const user = userEvent.setup()
    const base = { ...invoices[1]!, status: 'requested' }
    const cases: Array<[object, RegExp]> = [
      [{ ...base, invoice_hash: 'f'.repeat(64) }, /The invoice hash does not match/],
      [{ ...base, installments: base.installments.map((i, k) => (k === 1 ? { ...i, epoch: 99 } : i)) }, /The installment schedule from the server does not match/],
      [{ ...base, installments: base.installments.map((i, k) => (k === 0 ? { ...i, amount: '29999999' } : i)) }, /The installment schedule from the server does not match/],
    ]
    for (const [body, reason] of cases) {
      const { requests, unmount } = renderApp('/invoices', (p, init) => {
        if (p.startsWith('/x207/circles/agents-main/invoices/') && !init?.method) return { status: 200, body }
        if (p.includes('/invoices?')) return { status: 200, body: { items: [body], nextCursor: null } }
        return undefined
      }, false, createMockWallet(SUPPLIER, SUPPLIER))
      const table = await screen.findByRole('table', { name: 'Invoice list' })
      await user.click(within(table).getByRole('button', { name: 'Open INV-2026-002' }))
      await screen.findByTestId('invoice-advance-note')
      await user.type(screen.getByLabelText(/Voucher key/), KEY)
      await user.click(screen.getByRole('button', { name: /Approve and sign/ }))
      expect(await screen.findByText(reason)).toBeInTheDocument()
      expect(requests().filter((r) => r.method === 'POST')).toHaveLength(0)
      unmount()
    }
  })

  it('TC-FE-025-07 the debtor rejects with a signed notice', async () => {
    const user = userEvent.setup()
    const requested = { ...invoices[1]!, status: 'requested' }
    const { requests } = renderApp(
      '/invoices',
      (p, init) => {
        if (init?.method === 'POST' && p.endsWith('/reject')) return { status: 200, body: { ...requested, status: 'rejected' } }
        if (p.startsWith('/x207/circles/agents-main/invoices/') && !init?.method) return { status: 200, body: requested }
        if (p.includes('/invoices?')) return { status: 200, body: { items: [requested], nextCursor: null } }
        return undefined
      },
      false,
      createMockWallet(SUPPLIER, SUPPLIER),
    )
    const table = await screen.findByRole('table', { name: 'Invoice list' })
    await user.click(within(table).getByRole('button', { name: 'Open INV-2026-002' }))
    await screen.findByTestId('invoice-advance-note')
    await user.type(screen.getByLabelText(/Voucher key/), KEY)
    await user.click(screen.getByRole('button', { name: /^Reject invoice 90 credit from retailer\.x207-circle\.near$/ }))
    await screen.findByText('Invoice rejected.')
    const post = requests().find((r) => r.method === 'POST' && r.path.endsWith('/reject'))!
    expect(post.body.notice).toMatchObject({ invoice_hash: invoiceHashes[1], actor: SUPPLIER, action: 'rejected' })
    expect(post.body.signature).toMatch(/^ed25519:/)
  })

  it('TC-FE-025-08 a failed installment (headroom) can be shifted once by the debtor with a voucher built on the state of the pair in the next epoch; a blocked one has no button', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp(
      '/invoices',
      (p, init) => {
        if (init?.method === 'POST' && p.endsWith('/installments/2/catch-up')) return { status: 200, body: invoices[1] }
        const rpc = init?.body ? (JSON.parse(String(init.body)) as { params?: { method_name?: string; args_base64?: string } }).params : undefined
        if (rpc?.method_name === 'obligation') {
          const args = JSON.parse(atob(rpc.args_base64!)) as { epoch: number }
          expect(args.epoch).toBe(46) // epoch of installment 2 (45) plus one
          const bytes = new TextEncoder().encode(JSON.stringify({ epoch: 46, debtor: SUPPLIER, creditor: 'retailer.x207-circle.near', cumulative: '30000000', last_seq: 1, cleared: '0', obligation: '30000000' }))
          return { status: 200, body: { jsonrpc: '2.0', id: 'x207', result: { result: Array.from(bytes) } } }
        }
        return undefined
      },
      false,
      createMockWallet(SUPPLIER, SUPPLIER),
    )
    const table = await screen.findByRole('table', { name: 'Invoice list' })
    await user.click(within(table).getByRole('button', { name: 'Open INV-2026-002' }))
    await screen.findByRole('table', { name: 'Installment schedule' })
    await user.type(screen.getByLabelText(/Voucher key/), KEY)
    await user.click(await screen.findByRole('button', { name: 'Catch-up installment 2' }))
    await screen.findByText(/Catch-up voucher for installment 2 signed for epoch 46/)
    const post = requests().find((r) => r.method === 'POST' && r.path.endsWith('/catch-up'))!
    expect(post.body.voucher).toMatchObject({ epoch: 46, seq: 2, cumulativeAmount: '60000000', payer: SUPPLIER, payee: 'retailer.x207-circle.near' })
    expect(verifyVoucher({ ...post.body.voucher, signature: post.body.signature }, PUBLIC)).toBe(true)
  })

  it('TC-FE-025-09 an installment blocked by the debtor says so and offers no catch-up; an unknown status from the server is an error, not a guess', async () => {
    const blocked = { ...invoices[1]!, installments: invoices[1]!.installments.map((i) => (i.index === 2 ? { ...i, reason: 'blocked_by_debtor' } : i)) }
    const user = userEvent.setup()
    renderApp('/invoices', (p, init) => {
      if (p.startsWith('/x207/circles/agents-main/invoices/') && !init?.method) return { status: 200, body: blocked }
      if (p.includes('/invoices?')) return { status: 200, body: { items: [blocked], nextCursor: null } }
      return undefined
    }, false, createMockWallet(SUPPLIER, SUPPLIER))
    const table = await screen.findByRole('table', { name: 'Invoice list' })
    await user.click(within(table).getByRole('button', { name: 'Open INV-2026-002' }))
    expect(await screen.findByTestId('invoice-blocked')).toHaveTextContent('CT-094')
    expect(screen.queryByRole('button', { name: /Catch-up installment/ })).not.toBeInTheDocument()
    expect(() => toInvoiceView({ ...invoices[0]!, status: 'unknown' })).toThrow(/Unrecognized invoice response/)
    expect(toInvoiceView({ ...invoices[0]!, invoice_hash: undefined, invoiceHash: 'a'.repeat(64), needs_bond: undefined, needsBond: true })).toMatchObject({ invoiceHash: 'a'.repeat(64), needsBond: true })
  })

  it('TC-FE-025-10 the issuer posts a signed request: document, installments and a notice; a bad installment count or amount is refused before any call', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp(
      '/invoices',
      (p, init) => (init?.method === 'POST' && p.endsWith('/invoices') ? { status: 201, body: { invoice_hash: invoiceHashes[0] } } : undefined),
      false,
      createMockWallet(SUPPLIER, SUPPLIER),
    )
    await screen.findByRole('table', { name: 'Invoice list' })
    const form = screen.getByRole('form', { name: 'Request invoice' })
    await user.type(within(form).getByLabelText(/^Debtor/), MAKER)
    await user.type(within(form).getByLabelText(/^Invoice number/), 'INV-2026-001')
    await user.type(within(form).getByLabelText(/^Amount \(credit\)/), '100')
    await user.type(within(form).getByLabelText(/^Memo/), 'components, October batch')
    await user.clear(within(form).getByLabelText(/^Number of installments/))
    await user.type(within(form).getByLabelText(/^Number of installments/), '25')
    await user.type(within(form).getByLabelText(/Voucher key/), KEY)
    await user.click(within(form).getByRole('button', { name: /Sign and request/ }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('1 to 24')
    expect(requests().filter((r) => r.method === 'POST')).toHaveLength(0)
    await user.clear(within(form).getByLabelText(/^Number of installments/))
    await user.type(within(form).getByLabelText(/^Number of installments/), '3')
    await user.click(within(form).getByRole('button', { name: /Sign and request/ }))
    await waitFor(() => expect(requests().some((r) => r.method === 'POST')).toBe(true))
    const post = requests().find((r) => r.method === 'POST')!
    expect(post.body.document).toEqual({ id: 'INV-2026-001', issuer: SUPPLIER, debtor: MAKER, amount: '100000000', memo: 'components, October batch' })
    expect(post.body.installments).toBe(3)
    expect(post.body.notice).toMatchObject({ invoice_hash: invoiceHash({ id: 'INV-2026-001', issuer: SUPPLIER, debtor: MAKER, amount: '100000000', memo: 'components, October batch' }), actor: SUPPLIER, action: 'requested' })
    expect(post.body.signature).toMatch(/^ed25519:/)
    expect(JSON.stringify(post.body)).not.toContain(KEY)
  })

  it('TC-FE-025-11 an API error of the book is shown with its code, and without a wallet the page asks to sign in', async () => {
    renderApp('/invoices', (p) => (p.includes('/invoices') ? apiError(409, 'invoice_duplicate', 'An invoice with this hash already exists') : undefined), false, createMockWallet(SUPPLIER, SUPPLIER))
    expect(await screen.findByRole('alert')).toHaveTextContent('invoice_duplicate')
    renderApp('/invoices')
    expect(await screen.findByRole('group', { name: 'Sign in to see your invoices' })).toBeInTheDocument()
  })

  it('TC-FE-025-12 the answer of BE-051 (camelCase, with voucherEpoch, shifted, rejectReason): a shifted installment shows its new epoch and has no second catch-up, a missed one has none either', async () => {
    const user = userEvent.setup()
    const real = {
      invoiceHash: invoiceHashes[1], document: invoiceDocs[1], issuer: invoiceDocs[1]!.issuer, debtor: invoiceDocs[1]!.debtor, status: 'missed', needsBond: false, rejectReason: null,
      createdAt: '2026-11-03T10:00:00Z', unit: 'credit', decimals: 6,
      installments: [
        { index: 1, epoch: 44, amount: '30000000', status: 'registered', reason: null, voucherEpoch: 44, shifted: false },
        { index: 2, epoch: 45, amount: '30000000', status: 'shifted', reason: 'headroom', voucherEpoch: 46, shifted: true },
        { index: 3, epoch: 46, amount: '30000000', status: 'missed', reason: 'headroom', voucherEpoch: 46, shifted: false },
      ],
    }
    renderApp('/invoices', (p, init) => {
      if (p.startsWith('/x207/circles/agents-main/invoices/') && !init?.method) return { status: 200, body: real }
      if (p.includes('/invoices?')) return { status: 200, body: { items: [real], nextCursor: null } }
      return undefined
    }, false, createMockWallet(SUPPLIER, SUPPLIER))
    const table = await screen.findByRole('table', { name: 'Invoice list' })
    await user.click(within(table).getByRole('button', { name: 'Open INV-2026-002' }))
    const schedule = await screen.findByRole('table', { name: 'Installment schedule' })
    expect(schedule).toHaveTextContent('shifted to epoch 46')
    expect(screen.queryByRole('button', { name: /Catch-up installment/ })).not.toBeInTheDocument()
    const rejected = { ...real, status: 'rejected', rejectReason: 'wrong amount', installments: real.installments.map((i) => ({ ...i, status: 'scheduled', reason: null, shifted: false })) }
    expect(toInvoiceView(rejected)).toMatchObject({ rejectReason: 'wrong amount', createdAt: '2026-11-03T10:00:00Z' })
    expect(toInvoiceView(real).installments[1]).toMatchObject({ voucherEpoch: 46, shifted: true })
  })

  it('TC-FE-025-13 [batch 3 F3] the buttons carry the amount and the other party; an API that shows one invoice and carries the hash of another gets no signature', async () => {
    const user = userEvent.setup()
    const requested = { ...invoices[1]!, status: 'requested', installments: invoices[1]!.installments.map((i) => ({ ...i, status: 'scheduled', reason: null })) }
    const lying = { ...requested, invoice_hash: invoiceHashes[0] } // shows invoice 2, carries the hash of invoice 1
    const { requests } = renderApp('/invoices', (p, init) => {
      if (p.startsWith('/x207/circles/agents-main/invoices/') && !init?.method) return { status: 200, body: lying }
      if (p.includes('/invoices?')) return { status: 200, body: { items: [lying], nextCursor: null } }
      return { status: 200, body: lying }
    }, false, createMockWallet(SUPPLIER, SUPPLIER))
    const table = await screen.findByRole('table', { name: 'Invoice list' })
    await user.click(within(table).getByRole('button', { name: 'Open INV-2026-002' }))
    const approve = await screen.findByRole('button', { name: /Approve and sign 3 installments: 90 credit to retailer\.x207-circle\.near/ })
    await user.type(screen.getByLabelText(/Voucher key/), KEY)
    await user.click(approve)
    expect(await screen.findByText(/The invoice hash does not match its document/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Reject invoice 90 credit/ }))
    expect(await screen.findByText(/The invoice hash computed from the displayed document does not match/)).toBeInTheDocument()
    expect(requests().filter((r) => r.method === 'POST' && r.path.includes('/x207/'))).toHaveLength(0)
  })
})
