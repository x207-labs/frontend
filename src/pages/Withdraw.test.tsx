import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { apiError, renderApp, type Override } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const GPU = 'gpu.x207-circle.near'
const QUOTE = {
  jobId: 'w1', status: 'quoted', dry: false, amountIn: '45000000', amountOut: '44934600', withdrawFee: '2400',
  variableFeeBpsEstimate: 14, totalFeePct: 0.1453, threshold: { chain: 'base', minAmount: '250000', ok: true },
  timeEstimateSeconds: 12, warnings: [],
}
const INTENT = { jobId: 'w1', intent: { standard: 'nep413', payload: { message: '{"intent":"x"}', nonce: 'AQIDBA==', recipient: 'intents.near' } } }
const job = (status: string) => ({ jobId: 'w1', kind: 'withdraw', status, oneClickStatus: 'X', account: GPU, updatedAt: '2026-11-09T11:41:20Z' })

async function open(override: Override, wallet = createMockWallet(GPU, GPU), pollMs: number | false = false) {
  const view = renderApp('/settlement?epoch=42', override, pollMs, wallet)
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Amount (credit)'), '45')
  await user.type(screen.getByLabelText('Recipient address'), '0x4b2e0000000000000000000000000000000a7c10')
  return { ...view, user }
}
const ok = (path: string, init: RequestInit | undefined, routes: Record<string, { status: number; body: unknown }>) => {
  for (const [suffix, reply] of Object.entries(routes)) if (path.endsWith(suffix) && init?.method === 'POST') return reply
  return undefined
}

describe('creditor withdrawal to another chain', () => {
  it('TC-FE-011-01 the fee shows before the sign button exists', async () => {
    const { user } = await open((p, i) => ok(p, i, { '/withdraw/quote': { status: 201, body: QUOTE } }))
    expect(screen.queryByRole('button', { name: 'Sign withdrawal' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Request withdrawal quote' }))
    const card = await screen.findByLabelText('Withdrawal fees')
    expect(card).toHaveTextContent('0.0024')
    expect(card).toHaveTextContent('14 bps')
    expect(card).toHaveTextContent('0.1453%')
    expect(card).toHaveTextContent('44.9346')
    expect(screen.getByRole('button', { name: 'Sign withdrawal' })).toBeEnabled()
  })

  it('TC-FE-011-02 below the Base threshold: threshold message and estimated loss', async () => {
    const { user } = await open((p, i) =>
      ok(p, i, { '/withdraw/quote': { status: 422, body: { error: { code: 'below_withdraw_threshold', message: 'x', details: { chain: 'base', minAmount: '250000', estimatedLossPct: 2.55 } } } } }),
    )
    await user.click(screen.getByRole('button', { name: 'Request withdrawal quote' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('must be at least 0.25 USD')
    expect(alert).toHaveTextContent('2.55%')
  })

  it('TC-FE-011-03 Tron: high_fee_requires_ack then the repeated request carries acceptHighFee true', async () => {
    let calls = 0
    const { user, requests } = await open((p, i) => {
      if (!p.endsWith('/withdraw/quote') || i?.method !== 'POST') return undefined
      return calls++ === 0 ? apiError(422, 'high_fee_requires_ack') : { status: 201, body: QUOTE }
    })
    await user.selectOptions(screen.getByLabelText('Destination chain'), 'tron')
    await user.click(screen.getByRole('button', { name: 'Request withdrawal quote' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The withdrawal fee to this chain is high')
    await user.click(screen.getByRole('checkbox', { name: /accept the high fee/ }))
    await user.click(screen.getByRole('button', { name: 'Request withdrawal quote' }))
    await screen.findByLabelText('Withdrawal fees')
    const posts = requests().filter((r) => r.path.endsWith('/withdraw/quote'))
    expect(posts.map((r) => r.body.acceptHighFee)).toEqual([false, true])
    expect(posts[0]!.body.destinationAsset).toContain('tron-')
  })

  it('TC-FE-011-04 and 06 order of quote, intent, wallet signature, submit, polling until completed, explorer link', async () => {
    const wallet = createMockWallet(GPU, GPU)
    const statuses = ['processing', 'completed']
    let n = 0
    const { user, requests } = await open(
      (p, i) =>
        ok(p, i, {
          '/withdraw/quote': { status: 201, body: QUOTE },
          '/withdraw/intent': { status: 200, body: INTENT },
          '/withdraw/submit': { status: 202, body: { jobId: 'w1', status: 'processing', intentHash: 'INTENTHASH1' } },
        }) ?? (p.includes('/jobs/w1') ? { status: 200, body: job(statuses[Math.min(n++, 1)]!) } : undefined),
      wallet,
      20,
    )
    await user.click(screen.getByRole('button', { name: 'Request withdrawal quote' }))
    await user.click(await screen.findByRole('button', { name: 'Sign withdrawal' }))
    await waitFor(() => expect(screen.getByText(/Status: Completed/)).toBeInTheDocument())
    expect(requests().filter((r) => r.method === 'POST' && r.path.includes('/settlement/')).map((r) => r.path.split('/').slice(-2).join('/'))).toEqual(['withdraw/quote', 'withdraw/intent', 'withdraw/submit'])
    expect(wallet.messages).toHaveLength(1)
    expect(wallet.messages[0]).toMatchObject({ message: '{"intent":"x"}', recipient: 'intents.near', signerId: GPU })
    expect([...wallet.messages[0]!.nonce]).toEqual([1, 2, 3, 4])
    const submit = requests().find((r) => r.path.endsWith('/withdraw/submit'))!
    expect(submit.body.signedIntent).toMatchObject({ standard: 'nep413', public_key: 'ed25519:MOCKKEY', signature: 'sig1' })
    expect(screen.getByRole('link', { name: 'INTENTHASH1' })).toHaveAttribute('href', expect.stringContaining('INTENTHASH1'))
  })

  it('TC-FE-011-05 submit 409 job_state_conflict: directs to start from the quote', async () => {
    const { user } = await open((p, i) =>
      ok(p, i, {
        '/withdraw/quote': { status: 201, body: QUOTE },
        '/withdraw/intent': { status: 200, body: INTENT },
        '/withdraw/submit': { status: 409, body: { error: { code: 'job_state_conflict', message: 'x' } } },
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Request withdrawal quote' }))
    await user.click(await screen.findByRole('button', { name: 'Sign withdrawal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Steps are out of order. Start again from the quote.')
    expect(screen.queryByRole('button', { name: 'Sign withdrawal' })).not.toBeInTheDocument()
  })

  it('TC-FE-011-07 loading then 502 one_click_error with details.upstream', async () => {
    const { user } = await open((p, i) =>
      p.endsWith('/withdraw/quote') && i?.method === 'POST'
        ? { status: 502, delayMs: 40, body: { error: { code: 'one_click_error', message: 'x', details: { upstream: { status: 500 } } } } }
        : undefined,
    )
    await user.click(screen.getByRole('button', { name: 'Request withdrawal quote' }))
    expect(await screen.findByText('Loading quote…', { selector: 'p' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('1Click has a problem: {"status":500}')
  })

  it('wallet rejects the signature: cancelled, no submit', async () => {
    const wallet = createMockWallet(GPU, GPU)
    const { user, requests } = await open(
      (p, i) => ok(p, i, { '/withdraw/quote': { status: 201, body: QUOTE }, '/withdraw/intent': { status: 200, body: INTENT } }),
      wallet,
    )
    await user.click(screen.getByRole('button', { name: 'Request withdrawal quote' }))
    wallet.rejectNext = true
    await user.click(await screen.findByRole('button', { name: 'Sign withdrawal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cancelled by user')
    expect(requests().some((r) => r.path.endsWith('/withdraw/submit'))).toBe(false)
  })
})
