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
  await user.type(await screen.findByLabelText('Nominal (credit)'), '45')
  await user.type(screen.getByLabelText('Alamat penerima'), '0x4b2e0000000000000000000000000000000a7c10')
  return { ...view, user }
}
const ok = (path: string, init: RequestInit | undefined, routes: Record<string, { status: number; body: unknown }>) => {
  for (const [suffix, reply] of Object.entries(routes)) if (path.endsWith(suffix) && init?.method === 'POST') return reply
  return undefined
}

describe('pencairan kreditor ke chain lain', () => {
  it('TC-FE-011-01 fee tampil sebelum tombol tanda tangan ada', async () => {
    const { user } = await open((p, i) => ok(p, i, { '/withdraw/quote': { status: 201, body: QUOTE } }))
    expect(screen.queryByRole('button', { name: 'Tanda tangani pencairan' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Minta quote pencairan' }))
    const card = await screen.findByLabelText('Biaya pencairan')
    expect(card).toHaveTextContent('0,0024')
    expect(card).toHaveTextContent('14 bps')
    expect(card).toHaveTextContent('0.1453%')
    expect(card).toHaveTextContent('44,9346')
    expect(screen.getByRole('button', { name: 'Tanda tangani pencairan' })).toBeEnabled()
  })

  it('TC-FE-011-02 di bawah ambang Base: pesan ambang dan perkiraan kerugian', async () => {
    const { user } = await open((p, i) =>
      ok(p, i, { '/withdraw/quote': { status: 422, body: { error: { code: 'below_withdraw_threshold', message: 'x', details: { chain: 'base', minAmount: '250000', estimatedLossPct: 2.55 } } } } }),
    )
    await user.click(screen.getByRole('button', { name: 'Minta quote pencairan' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('minimal 0,25 USD')
    expect(alert).toHaveTextContent('2.55%')
  })

  it('TC-FE-011-03 Tron: high_fee_requires_ack lalu request ulang membawa acceptHighFee true', async () => {
    let calls = 0
    const { user, requests } = await open((p, i) => {
      if (!p.endsWith('/withdraw/quote') || i?.method !== 'POST') return undefined
      return calls++ === 0 ? apiError(422, 'high_fee_requires_ack') : { status: 201, body: QUOTE }
    })
    await user.selectOptions(screen.getByLabelText('Chain tujuan'), 'tron')
    await user.click(screen.getByRole('button', { name: 'Minta quote pencairan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Biaya pencairan ke chain ini tinggi')
    await user.click(screen.getByRole('checkbox', { name: /menerima biaya tinggi/ }))
    await user.click(screen.getByRole('button', { name: 'Minta quote pencairan' }))
    await screen.findByLabelText('Biaya pencairan')
    const posts = requests().filter((r) => r.path.endsWith('/withdraw/quote'))
    expect(posts.map((r) => r.body.acceptHighFee)).toEqual([false, true])
    expect(posts[0]!.body.destinationAsset).toContain('tron-')
  })

  it('TC-FE-011-04 dan 06 urutan quote, intent, tanda tangan wallet, submit, polling sampai completed, tautan explorer', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Minta quote pencairan' }))
    await user.click(await screen.findByRole('button', { name: 'Tanda tangani pencairan' }))
    await waitFor(() => expect(screen.getByText(/Status: Selesai/)).toBeInTheDocument())
    expect(requests().filter((r) => r.method === 'POST').map((r) => r.path.split('/').slice(-2).join('/'))).toEqual(['withdraw/quote', 'withdraw/intent', 'withdraw/submit'])
    expect(wallet.messages).toHaveLength(1)
    expect(wallet.messages[0]).toMatchObject({ message: '{"intent":"x"}', recipient: 'intents.near', signerId: GPU })
    expect([...wallet.messages[0]!.nonce]).toEqual([1, 2, 3, 4])
    const submit = requests().find((r) => r.path.endsWith('/withdraw/submit'))!
    expect(submit.body.signedIntent).toMatchObject({ standard: 'nep413', public_key: 'ed25519:MOCKKEY', signature: 'sig1' })
    expect(screen.getByRole('link', { name: 'INTENTHASH1' })).toHaveAttribute('href', expect.stringContaining('INTENTHASH1'))
  })

  it('TC-FE-011-05 submit 409 job_state_conflict: arahkan mulai dari quote', async () => {
    const { user } = await open((p, i) =>
      ok(p, i, {
        '/withdraw/quote': { status: 201, body: QUOTE },
        '/withdraw/intent': { status: 200, body: INTENT },
        '/withdraw/submit': { status: 409, body: { error: { code: 'job_state_conflict', message: 'x' } } },
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Minta quote pencairan' }))
    await user.click(await screen.findByRole('button', { name: 'Tanda tangani pencairan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Urutan langkah tidak sesuai. Mulai lagi dari quote.')
    expect(screen.queryByRole('button', { name: 'Tanda tangani pencairan' })).not.toBeInTheDocument()
  })

  it('TC-FE-011-07 loading lalu 502 one_click_error dengan details.upstream', async () => {
    const { user } = await open((p, i) =>
      p.endsWith('/withdraw/quote') && i?.method === 'POST'
        ? { status: 502, delayMs: 40, body: { error: { code: 'one_click_error', message: 'x', details: { upstream: { status: 500 } } } } }
        : undefined,
    )
    await user.click(screen.getByRole('button', { name: 'Minta quote pencairan' }))
    expect(await screen.findByText('Memuat quote…', { selector: 'p' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('1Click bermasalah: {"status":500}')
  })

  it('wallet menolak tanda tangan: dibatalkan, tidak ada submit', async () => {
    const wallet = createMockWallet(GPU, GPU)
    const { user, requests } = await open(
      (p, i) => ok(p, i, { '/withdraw/quote': { status: 201, body: QUOTE }, '/withdraw/intent': { status: 200, body: INTENT } }),
      wallet,
    )
    await user.click(screen.getByRole('button', { name: 'Minta quote pencairan' }))
    wallet.rejectNext = true
    await user.click(await screen.findByRole('button', { name: 'Tanda tangani pencairan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Dibatalkan pengguna')
    expect(requests().some((r) => r.path.endsWith('/withdraw/submit'))).toBe(false)
  })
})
