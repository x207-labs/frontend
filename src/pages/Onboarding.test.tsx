import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { JOIN_STORAGE_DEPOSIT } from '@x207/core'
import { apiError, renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const NEW_ACCOUNT = 'newagent.x207-circle.near'
const PUBKEY = 'ed25519:AKnL4NNf3DGWZJS6cPknBuEGnVsV4A4m5tgebLHaRSZ9'
const HASH = 'a'.repeat(64)
const QUOTE = {
  jobId: 'job-1', status: 'waiting_deposit', purpose: 'stake', unit: 'credit', decimals: 6,
  originAsset: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
  destinationAsset: 'nep141:usdt.tether-token.near', amountIn: '50050000', amountOut: '50000000',
  recipient: NEW_ACCOUNT, recipientType: 'INTENTS', depositAddress: '0x7a1c…e93f',
  quoteDeadline: '2026-11-09T11:45:00Z', timeEstimateSeconds: 35, warnings: [], nextSteps: [],
}
const job = (status: string) => ({
  jobId: 'job-1', kind: 'deposit_stake', status, oneClickStatus: 'X', account: NEW_ACCOUNT, updatedAt: '2026-11-09T11:41:20Z',
})

const login = async (wallet = createMockWallet(NEW_ACCOUNT, NEW_ACCOUNT)) => {
  const view = renderApp('/onboarding', undefined, false, wallet)
  await screen.findByText(/members registered/)
  return { ...view, user: userEvent.setup() }
}
async function fillForm(user: ReturnType<typeof userEvent.setup>, { amount = '50', source }: { amount?: string; source?: string } = {}) {
  await user.type(screen.getByLabelText(/pubkey_voucher/), PUBKEY)
  await user.type(screen.getByLabelText(/terms_hash/), HASH)
  await user.click(screen.getByLabelText(/agree to the circle terms/))
  await user.type(screen.getByLabelText(/Stake amount/), amount)
  if (source) await user.selectOptions(screen.getByLabelText(/USDT source/), source)
}

describe('onboarding F1', () => {
  it('TC-FE-004-01 without login: a sign-in prompt and no form (FE-035)', async () => {
    renderApp('/onboarding')
    expect(await screen.findByText(/Join the circle works on your own account/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/pubkey_voucher/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Sign join and stake/ })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Sign in with wallet' }).length).toBeGreaterThan(0)
  })

  it('FE-035 the sign-in prompt of Onboarding links the guide to join the circle', async () => {
    renderApp('/onboarding')
    const link = await screen.findByRole('link', { name: /Join the circle step by step/ })
    // FE-072: the guide is the Help page of the app, not a file on GitHub
    expect(link).toHaveAttribute('href', expect.stringContaining('/help'))
  })

  it('TC-FE-004-02 three validation messages and a disabled button', async () => {
    const { user } = await login()
    await user.type(screen.getByLabelText(/pubkey_voucher/), 'abc')
    await user.type(screen.getByLabelText(/terms_hash/), 'XYZ')
    await user.type(screen.getByLabelText(/Stake amount/), '0')
    expect(screen.getByText(/ed25519: followed by base58/)).toBeInTheDocument()
    expect(screen.getByText(/64 lowercase hexadecimal characters/)).toBeInTheDocument()
    expect(screen.getByText(/Agreement to the terms is required/)).toBeInTheDocument()
    expect(screen.getByText(/Amount must be greater than 0/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sign join and stake/ })).toBeDisabled()
  })

  it('TC-FE-004-03 USDT in the Intents balance: ft_withdraw, join, then stake in order', async () => {
    const wallet = createMockWallet(NEW_ACCOUNT, NEW_ACCOUNT)
    const { user } = await login(wallet)
    await fillForm(user, { source: 'intents' })
    await user.click(screen.getByRole('button', { name: /withdraw, join, and stake/ }))
    await waitFor(() => expect(wallet.txs).toHaveLength(3))
    expect(wallet.txs.map((t) => `${t.receiverId}.${t.methodName}`)).toEqual([
      'intents.near.ft_withdraw', 'x207-circle.testnet.join', 'usdt.tether-token.near.ft_transfer_call',
    ])
    expect(wallet.txs[0].args).toEqual({ token: 'usdt.tether-token.near', receiver_id: NEW_ACCOUNT, amount: '50000000' })
    expect(wallet.txs[0].args).not.toHaveProperty('msg')
    expect(wallet.txs[1].args).toEqual({ circle_id: 'agents-main', pubkey_voucher: PUBKEY, terms_hash: HASH })
    expect(BigInt(wallet.txs[1].deposit)).toBeGreaterThanOrEqual(JOIN_STORAGE_DEPOSIT)
    expect(wallet.txs[2].args).toMatchObject({ amount: '50000000', msg: '{"action":"stake"}' })
  })

  it('TC-FE-004-04 USDT in the NEAR account: only join and stake', async () => {
    const wallet = createMockWallet(NEW_ACCOUNT, NEW_ACCOUNT)
    const { user } = await login(wallet)
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /join and stake/ }))
    await waitFor(() => expect(wallet.txs).toHaveLength(2))
    expect(wallet.txs.map((t) => t.methodName)).toEqual(['join', 'ft_transfer_call'])
  })

  it('the sequence stops at a rejected signature', async () => {
    const wallet = createMockWallet(NEW_ACCOUNT, NEW_ACCOUNT)
    wallet.rejectNext = true
    const { user } = await login(wallet)
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /join and stake/ }))
    expect(await screen.findByText(/Cancelled by user/)).toBeInTheDocument()
    expect(wallet.txs).toHaveLength(0)
  })

  it('TC-FE-004-06 other asset: quote request and depositAddress display', async () => {
    const { user, requests } = await loginWith((path, init) =>
      path.endsWith('/deposit/quote') && init?.method === 'POST' ? { status: 201, body: QUOTE } : undefined,
    )
    await fillForm(user, { source: 'other' })
    await user.click(screen.getByRole('button', { name: /Request 1Click quote/ }))
    expect(await screen.findByText('0x7a1c…e93f')).toBeInTheDocument()
    expect(screen.getByText('INTENTS')).toBeInTheDocument()
    expect(screen.getByText('50050000')).toBeInTheDocument()
    expect(screen.getByText('2026-11-09T11:45:00Z')).toBeInTheDocument()
    const posted = requests().find((r) => r.method === 'POST')!
    expect(posted.body).toMatchObject({ purpose: 'stake', amount: '50000000', account: NEW_ACCOUNT, refundTo: NEW_ACCOUNT })
  })

  it('TC-FE-004-07 job statuses in order; the button is active only at ready_withdraw', async () => {
    const statuses = ['waiting_deposit', 'processing', 'ready_withdraw']
    let n = 0
    const { user } = await loginWith((path, init) => {
      if (path.endsWith('/deposit/quote') && init?.method === 'POST') return { status: 201, body: QUOTE }
      if (path.includes('/jobs/')) return { status: 200, body: job(statuses[Math.min(n++, statuses.length - 1)]) }
      return undefined
    }, 20)
    await fillForm(user, { source: 'other' })
    await user.click(screen.getByRole('button', { name: /Request 1Click quote/ }))
    const submit = () => screen.getByRole('button', { name: /withdraw, join, and stake/ })
    expect(await screen.findByText(/Waiting for a deposit/)).toBeInTheDocument()
    expect(submit()).toBeDisabled()
    expect(await screen.findByText(/Deposit processing/)).toBeInTheDocument()
    expect(submit()).toBeDisabled()
    expect(await screen.findByText(/ready for ft_withdraw/)).toBeInTheDocument()
    await waitFor(() => expect(submit()).toBeEnabled())
  })

  it.each([['failed', /Failed/], ['refunded', /Refunded/], ['expired', /expired/]])(
    'TC-FE-004-08 job %s with no further steps',
    async (status, text) => {
      const { user } = await loginWith((path, init) => {
        if (path.endsWith('/deposit/quote') && init?.method === 'POST') return { status: 201, body: QUOTE }
        if (path.includes('/jobs/')) return { status: 200, body: job(status) }
        return undefined
      }, 20)
      await fillForm(user, { source: 'other' })
      await user.click(screen.getByRole('button', { name: /Request 1Click quote/ }))
      expect(await screen.findByText(text)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /withdraw, join, and stake/ })).toBeDisabled()
    },
  )

  it.each([
    [422, 'refund_account_not_found', /Refund account not found/],
    [502, 'one_click_error', /The 1Click service has a problem/],
  ])('TC-FE-004-09 quote %s %s shows a message and stops', async (status, code, text) => {
    const { user } = await loginWith((path, init) =>
      path.endsWith('/deposit/quote') && init?.method === 'POST' ? apiError(status, code) : undefined,
    )
    await fillForm(user, { source: 'other' })
    await user.click(screen.getByRole('button', { name: /Request 1Click quote/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(screen.queryByText(/Job status/)).not.toBeInTheDocument()
  })

  it('TC-FE-004-10 a registered account is not offered join again; the button is disabled while waiting for the wallet', async () => {
    const wallet = createMockWallet('scraper.x207-circle.near', 'scraper.x207-circle.near')
    let release!: () => void
    const original = wallet.signAndSend
    wallet.signAndSend = (signerId, tx) => new Promise((resolve) => { release = () => resolve(original(signerId, tx)) })
    const { user } = await login(wallet)
    expect(await screen.findByText(/is already registered/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/pubkey_voucher/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/Stake amount/), '10')
    // FE-089: the button names only the stake, since join is not part of what gets signed
    expect(screen.queryByRole('button', { name: /join and stake/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign stake' }))
    expect(await screen.findByText(/Waiting for signature/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Waiting for wallet/ })).toBeDisabled()
    release()
    await waitFor(() => expect(wallet.txs.map((t) => t.methodName)).toEqual(['ft_transfer_call']))
  })
})

async function loginWith(override: Parameters<typeof renderApp>[1], pollMs: number | false = false) {
  const wallet = createMockWallet(NEW_ACCOUNT, NEW_ACCOUNT)
  const view = renderApp('/onboarding', override, pollMs, wallet)
  await screen.findByText(/members registered/)
  return { ...view, user: userEvent.setup() }
}
