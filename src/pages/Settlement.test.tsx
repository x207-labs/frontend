import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiError, renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const SCRAPER = 'scraper.x207-circle.near'
const DUE = '2026-11-09T12:00:00Z'
const NOW = Date.parse('2026-11-09T10:00:00Z')
const row = (status: string, extra: object = {}) => ({
  epoch: 42, phase: 'payment_window', role: 'debtor', net: '-35000000', amount: '35000000', status, due: DUE,
  paidAmount: '0', stakeSlashed: '0', haircut: '0', account: SCRAPER, ...extra,
})
const mine = (items: unknown[]) => (path: string) =>
  path.includes(`/members/${SCRAPER}/settlements`) ? { status: 200, body: { unit: 'credit', decimals: 6, items, nextCursor: null } } : undefined

afterEach(() => vi.useRealTimers())

describe('settlement debtor', () => {
  it('TC-FE-009-01 tagihan due: posisi bersih, status, batas bayar, dan hitung mundur', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
    renderApp('/settlement?epoch=42', undefined, false, createMockWallet(SCRAPER, SCRAPER))
    const summary = await screen.findByText(/Epoch 42: posisi bersih/)
    expect(summary).toHaveTextContent('-35')
    expect(summary).toHaveTextContent('status due')
    expect(screen.getByText(/Batas bayar/)).toHaveTextContent(DUE)
    expect(screen.getByTestId('countdown')).toHaveTextContent('2j 00m 00d')
  })

  it('TC-FE-009-02 bayar: ft_transfer_call dengan msg settle epoch, amount = due, 1 yocto', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
    const wallet = createMockWallet(SCRAPER, SCRAPER)
    renderApp('/settlement?epoch=42', undefined, false, wallet)
    const user = userEvent.setup({ advanceTimers: () => undefined })
    await user.click(await screen.findByRole('button', { name: 'Bayar residual' }))
    await waitFor(() => expect(wallet.txs).toHaveLength(1))
    expect(wallet.txs[0]).toMatchObject({
      receiverId: 'usdt.tether-token.near', methodName: 'ft_transfer_call', deposit: '1',
      args: { receiver_id: 'x207-circle.testnet', amount: '35000000', msg: '{"action":"settle","epoch":42}' },
    })
  })

  it('TC-FE-009-04 melewati batas bayar: tombol nonaktif dan pesan', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: NOW })
    renderApp('/settlement?epoch=42', undefined, false, createMockWallet(SCRAPER, SCRAPER))
    const button = await screen.findByRole('button', { name: 'Bayar residual' })
    expect(button).toBeEnabled()
    await act(async () => {
      vi.setSystemTime(Date.parse(DUE) + 1000)
      await vi.advanceTimersByTimeAsync(1100)
    })
    expect(screen.getByRole('button', { name: 'Bayar residual' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Payment window habis')
  })

  it('TC-FE-009-04 status defaulted tampil dengan tombol nonaktif', async () => {
    renderApp('/settlement?epoch=42', mine([row('defaulted')]), false, createMockWallet(SCRAPER, SCRAPER))
    expect(await screen.findByText(/Epoch 42: posisi bersih/)).toHaveTextContent('defaulted')
    expect(screen.getByRole('button', { name: 'Bayar residual' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Payment window habis')
  })

  it('TC-FE-009-05 tidak ada tagihan', async () => {
    renderApp('/settlement?epoch=42', mine([]), false, createMockWallet(SCRAPER, SCRAPER))
    expect(await screen.findByText('Tidak ada tagihan.')).toBeInTheDocument()
  })

  it('TC-FE-009-06 loading lalu error 404 member_not_found', async () => {
    renderApp(
      '/settlement?epoch=42',
      (p) => (p.includes('/settlements') && p.includes('/members/') ? { ...apiError(404, 'member_not_found'), delayMs: 30 } : undefined),
      false,
      createMockWallet(SCRAPER, SCRAPER),
    )
    expect(await screen.findByText(/Memuat tagihan/)).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('member_not_found')
  })

  it('TC-FE-009-07 wallet menolak: dibatalkan dan status tetap due', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
    const wallet = createMockWallet(SCRAPER, SCRAPER)
    wallet.rejectNext = true
    renderApp('/settlement?epoch=42', undefined, false, wallet)
    const user = userEvent.setup({ advanceTimers: () => undefined })
    await user.click(await screen.findByRole('button', { name: 'Bayar residual' }))
    expect(await screen.findByText(/Dibatalkan pengguna/)).toBeInTheDocument()
    expect(screen.getByText(/Epoch 42: posisi bersih/)).toHaveTextContent('status due')
    expect(wallet.txs).toHaveLength(0)
  })

  it('TC-FE-009-08 aset lain: peringatan deadline_risk tampil dari quote settle', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
    const quote = {
      jobId: 'j1', status: 'waiting_deposit', purpose: 'settle', unit: 'credit', decimals: 6, originAsset: 'x', destinationAsset: 'y',
      amountIn: '35050000', amountOut: '35000000', recipient: SCRAPER, recipientType: 'INTENTS', depositAddress: '0xabc',
      quoteDeadline: '2026-11-09T11:45:00Z', timeEstimateSeconds: 9000, paymentDeadline: DUE, warnings: ['deadline_risk'], nextSteps: [],
    }
    const { requests } = renderApp(
      '/settlement?epoch=42',
      (p, init) => (p.endsWith('/deposit/quote') && init?.method === 'POST' ? { status: 201, body: quote } : undefined),
      false,
      createMockWallet(SCRAPER, SCRAPER),
    )
    const user = userEvent.setup({ advanceTimers: () => undefined })
    await user.click(await screen.findByRole('button', { name: 'Bayar dengan aset lain' }))
    await user.click(await screen.findByRole('button', { name: 'Minta quote 1Click' }))
    expect(await screen.findByText(/Risiko melewati batas bayar/)).toBeInTheDocument()
    expect(requests().find((r) => r.method === 'POST')?.body).toMatchObject({ purpose: 'settle', epoch: 42, account: SCRAPER })
  })

  it('tanpa login: ajakan login', async () => {
    renderApp('/settlement?epoch=42')
    expect(await screen.findByText(/Masuk dengan wallet untuk melihat tagihan/)).toBeInTheDocument()
  })
})
