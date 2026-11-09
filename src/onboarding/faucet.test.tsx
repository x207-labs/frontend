// FE-064: every faucet answer, against a fake fetch. No test reaches the real faucet: `fetch` is stubbed by renderApp / the harness below.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { FixtureReply } from '../api/fixtures'
import { renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'
import { arrived, faucetOutcome, formatWait } from './faucet'
import { FaucetPanel } from './FaucetPanel'
import { readProgress } from './progress'

const ACCOUNT = 'newagent.x207-circle.near'
const NEAR = '600000000000000000000000'
const INFO = { enabled: true, near_yocto: NEAR, usdt_amount: '300000000', usdt_contract: 'usdt.x207-deployer.testnet', per_ip_per_day: 3, per_day: 100, remaining_today: 97 }
const GRANT = { account_id: ACCOUNT, near: { amount_yocto: NEAR, tx: 'n1' }, usdt: { contract: INFO.usdt_contract, amount: '300000000', txs: ['s1', 'm1'] } }
const err = (status: number, code: string, details?: Record<string, unknown>, headers?: Record<string, string>): FixtureReply => ({ status, body: { error: { code, message: code, details } }, ...(headers ? { headers } : {}) })
const bytes = (value: string) => Array.from(new TextEncoder().encode(JSON.stringify(value)))

// A fake faucet and chain: `granted` flips when a POST succeeds, and the balances follow it.
function fakeFaucet(opts: { info?: FixtureReply; post?: () => FixtureReply; neverArrives?: boolean } = {}) {
  let granted = false
  const posts: unknown[] = []
  const override = (path: string, init?: RequestInit): FixtureReply | undefined => {
    if (path === '/x207/faucet') {
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)))
        const reply = opts.post ? opts.post() : { status: 201, body: GRANT }
        if (reply.status === 201) granted = true
        return reply
      }
      return opts.info ?? { status: 200, body: INFO }
    }
    const rpc = init?.body ? JSON.parse(String(init.body)).params : undefined
    if (rpc?.request_type === 'view_account') return { status: 200, body: { result: { amount: granted && !opts.neverArrives ? NEAR : '0' } } }
    if (rpc?.request_type === 'call_function' && rpc.method_name === 'ft_balance_of') return { status: 200, body: { result: { result: bytes(granted && !opts.neverArrives ? '300000000' : '0') } } }
    return undefined
  }
  return { override, posts }
}

const step = (id: string) => screen.getByTestId(`step-${id}`)
async function open(faucet: ReturnType<typeof fakeFaucet>) {
  renderApp('/onboarding', faucet.override, false, createMockWallet(ACCOUNT, ACCOUNT))
  await screen.findByText(/members registered/)
  return userEvent.setup()
}
const click = async (user: ReturnType<typeof userEvent.setup>, name: string | RegExp) => user.click(await within(step('funds')).findByRole('button', { name }))

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

describe('TC-FE-064-01 without a faucet the manual steps stay', () => {
  it('404 (no route): faucet link and mint command', async () => {
    await open(fakeFaucet({ info: err(404, 'not_found') }))
    expect(await within(step('funds')).findByRole('link', { name: 'testnet faucet' })).toBeInTheDocument()
    expect(within(step('funds')).getByText(/near call/)).toBeInTheDocument()
    expect(within(step('funds')).queryByRole('button', { name: 'Get test funds' })).toBeNull()
  })
  it('enabled: false, and a server that fails: the same', async () => {
    await open(fakeFaucet({ info: { status: 200, body: { ...INFO, enabled: false } } }))
    expect(await within(step('funds')).findByRole('link', { name: 'testnet faucet' })).toBeInTheDocument()
    cleanup()
    await open(fakeFaucet({ info: err(500, 'internal') }))
    expect(await within(step('funds')).findByRole('link', { name: 'testnet faucet' })).toBeInTheDocument()
  })
})

describe('TC-FE-064-02 the faucet on', () => {
  it('201: POSTs only the account id, waits for the balances, then marks funds done and moves to join', async () => {
    const faucet = fakeFaucet()
    const user = await open(faucet)
    expect(await within(step('funds')).findByText(/once per account/)).toHaveTextContent('0.6 NEAR')
    await click(user, 'Get test funds')
    expect(await within(step('funds')).findByText(/Funds arrived/)).toBeInTheDocument()
    expect(faucet.posts).toEqual([{ account_id: ACCOUNT }])
    expect(step('funds')).toHaveAttribute('data-status', 'done')
    expect(step('join')).toHaveAttribute('data-status', 'current')
    expect(readProgress(ACCOUNT).funds).toBe(true)
  })

  it('409 faucet_already_claimed and faucet_already_funded: go on to join without asking again', async () => {
    for (const code of ['faucet_already_claimed', 'faucet_already_funded']) {
      localStorage.clear()
      const faucet = fakeFaucet({ post: () => err(409, code) })
      const user = await open(faucet)
      await click(user, 'Get test funds')
      await waitFor(() => expect(step('funds')).toHaveAttribute('data-status', 'done'))
      expect(step('join')).toHaveAttribute('data-status', 'current')
      expect(faucet.posts).toHaveLength(1)
      cleanup()
    }
  })

  it('429: shows the wait from Retry-After, keeps funds open', async () => {
    const user = await open(fakeFaucet({ post: () => err(429, 'rate_limited', { scope: 'faucet_ip' }, { 'Retry-After': '125' }) }))
    await click(user, 'Get test funds')
    expect(await within(step('funds')).findByRole('alert')).toHaveTextContent('Try again in 3 minutes')
    expect(step('funds')).not.toHaveAttribute('data-status', 'done')
  })

  it('429 for the whole day says so', async () => {
    const user = await open(fakeFaucet({ post: () => err(429, 'rate_limited', { scope: 'faucet_day' }, { 'Retry-After': '7200' }) }))
    await click(user, 'Get test funds')
    expect(await within(step('funds')).findByRole('alert')).toHaveTextContent('limit for today. Try again in 2 hours')
  })

  it('502 faucet_partial: a Try again button that sends the same request and finishes', async () => {
    let calls = 0
    const faucet = fakeFaucet({ post: () => (++calls === 1 ? err(502, 'faucet_partial', { near_tx: 'n1' }) : { status: 201, body: GRANT }) })
    const user = await open(faucet)
    await click(user, 'Get test funds')
    expect(await within(step('funds')).findByRole('alert')).toHaveTextContent('NEAR was sent but the USDT step failed')
    await click(user, 'Try again')
    expect(await within(step('funds')).findByText(/Funds arrived/)).toBeInTheDocument()
    expect(faucet.posts).toEqual([{ account_id: ACCOUNT }, { account_id: ACCOUNT }])
  })

  it.each([
    [502, 'faucet_failed', 'nothing was sent', 'Try again'],
    [503, 'faucet_empty', 'out of funds', 'Get test funds'],
    [404, 'faucet_account_not_found', 'does not exist on testnet', 'Get test funds'],
    [400, 'faucet_bad_account', 'did not accept this account id', 'Get test funds'],
  ])('%s %s shows a message', async (status, code, text, button) => {
    const user = await open(fakeFaucet({ post: () => err(status, code) }))
    await click(user, 'Get test funds')
    expect(await within(step('funds')).findByRole('alert')).toHaveTextContent(text)
    expect(within(step('funds')).getByRole('button', { name: button })).toBeEnabled()
    expect(step('funds')).not.toHaveAttribute('data-status', 'done')
  })

  it('a day quota of zero disables the button and points to the manual steps', async () => {
    await open(fakeFaucet({ info: { status: 200, body: { ...INFO, remaining_today: 0 } } }))
    expect(await within(step('funds')).findByRole('button', { name: 'Get test funds' })).toBeDisabled()
    expect(within(step('funds')).getByRole('alert')).toHaveTextContent('limit for today')
    expect(within(step('funds')).getByRole('link', { name: 'testnet faucet' })).toBeInTheDocument()
  })
})

describe('TC-FE-064-03 funds sent but not visible yet', () => {
  it('after the timeout the panel says so and offers Check again; funds is not marked done', async () => {
    const faucet = fakeFaucet({ neverArrives: true })
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      const reply = faucet.override(new URL(String(input)).pathname, init) ?? { status: 404, body: {} }
      return new Response(JSON.stringify(reply.body), { status: reply.status })
    }))
    const onFunded = vi.fn()
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <FaucetPanel account={ACCOUNT} onFunded={onFunded} fallback={<p>manual</p>} pollMs={20} timeoutMs={120} />
      </QueryClientProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'Get test funds' }))
    expect(await screen.findByText(/not visible yet/, undefined, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument()
    expect(onFunded).not.toHaveBeenCalled()
  })
})

describe('TC-FE-064-04 helpers', () => {
  const api = (status: number, code: string, details?: Record<string, unknown>) => new ApiError(status, code, code, details)
  it('faucetOutcome decides continue / retry / wait / stop for every documented code', () => {
    const next = (e: unknown) => faucetOutcome(e).next
    expect(next(api(409, 'faucet_already_claimed'))).toBe('continue')
    expect(next(api(409, 'faucet_already_funded'))).toBe('continue')
    expect(next(api(429, 'rate_limited', { retryAfter: 30 }))).toBe('wait')
    expect(next(api(503, 'faucet_empty'))).toBe('wait')
    expect(next(api(502, 'faucet_partial'))).toBe('retry')
    expect(next(api(502, 'faucet_failed'))).toBe('retry')
    expect(next(api(404, 'faucet_account_not_found'))).toBe('stop')
    expect(next(api(400, 'faucet_bad_account'))).toBe('stop')
    expect(next(api(400, 'invalid_request'))).toBe('stop')
    expect(next(new TypeError('Failed to fetch'))).toBe('retry')
    expect(faucetOutcome(api(429, 'rate_limited')).message).toContain('Try again later')
  })
  it('formatWait / arrived', () => {
    expect([formatWait(1), formatWait(45), formatWait(125), formatWait(7200)]).toEqual(['1 second', '45 seconds', '3 minutes', '2 hours'])
    const before = { near: 5n, usdt: 0n }
    expect(arrived(before, { near: 5n, usdt: 0n }, GRANT)).toBe(false)
    expect(arrived(before, { near: 5n + BigInt(NEAR), usdt: 0n }, GRANT)).toBe(false)
    expect(arrived(before, { near: 5n + BigInt(NEAR), usdt: 300000000n }, GRANT)).toBe(true)
    expect(arrived(before, { near: 5n + BigInt(NEAR), usdt: 0n }, { ...GRANT, usdt: null })).toBe(true)
  })
})
