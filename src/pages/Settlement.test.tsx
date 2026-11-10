import { act, screen, waitFor, within } from '@testing-library/react'
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
  it('TC-FE-009-01 due amount: net position, status, payment deadline, and countdown', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
    renderApp('/settlement?epoch=42', undefined, false, createMockWallet(SCRAPER, SCRAPER))
    const summary = await screen.findByText(/Epoch 42: net position/)
    expect(summary).toHaveTextContent('-35')
    expect(summary).toHaveTextContent('status due')
    expect(screen.getByText(/Payment deadline/)).toHaveTextContent(DUE)
    expect(screen.getByTestId('countdown')).toHaveTextContent('2h 00m 00s')
  })

  it('TC-FE-009-02 pay: ft_transfer_call with the settle epoch msg, amount = due, 1 yocto', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
    const wallet = createMockWallet(SCRAPER, SCRAPER)
    renderApp('/settlement?epoch=42', undefined, false, wallet)
    const user = userEvent.setup({ advanceTimers: () => undefined })
    await user.click(await screen.findByRole('button', { name: 'Pay residual' }))
    await waitFor(() => expect(wallet.txs).toHaveLength(1))
    expect(wallet.txs[0]).toMatchObject({
      receiverId: 'usdt.tether-token.near', methodName: 'ft_transfer_call', deposit: '1',
      args: { receiver_id: 'x207-circle.testnet', amount: '35000000', msg: '{"action":"settle","epoch":42}' },
    })
  })

  it('TC-FE-009-04 past the payment deadline: button disabled and a message', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: NOW })
    renderApp('/settlement?epoch=42', undefined, false, createMockWallet(SCRAPER, SCRAPER))
    const button = await screen.findByRole('button', { name: 'Pay residual' })
    expect(button).toBeEnabled()
    await act(async () => {
      vi.setSystemTime(Date.parse(DUE) + 1000)
      await vi.advanceTimersByTimeAsync(1100)
    })
    expect(screen.getByRole('button', { name: 'Pay residual' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Payment window expired')
  })

  it('TC-FE-009-04 defaulted status shows with a disabled button', async () => {
    renderApp('/settlement?epoch=42', mine([row('defaulted')]), false, createMockWallet(SCRAPER, SCRAPER))
    expect(await screen.findByText(/Epoch 42: net position/)).toHaveTextContent('defaulted')
    expect(screen.getByRole('button', { name: 'Pay residual' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Payment window expired')
  })

  it('TC-FE-009-05 no dues', async () => {
    renderApp('/settlement?epoch=42', mine([]), false, createMockWallet(SCRAPER, SCRAPER))
    expect(await screen.findByText('No dues.')).toBeInTheDocument()
  })

  it('TC-FE-009-06 loading then error 404 member_not_found', async () => {
    renderApp(
      '/settlement?epoch=42',
      (p) => (p.includes('/settlements') && p.includes('/members/') ? { ...apiError(404, 'member_not_found'), delayMs: 30 } : undefined),
      false,
      createMockWallet(SCRAPER, SCRAPER),
    )
    expect(await screen.findByText(/Loading dues/)).toBeInTheDocument()
    // FE-097: 404 member_not_found is "not joined", said with the way to join, not an error to retry
    const note = await screen.findByTestId('not-member')
    expect(note).toHaveTextContent('has not joined the circle')
    expect(within(note).getByRole('link', { name: 'Join the circle' })).toHaveAttribute('href', '/onboarding')
  })

  it('TC-FE-009-06 another read error stays an error with a retry', async () => {
    renderApp(
      '/settlement?epoch=42',
      (p) => (p.includes('/settlements') && p.includes('/members/') ? apiError(500, 'internal_error', 'Database down') : undefined),
      false,
      createMockWallet(SCRAPER, SCRAPER),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('internal_error')
    expect(screen.queryByTestId('not-member')).toBeNull()
  })

  it('TC-FE-009-07 wallet rejects: cancelled and status stays due', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
    const wallet = createMockWallet(SCRAPER, SCRAPER)
    wallet.rejectNext = true
    renderApp('/settlement?epoch=42', undefined, false, wallet)
    const user = userEvent.setup({ advanceTimers: () => undefined })
    await user.click(await screen.findByRole('button', { name: 'Pay residual' }))
    expect(await screen.findByText(/Cancelled by user/)).toBeInTheDocument()
    expect(screen.getByText(/Epoch 42: net position/)).toHaveTextContent('status due')
    expect(wallet.txs).toHaveLength(0)
  })

  it('TC-FE-009-08 other asset: the deadline_risk warning shows from the settle quote', async () => {
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
    await user.click(await screen.findByRole('button', { name: 'Pay with another asset' }))
    await user.click(await screen.findByRole('button', { name: 'Request 1Click quote' }))
    expect(await screen.findByText(/Risk of missing the payment deadline/)).toBeInTheDocument()
    expect(requests().find((r) => r.method === 'POST' && r.path.includes('/settlement/'))?.body).toMatchObject({ purpose: 'settle', epoch: 42, account: SCRAPER })
  })

  it('not signed in: a prompt to sign in', async () => {
    renderApp('/settlement?epoch=42')
    expect(await screen.findByText(/Pay and claim works on your own account/)).toBeInTheDocument()
  })
})
