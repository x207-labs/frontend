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

describe('FE-018 exit and withdraw stake', () => {
  it('TC-FE-018-01 a member without debt requests exit: request_exit transaction with 1 yocto', async () => {
    const wallet = createMockWallet(GPU, GPU)
    renderApp('/onboarding', undefined, false, wallet)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Request exit' }))
    await waitFor(() => expect(wallet.txs).toHaveLength(1))
    expect(wallet.txs[0]).toMatchObject({ receiverId: CONTRACT_ID, methodName: 'request_exit', args: {}, deposit: '1', signerId: GPU })
    expect(await screen.findByText(/Transaction sent/)).toBeInTheDocument()
  })

  it('TC-FE-018-02 there is an obligation: the ERR_HAS_DUE warning shows and the withdrawal cannot be triggered', async () => {
    renderApp('/onboarding', memberReply(SCRAPER, { exitRequestedEpoch: 41 }), false, createMockWallet(SCRAPER, SCRAPER))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('12.5')
    expect(alert).toHaveTextContent('ERR_HAS_DUE')
    expect(await screen.findByRole('button', { name: /Withdraw stake/ })).toBeDisabled()
  })

  it('TC-FE-018-03 exit requested in an epoch that is not finalized yet: waiting, withdraw button off', async () => {
    renderApp('/onboarding', memberReply(GPU, { exitRequestedEpoch: 42 }), false, createMockWallet(GPU, GPU))
    expect(await screen.findByText(/Waiting for epoch 42 to become finalized \(now payment_window\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Withdraw stake/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Request exit' })).not.toBeInTheDocument()
  })

  it('TC-FE-018-04 exit epoch finalized and no debt: withdraw_stake sent', async () => {
    const wallet = createMockWallet(GPU, GPU)
    renderApp('/onboarding', memberReply(GPU, { exitRequestedEpoch: 41 }), false, wallet)
    const user = userEvent.setup()
    const button = await screen.findByRole('button', { name: 'Withdraw stake (50)' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    await waitFor(() => expect(wallet.txs).toHaveLength(1))
    expect(wallet.txs[0]).toMatchObject({ receiverId: CONTRACT_ID, methodName: 'withdraw_stake', args: {}, deposit: '1', signerId: GPU })
  })

  it('TC-FE-018-05 already exited: exit message, no button', async () => {
    renderApp('/onboarding', memberReply(GPU, { status: 'exited', stake: '0', limit: '0', exitRequestedEpoch: 41 }), false, createMockWallet(GPU, GPU))
    expect(await screen.findByText(/already left and the stake has been withdrawn/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Request exit|Withdraw stake/ })).not.toBeInTheDocument()
  })

  it('TC-FE-018-06 wallet rejects: cancelled by user, no transaction', async () => {
    const wallet = createMockWallet(GPU, GPU)
    wallet.rejectNext = true
    renderApp('/onboarding', undefined, false, wallet)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Request exit' }))
    expect(await screen.findByText(/Cancelled by user/)).toBeInTheDocument()
    expect(wallet.txs).toHaveLength(0)
  })

  it('TC-FE-018-07 a pending member does not see the exit panel', async () => {
    renderApp('/onboarding', memberReply(GPU, { status: 'pending', stake: '0', limit: '0' }), false, createMockWallet(GPU, GPU))
    await screen.findByText('pending')
    expect(screen.queryByText('Leave the circle')).not.toBeInTheDocument()
  })
})
