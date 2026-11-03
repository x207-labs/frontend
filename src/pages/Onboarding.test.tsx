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
  await screen.findByText(/anggota terdaftar/)
  return { ...view, user: userEvent.setup() }
}
async function fillForm(user: ReturnType<typeof userEvent.setup>, { amount = '50', source }: { amount?: string; source?: string } = {}) {
  await user.type(screen.getByLabelText(/pubkey_voucher/), PUBKEY)
  await user.type(screen.getByLabelText(/terms_hash/), HASH)
  await user.click(screen.getByLabelText(/menyetujui syarat/))
  await user.type(screen.getByLabelText(/Jumlah stake/), amount)
  if (source) await user.selectOptions(screen.getByLabelText(/Sumber USDT/), source)
}

describe('onboarding F1', () => {
  it('TC-FE-004-01 tanpa login: ajakan login dan form nonaktif', async () => {
    renderApp('/onboarding')
    expect(await screen.findByText(/Masuk dengan wallet/)).toBeInTheDocument()
    expect(screen.getByLabelText(/pubkey_voucher/)).toBeDisabled()
    expect(screen.getByRole('button', { name: /Tanda tangani/ })).toBeDisabled()
  })

  it('TC-FE-004-02 tiga pesan validasi dan tombol nonaktif', async () => {
    const { user } = await login()
    await user.type(screen.getByLabelText(/pubkey_voucher/), 'abc')
    await user.type(screen.getByLabelText(/terms_hash/), 'XYZ')
    await user.type(screen.getByLabelText(/Jumlah stake/), '0')
    expect(screen.getByText(/ed25519: diikuti base58/)).toBeInTheDocument()
    expect(screen.getByText(/64 karakter heksadesimal/)).toBeInTheDocument()
    expect(screen.getByText(/Persetujuan syarat diperlukan/)).toBeInTheDocument()
    expect(screen.getByText(/Jumlah harus lebih dari 0/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tanda tangani/ })).toBeDisabled()
  })

  it('TC-FE-004-03 USDT di saldo Intents: ft_withdraw, join, lalu stake berurutan', async () => {
    const wallet = createMockWallet(NEW_ACCOUNT, NEW_ACCOUNT)
    const { user } = await login(wallet)
    await fillForm(user, { source: 'intents' })
    await user.click(screen.getByRole('button', { name: /withdraw, join, dan stake/ }))
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

  it('TC-FE-004-04 USDT di akun NEAR: hanya join dan stake', async () => {
    const wallet = createMockWallet(NEW_ACCOUNT, NEW_ACCOUNT)
    const { user } = await login(wallet)
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /join dan stake/ }))
    await waitFor(() => expect(wallet.txs).toHaveLength(2))
    expect(wallet.txs.map((t) => t.methodName)).toEqual(['join', 'ft_transfer_call'])
  })

  it('urutan berhenti di tanda tangan yang ditolak', async () => {
    const wallet = createMockWallet(NEW_ACCOUNT, NEW_ACCOUNT)
    wallet.rejectNext = true
    const { user } = await login(wallet)
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /join dan stake/ }))
    expect(await screen.findByText(/Dibatalkan pengguna/)).toBeInTheDocument()
    expect(wallet.txs).toHaveLength(0)
  })

  it('TC-FE-004-06 aset lain: request quote dan tampilan depositAddress', async () => {
    const { user, requests } = await loginWith((path, init) =>
      path.endsWith('/deposit/quote') && init?.method === 'POST' ? { status: 201, body: QUOTE } : undefined,
    )
    await fillForm(user, { source: 'other' })
    await user.click(screen.getByRole('button', { name: /Minta quote/ }))
    expect(await screen.findByText('0x7a1c…e93f')).toBeInTheDocument()
    expect(screen.getByText('INTENTS')).toBeInTheDocument()
    expect(screen.getByText('50050000')).toBeInTheDocument()
    expect(screen.getByText('2026-11-09T11:45:00Z')).toBeInTheDocument()
    const posted = requests().find((r) => r.method === 'POST')!
    expect(posted.body).toMatchObject({ purpose: 'stake', amount: '50000000', account: NEW_ACCOUNT, refundTo: NEW_ACCOUNT })
  })

  it('TC-FE-004-07 status job berurutan; tombol aktif hanya pada ready_withdraw', async () => {
    const statuses = ['waiting_deposit', 'processing', 'ready_withdraw']
    let n = 0
    const { user } = await loginWith((path, init) => {
      if (path.endsWith('/deposit/quote') && init?.method === 'POST') return { status: 201, body: QUOTE }
      if (path.includes('/jobs/')) return { status: 200, body: job(statuses[Math.min(n++, statuses.length - 1)]) }
      return undefined
    }, 20)
    await fillForm(user, { source: 'other' })
    await user.click(screen.getByRole('button', { name: /Minta quote/ }))
    const submit = () => screen.getByRole('button', { name: /withdraw, join, dan stake/ })
    expect(await screen.findByText(/Menunggu deposit/)).toBeInTheDocument()
    expect(submit()).toBeDisabled()
    expect(await screen.findByText(/Deposit diproses/)).toBeInTheDocument()
    expect(submit()).toBeDisabled()
    expect(await screen.findByText(/siap ft_withdraw/)).toBeInTheDocument()
    await waitFor(() => expect(submit()).toBeEnabled())
  })

  it.each([['failed', /Gagal/], ['refunded', /Dikembalikan/], ['expired', /kedaluwarsa/]])(
    'TC-FE-004-08 job %s tanpa langkah lanjut',
    async (status, text) => {
      const { user } = await loginWith((path, init) => {
        if (path.endsWith('/deposit/quote') && init?.method === 'POST') return { status: 201, body: QUOTE }
        if (path.includes('/jobs/')) return { status: 200, body: job(status) }
        return undefined
      }, 20)
      await fillForm(user, { source: 'other' })
      await user.click(screen.getByRole('button', { name: /Minta quote/ }))
      expect(await screen.findByText(text)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /withdraw, join, dan stake/ })).toBeDisabled()
    },
  )

  it.each([
    [422, 'refund_account_not_found', /Akun refund tidak ditemukan/],
    [502, 'one_click_error', /1Click bermasalah/],
  ])('TC-FE-004-09 quote %s %s menampilkan pesan dan berhenti', async (status, code, text) => {
    const { user } = await loginWith((path, init) =>
      path.endsWith('/deposit/quote') && init?.method === 'POST' ? apiError(status, code) : undefined,
    )
    await fillForm(user, { source: 'other' })
    await user.click(screen.getByRole('button', { name: /Minta quote/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(screen.queryByText(/Status job/)).not.toBeInTheDocument()
  })

  it('TC-FE-004-10 akun terdaftar tidak ditawari join lagi; tombol nonaktif selama menunggu wallet', async () => {
    const wallet = createMockWallet('scraper.x207-circle.near', 'scraper.x207-circle.near')
    let release!: () => void
    const original = wallet.signAndSend
    wallet.signAndSend = (signerId, tx) => new Promise((resolve) => { release = () => resolve(original(signerId, tx)) })
    const { user } = await login(wallet)
    expect(await screen.findByText(/sudah terdaftar/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/pubkey_voucher/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/Jumlah stake/), '10')
    await user.click(screen.getByRole('button', { name: /join dan stake/ }))
    expect(await screen.findByText(/Menunggu tanda tangan/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Menunggu wallet/ })).toBeDisabled()
    release()
    await waitFor(() => expect(wallet.txs.map((t) => t.methodName)).toEqual(['ft_transfer_call']))
  })
})

async function loginWith(override: Parameters<typeof renderApp>[1], pollMs: number | false = false) {
  const wallet = createMockWallet(NEW_ACCOUNT, NEW_ACCOUNT)
  const view = renderApp('/onboarding', override, pollMs, wallet)
  await screen.findByText(/anggota terdaftar/)
  return { ...view, user: userEvent.setup() }
}
