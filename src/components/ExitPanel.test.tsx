import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { members } from '../api/fixtures'
import { CONTRACT_ID } from '../config'
import { renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const GPU = 'gpu.x207-circle.near'
const SCRAPER = 'scraper.x207-circle.near'
const memberReply = (account: string, patch: object) => (p: string) =>
  p.endsWith(`/members/${account}`)
    ? { status: 200, body: { circle: 'agents-main', unit: 'credit', decimals: 6, ...members.find((m) => m.account === account)!, ...patch } }
    : undefined

describe('FE-018 keluar dan tarik stake', () => {
  it('TC-FE-018-01 anggota tanpa utang meminta keluar: transaksi request_exit dengan 1 yocto', async () => {
    const wallet = createMockWallet(GPU, GPU)
    renderApp('/onboarding', undefined, false, wallet)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Minta keluar' }))
    await waitFor(() => expect(wallet.txs).toHaveLength(1))
    expect(wallet.txs[0]).toMatchObject({ receiverId: CONTRACT_ID, methodName: 'request_exit', args: {}, deposit: '1', signerId: GPU })
    expect(await screen.findByText(/Transaksi terkirim/)).toBeInTheDocument()
  })

  it('TC-FE-018-02 ada kewajiban: peringatan ERR_HAS_DUE tampil dan penarikan tidak bisa dipicu', async () => {
    renderApp('/onboarding', memberReply(SCRAPER, { exitRequestedEpoch: 41 }), false, createMockWallet(SCRAPER, SCRAPER))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('12,5')
    expect(alert).toHaveTextContent('ERR_HAS_DUE')
    expect(await screen.findByRole('button', { name: /Tarik stake/ })).toBeDisabled()
  })

  it('TC-FE-018-03 keluar diminta di epoch yang belum finalized: menunggu, tombol tarik mati', async () => {
    renderApp('/onboarding', memberReply(GPU, { exitRequestedEpoch: 42 }), false, createMockWallet(GPU, GPU))
    expect(await screen.findByText(/Menunggu epoch 42 berstatus finalized \(sekarang payment_window\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tarik stake/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Minta keluar' })).not.toBeInTheDocument()
  })

  it('TC-FE-018-04 epoch keluar finalized dan tanpa utang: withdraw_stake terkirim', async () => {
    const wallet = createMockWallet(GPU, GPU)
    renderApp('/onboarding', memberReply(GPU, { exitRequestedEpoch: 41 }), false, wallet)
    const user = userEvent.setup()
    const button = await screen.findByRole('button', { name: 'Tarik stake (50)' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    await waitFor(() => expect(wallet.txs).toHaveLength(1))
    expect(wallet.txs[0]).toMatchObject({ receiverId: CONTRACT_ID, methodName: 'withdraw_stake', args: {}, deposit: '1', signerId: GPU })
  })

  it('TC-FE-018-05 sudah exited: pesan keluar, tanpa tombol', async () => {
    renderApp('/onboarding', memberReply(GPU, { status: 'exited', stake: '0', limit: '0', exitRequestedEpoch: 41 }), false, createMockWallet(GPU, GPU))
    expect(await screen.findByText(/sudah keluar dan stake sudah ditarik/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Minta keluar|Tarik stake/ })).not.toBeInTheDocument()
  })

  it('TC-FE-018-06 wallet menolak: dibatalkan pengguna, tidak ada transaksi', async () => {
    const wallet = createMockWallet(GPU, GPU)
    wallet.rejectNext = true
    renderApp('/onboarding', undefined, false, wallet)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Minta keluar' }))
    expect(await screen.findByText(/Dibatalkan pengguna/)).toBeInTheDocument()
    expect(wallet.txs).toHaveLength(0)
  })

  it('TC-FE-018-07 anggota pending tidak melihat panel keluar', async () => {
    renderApp('/onboarding', memberReply(GPU, { status: 'pending', stake: '0', limit: '0' }), false, createMockWallet(GPU, GPU))
    await screen.findByText('pending')
    expect(screen.queryByText('Keluar dari lingkaran')).not.toBeInTheDocument()
  })
})
