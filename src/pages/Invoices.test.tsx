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
    renderApp('/invoice', undefined, false, createMockWallet(SUPPLIER, SUPPLIER))
    const table = await screen.findByRole('table', { name: 'Daftar invoice' })
    expect(within(table).getByText('INV-2026-001')).toBeInTheDocument()
    expect(within(table).getByText('INV-2026-002')).toBeInTheDocument()
    await user.click(within(table).getByRole('button', { name: 'Buka INV-2026-002' }))
    const schedule = await screen.findByRole('table', { name: 'Jadwal cicilan' })
    expect(within(schedule).getAllByRole('row')).toHaveLength(4)
    expect(schedule).toHaveTextContent('headroom debtor habis')
    expect(screen.getByTestId('invoice-bond')).toHaveTextContent('CT-094')
    // the supplier is the debtor of this invoice: the catch-up is offered for the installment that failed for headroom, and only for that one
    expect(screen.getAllByRole('button', { name: /Susulan cicilan/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Susulan cicilan 2' })).toBeInTheDocument()
  })

  it('TC-FE-025-03 the filter by status is sent to the API', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/invoice', undefined, false, createMockWallet(SUPPLIER, SUPPLIER))
    await screen.findByRole('table', { name: 'Daftar invoice' })
    await user.selectOptions(screen.getByLabelText('Status'), 'approved')
    await waitFor(() => expect(calls().some((c) => c.includes('/invoices?') && c.includes('status=approved') && c.includes(`party=${encodeURIComponent(SUPPLIER)}`))).toBe(true))
  })

  it('TC-FE-025-04 an invoice that is already approved has nothing to approve, and the issuer of a requested one only waits', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/invoice', undefined, false, createMockWallet(SUPPLIER, SUPPLIER))
    const table = await screen.findByRole('table', { name: 'Daftar invoice' })
    await user.click(within(table).getByRole('button', { name: 'Buka INV-2026-002' }))
    await screen.findByRole('table', { name: 'Jadwal cicilan' })
    expect(screen.queryByRole('button', { name: /Setujui dan tandatangani/ })).not.toBeInTheDocument()
    await user.click(within(table).getByRole('button', { name: 'Buka INV-2026-001' }))
    expect(await screen.findByText('Menunggu persetujuan debtor.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Tolak invoice/ })).not.toBeInTheDocument()
    expect(requests().filter((r) => r.method === 'POST')).toHaveLength(0)
  })

  it('TC-FE-025-05 approval of a requested invoice signs all installments at once and posts them to approve', async () => {
    const user = userEvent.setup()
    const requested = { ...invoices[1]!, status: 'requested', installments: invoices[1]!.installments.map((i) => ({ ...i, status: 'scheduled', reason: null })) }
    const { requests } = renderApp(
      '/invoice',
      (p, init) => {
        if (init?.method === 'POST' && p.endsWith('/approve')) return { status: 200, body: { ...requested, status: 'approved' } }
        if (p.startsWith('/x207/circles/agents-main/invoices/') && !init?.method) return { status: 200, body: requested }
        if (p.includes('/invoices?')) return { status: 200, body: { items: [requested], nextCursor: null } }
        return undefined
      },
      false,
      createMockWallet(SUPPLIER, SUPPLIER),
    )
    const table = await screen.findByRole('table', { name: 'Daftar invoice' })
    await user.click(within(table).getByRole('button', { name: 'Buka INV-2026-002' }))
    expect(await screen.findByTestId('invoice-advance-note')).toHaveTextContent('3 voucher')
    expect(screen.getByTestId('invoice-advance-note')).toHaveTextContent('bukan jaminan')
    await user.type(screen.getByLabelText(/Kunci voucher/), KEY)
    await user.click(screen.getByRole('button', { name: /Setujui dan tandatangani/ }))
    await screen.findByText(/3 voucher cicilan ditandatangani/)
    const post = requests().find((r) => r.method === 'POST' && r.path.endsWith('/approve'))!
    expect(post.path).toContain(`/invoices/${invoiceHashes[1]}/approve`)
    const sent = post.body.vouchers as Array<{ voucher: Record<string, unknown>; signature: `ed25519:${string}` }>
    expect(sent.map((s) => [s.voucher.epoch, s.voucher.seq, s.voucher.cumulativeAmount])).toEqual([[44, 1, '30000000'], [45, 1, '30000000'], [46, 1, '30000000']])
    for (const s of sent) {
      expect(s.voucher).toMatchObject({ payer: SUPPLIER, payee: 'retailer.x207-circle.near', unit: 'credit', resource: `x207:invoice:${invoiceHashes[1]}` })
      expect(verifyVoucher({ ...(s.voucher as never), signature: s.signature }, PUBLIC)).toBe(true)
    }
    expect(JSON.stringify(post.body)).not.toContain(KEY)
  })

  it('TC-FE-025-06 the debtor refuses to sign when the server hash does not match the document or the schedule differs from the plan', async () => {
    const user = userEvent.setup()
    const base = { ...invoices[1]!, status: 'requested' }
    const cases: Array<[object, RegExp]> = [
      [{ ...base, invoice_hash: 'f'.repeat(64) }, /Hash invoice tidak cocok/],
      [{ ...base, installments: base.installments.map((i, k) => (k === 1 ? { ...i, epoch: 99 } : i)) }, /Jadwal cicilan dari server tidak sama/],
      [{ ...base, installments: base.installments.map((i, k) => (k === 0 ? { ...i, amount: '29999999' } : i)) }, /Jadwal cicilan dari server tidak sama/],
    ]
    for (const [body, reason] of cases) {
      const { requests, unmount } = renderApp('/invoice', (p, init) => {
        if (p.startsWith('/x207/circles/agents-main/invoices/') && !init?.method) return { status: 200, body }
        if (p.includes('/invoices?')) return { status: 200, body: { items: [body], nextCursor: null } }
        return undefined
      }, false, createMockWallet(SUPPLIER, SUPPLIER))
      const table = await screen.findByRole('table', { name: 'Daftar invoice' })
      await user.click(within(table).getByRole('button', { name: 'Buka INV-2026-002' }))
      await screen.findByTestId('invoice-advance-note')
      await user.type(screen.getByLabelText(/Kunci voucher/), KEY)
      await user.click(screen.getByRole('button', { name: /Setujui dan tandatangani/ }))
      expect(await screen.findByText(reason)).toBeInTheDocument()
      expect(requests().filter((r) => r.method === 'POST')).toHaveLength(0)
      unmount()
    }
  })

  it('TC-FE-025-07 the debtor rejects with a signed notice', async () => {
    const user = userEvent.setup()
    const requested = { ...invoices[1]!, status: 'requested' }
    const { requests } = renderApp(
      '/invoice',
      (p, init) => {
        if (init?.method === 'POST' && p.endsWith('/reject')) return { status: 200, body: { ...requested, status: 'rejected' } }
        if (p.startsWith('/x207/circles/agents-main/invoices/') && !init?.method) return { status: 200, body: requested }
        if (p.includes('/invoices?')) return { status: 200, body: { items: [requested], nextCursor: null } }
        return undefined
      },
      false,
      createMockWallet(SUPPLIER, SUPPLIER),
    )
    const table = await screen.findByRole('table', { name: 'Daftar invoice' })
    await user.click(within(table).getByRole('button', { name: 'Buka INV-2026-002' }))
    await screen.findByTestId('invoice-advance-note')
    await user.type(screen.getByLabelText(/Kunci voucher/), KEY)
    await user.click(screen.getByRole('button', { name: /^Tolak invoice 90 credit dari retailer\.x207-circle\.near$/ }))
    await screen.findByText('Invoice ditolak.')
    const post = requests().find((r) => r.method === 'POST' && r.path.endsWith('/reject'))!
    expect(post.body.notice).toMatchObject({ invoice_hash: invoiceHashes[1], actor: SUPPLIER, action: 'rejected' })
    expect(post.body.signature).toMatch(/^ed25519:/)
  })

  it('TC-FE-025-08 a failed installment (headroom) can be shifted once by the debtor with a voucher built on the state of the pair in the next epoch; a blocked one has no button', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp(
      '/invoice',
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
    const table = await screen.findByRole('table', { name: 'Daftar invoice' })
    await user.click(within(table).getByRole('button', { name: 'Buka INV-2026-002' }))
    await screen.findByRole('table', { name: 'Jadwal cicilan' })
    await user.type(screen.getByLabelText(/Kunci voucher/), KEY)
    await user.click(await screen.findByRole('button', { name: 'Susulan cicilan 2' }))
    await screen.findByText(/Voucher susulan cicilan 2 ditandatangani untuk epoch 46/)
    const post = requests().find((r) => r.method === 'POST' && r.path.endsWith('/catch-up'))!
    expect(post.body.voucher).toMatchObject({ epoch: 46, seq: 2, cumulativeAmount: '60000000', payer: SUPPLIER, payee: 'retailer.x207-circle.near' })
    expect(verifyVoucher({ ...post.body.voucher, signature: post.body.signature }, PUBLIC)).toBe(true)
  })

  it('TC-FE-025-09 a cicilan blocked by the debtor says so and offers no catch-up; an unknown status from the server is an error, not a guess', async () => {
    const blocked = { ...invoices[1]!, installments: invoices[1]!.installments.map((i) => (i.index === 2 ? { ...i, reason: 'blocked_by_debtor' } : i)) }
    const user = userEvent.setup()
    renderApp('/invoice', (p, init) => {
      if (p.startsWith('/x207/circles/agents-main/invoices/') && !init?.method) return { status: 200, body: blocked }
      if (p.includes('/invoices?')) return { status: 200, body: { items: [blocked], nextCursor: null } }
      return undefined
    }, false, createMockWallet(SUPPLIER, SUPPLIER))
    const table = await screen.findByRole('table', { name: 'Daftar invoice' })
    await user.click(within(table).getByRole('button', { name: 'Buka INV-2026-002' }))
    expect(await screen.findByTestId('invoice-blocked')).toHaveTextContent('CT-094')
    expect(screen.queryByRole('button', { name: /Susulan cicilan/ })).not.toBeInTheDocument()
    expect(() => toInvoiceView({ ...invoices[0]!, status: 'unknown' })).toThrow(/tidak dikenal/)
    expect(toInvoiceView({ ...invoices[0]!, invoice_hash: undefined, invoiceHash: 'a'.repeat(64), needs_bond: undefined, needsBond: true })).toMatchObject({ invoiceHash: 'a'.repeat(64), needsBond: true })
  })

  it('TC-FE-025-10 the issuer posts a signed request: document, installments and a notice; a bad installment count or amount is refused before any call', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp(
      '/invoice',
      (p, init) => (init?.method === 'POST' && p.endsWith('/invoices') ? { status: 201, body: { invoice_hash: invoiceHashes[0] } } : undefined),
      false,
      createMockWallet(SUPPLIER, SUPPLIER),
    )
    await screen.findByRole('table', { name: 'Daftar invoice' })
    const form = screen.getByRole('form', { name: 'Ajukan invoice' })
    await user.type(within(form).getByLabelText(/^Debtor/), MAKER)
    await user.type(within(form).getByLabelText(/^Nomor invoice/), 'INV-2026-001')
    await user.type(within(form).getByLabelText(/^Jumlah \(credit\)/), '100')
    await user.type(within(form).getByLabelText(/^Keterangan/), 'components, October batch')
    await user.clear(within(form).getByLabelText(/^Jumlah cicilan/))
    await user.type(within(form).getByLabelText(/^Jumlah cicilan/), '25')
    await user.type(within(form).getByLabelText(/Kunci voucher/), KEY)
    await user.click(within(form).getByRole('button', { name: /Tanda tangani dan ajukan/ }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('1 sampai 24')
    expect(requests().filter((r) => r.method === 'POST')).toHaveLength(0)
    await user.clear(within(form).getByLabelText(/^Jumlah cicilan/))
    await user.type(within(form).getByLabelText(/^Jumlah cicilan/), '3')
    await user.click(within(form).getByRole('button', { name: /Tanda tangani dan ajukan/ }))
    await waitFor(() => expect(requests().some((r) => r.method === 'POST')).toBe(true))
    const post = requests().find((r) => r.method === 'POST')!
    expect(post.body.document).toEqual({ id: 'INV-2026-001', issuer: SUPPLIER, debtor: MAKER, amount: '100000000', memo: 'components, October batch' })
    expect(post.body.installments).toBe(3)
    expect(post.body.notice).toMatchObject({ invoice_hash: invoiceHash({ id: 'INV-2026-001', issuer: SUPPLIER, debtor: MAKER, amount: '100000000', memo: 'components, October batch' }), actor: SUPPLIER, action: 'requested' })
    expect(post.body.signature).toMatch(/^ed25519:/)
    expect(JSON.stringify(post.body)).not.toContain(KEY)
  })

  it('TC-FE-025-11 an API error of the book is shown with its code, and without a wallet the page asks to sign in', async () => {
    renderApp('/invoice', (p) => (p.includes('/invoices') ? apiError(409, 'invoice_duplicate', 'Invoice dengan hash ini sudah ada') : undefined), false, createMockWallet(SUPPLIER, SUPPLIER))
    expect(await screen.findByRole('alert')).toHaveTextContent('invoice_duplicate')
    renderApp('/invoice')
    expect(await screen.findByText(/Masuk dengan wallet untuk melihat invoice/)).toBeInTheDocument()
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
    renderApp('/invoice', (p, init) => {
      if (p.startsWith('/x207/circles/agents-main/invoices/') && !init?.method) return { status: 200, body: real }
      if (p.includes('/invoices?')) return { status: 200, body: { items: [real], nextCursor: null } }
      return undefined
    }, false, createMockWallet(SUPPLIER, SUPPLIER))
    const table = await screen.findByRole('table', { name: 'Daftar invoice' })
    await user.click(within(table).getByRole('button', { name: 'Buka INV-2026-002' }))
    const schedule = await screen.findByRole('table', { name: 'Jadwal cicilan' })
    expect(schedule).toHaveTextContent('digeser ke epoch 46')
    expect(screen.queryByRole('button', { name: /Susulan cicilan/ })).not.toBeInTheDocument()
    const rejected = { ...real, status: 'rejected', rejectReason: 'wrong amount', installments: real.installments.map((i) => ({ ...i, status: 'scheduled', reason: null, shifted: false })) }
    expect(toInvoiceView(rejected)).toMatchObject({ rejectReason: 'wrong amount', createdAt: '2026-11-03T10:00:00Z' })
    expect(toInvoiceView(real).installments[1]).toMatchObject({ voucherEpoch: 46, shifted: true })
  })

  it('TC-FE-025-13 [batch 3 F3] the buttons carry the amount and the other party; an API that shows one invoice and carries the hash of another gets no signature', async () => {
    const user = userEvent.setup()
    const requested = { ...invoices[1]!, status: 'requested', installments: invoices[1]!.installments.map((i) => ({ ...i, status: 'scheduled', reason: null })) }
    const lying = { ...requested, invoice_hash: invoiceHashes[0] } // shows invoice 2, carries the hash of invoice 1
    const { requests } = renderApp('/invoice', (p, init) => {
      if (p.startsWith('/x207/circles/agents-main/invoices/') && !init?.method) return { status: 200, body: lying }
      if (p.includes('/invoices?')) return { status: 200, body: { items: [lying], nextCursor: null } }
      return { status: 200, body: lying }
    }, false, createMockWallet(SUPPLIER, SUPPLIER))
    const table = await screen.findByRole('table', { name: 'Daftar invoice' })
    await user.click(within(table).getByRole('button', { name: 'Buka INV-2026-002' }))
    const approve = await screen.findByRole('button', { name: /Setujui dan tandatangani 3 cicilan: 90 credit kepada retailer\.x207-circle\.near/ })
    await user.type(screen.getByLabelText(/Kunci voucher/), KEY)
    await user.click(approve)
    expect(await screen.findByText(/Hash invoice tidak cocok dengan dokumennya/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Tolak invoice 90 credit/ }))
    expect(await screen.findByText(/Hash invoice yang dihitung dari dokumen yang ditampilkan tidak sama/)).toBeInTheDocument()
    expect(requests().filter((r) => r.method === 'POST' && r.path.includes('/x207/'))).toHaveLength(0)
  })
})
