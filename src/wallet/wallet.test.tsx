import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'
import { JOIN_STORAGE_DEPOSIT } from './transactions'

const PUBKEY = 'ed25519:8hYkQ5Qb2C7XfGmW3sLtVnPz9RdKeHuJa4BcNyTx6M1E'
const HASH = 'a'.repeat(64)
const noPoll = false

async function fillJoin(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /pubkey_voucher/ }), PUBKEY)
  await user.type(screen.getByRole('textbox', { name: /terms_hash/ }), HASH)
}

describe('NEAR Connect', () => {
  it('TC-FE-003-01 tombol login membuka wallet dan akun tampil', async () => {
    const user = userEvent.setup()
    const wallet = createMockWallet()
    renderApp('/onboarding', undefined, noPoll, wallet)
    await user.click(await screen.findByRole('button', { name: 'Masuk dengan wallet' }))
    expect(wallet.connectCalls).toBe(1)
    expect(await screen.findByText('scraper.x207-circle.near')).toBeInTheDocument()
  })

  it('sesi tersimpan dipulihkan setelah reload', async () => {
    renderApp('/onboarding', undefined, noPoll, createMockWallet('a.testnet', 'a.testnet'))
    expect(await screen.findByText('a.testnet')).toBeInTheDocument()
  })

  it('TC-FE-003-05 logout: akun hilang dan tombol aksi nonaktif', async () => {
    const user = userEvent.setup()
    renderApp('/onboarding', undefined, noPoll, createMockWallet('a.testnet', 'a.testnet'))
    await user.click(await screen.findByRole('button', { name: 'Keluar' }))
    expect(screen.queryByText('a.testnet')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tanda tangani join' })).toBeDisabled()
  })

  it('TC-FE-003-06 transaksi join memuat network, receiver, gas, dan deposit', async () => {
    const user = userEvent.setup()
    const wallet = createMockWallet('a.testnet', 'a.testnet')
    renderApp('/onboarding', undefined, noPoll, wallet)
    await screen.findByText('a.testnet')
    await fillJoin(user)
    await user.click(screen.getByRole('button', { name: 'Tanda tangani join' }))
    expect(await screen.findByRole('link', { name: 'hash1' })).toHaveAttribute('href', expect.stringContaining('hash1'))
    expect(wallet.txs).toEqual([
      {
        signerId: 'a.testnet',
        network: 'testnet',
        receiverId: 'x207-circle.testnet',
        methodName: 'join',
        args: { circle_id: 'agents-main', pubkey_voucher: PUBKEY, terms_hash: HASH },
        gas: '30000000000000',
        deposit: JOIN_STORAGE_DEPOSIT,
      },
    ])
    expect(BigInt(wallet.txs[0].deposit)).toBe(10n ** 22n)
  })

  it('TC-FE-003-04 wallet menolak: pesan dibatalkan, tanpa transaksi', async () => {
    const user = userEvent.setup()
    const wallet = createMockWallet('a.testnet', 'a.testnet')
    wallet.rejectNext = true
    renderApp('/onboarding', undefined, noPoll, wallet)
    await screen.findByText('a.testnet')
    await fillJoin(user)
    await user.click(screen.getByRole('button', { name: 'Tanda tangani join' }))
    expect(await screen.findByText(/Dibatalkan pengguna/)).toBeInTheDocument()
    expect(wallet.txs).toEqual([])
  })

  it('input tidak valid menahan tombol', async () => {
    const user = userEvent.setup()
    renderApp('/onboarding', undefined, noPoll, createMockWallet('a.testnet', 'a.testnet'))
    await screen.findByText('a.testnet')
    await user.type(screen.getByRole('textbox', { name: /pubkey_voucher/ }), 'bukan-kunci')
    await user.type(screen.getByRole('textbox', { name: /terms_hash/ }), HASH)
    expect(screen.getByRole('button', { name: 'Tanda tangani join' })).toBeDisabled()
  })
})
