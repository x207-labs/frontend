import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { apiError, renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const GPU = 'gpu.x207-circle.near'
const credit = (extra: object = {}) => ({
  epoch: 42, phase: 'finalized', role: 'creditor', net: '+45000000', amount: '45000000', status: 'claimable',
  claimableNow: true, destination: null, txHash: null, account: GPU, ...extra,
})
const mine = (items: unknown[]) => (path: string) =>
  path.includes(`/members/${GPU}/settlements`) ? { status: 200, body: { unit: 'credit', decimals: 6, items, nextCursor: null } } : undefined
const open = (wallet = createMockWallet(GPU, GPU), override?: Parameters<typeof renderApp>[1]) => renderApp('/settlement?epoch=42', override, false, wallet)

describe('creditor settlement', () => {
  it('TC-FE-010-01 claimable with claimableNow false: buttons disabled while waiting for finalize_epoch', async () => {
    open()
    expect(await screen.findByText(/Waiting for finalize_epoch/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Claim to NEAR account' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Claim to Intents balance' })).toBeDisabled()
  })

  it('TC-FE-010-02 claimableNow true: claim(epoch, near) then claim(epoch, intents) with 1 yocto and gas >= 100 TGas', async () => {
    const wallet = createMockWallet(GPU, GPU)
    open(wallet, mine([credit()]))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Claim to NEAR account' }))
    await waitFor(() => expect(wallet.txs).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'Claim to Intents balance' }))
    await waitFor(() => expect(wallet.txs).toHaveLength(2))
    expect(wallet.txs.map((t) => [t.methodName, t.args])).toEqual([
      ['claim', { epoch: 42, destination: 'near' }],
      ['claim', { epoch: 42, destination: 'intents' }],
    ])
    for (const tx of wallet.txs) {
      expect(tx.deposit).toBe('1')
      expect(BigInt(tx.gas)).toBeGreaterThanOrEqual(100n * 10n ** 12n)
    }
  })

  it('TC-FE-010-05 after claim the item is claimable again: transfer failed message and button enabled again', async () => {
    const wallet = createMockWallet(GPU, GPU)
    open(wallet, mine([credit()]))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Claim to NEAR account' }))
    expect(await screen.findByText(/Transfer failed, balance restored/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Claim to NEAR account' })).toBeEnabled()
  })

  it('TC-FE-010-06 no creditor items', async () => {
    open(createMockWallet(GPU, GPU), mine([credit({ role: 'debtor' })]))
    expect(await screen.findByText('No balance to claim.')).toBeInTheDocument()
  })

  it('TC-FE-010-07 loading then error 503', async () => {
    open(createMockWallet(GPU, GPU), (p) => (p.includes('/settlements') && p.includes('/members/') ? { ...apiError(503, 'indexer_unavailable'), delayMs: 30 } : undefined))
    expect(await screen.findByText(/Loading dues/)).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('indexer_unavailable')
  })

  it('TC-FE-010-08 item claimed epoch 41: status, intents destination, and transaction hash link', async () => {
    open(createMockWallet(GPU, GPU), mine([credit({ epoch: 41, status: 'claimed', destination: 'intents', txHash: 'HASH41' })]))
    expect(await screen.findByText(/Epoch 41: balance/)).toHaveTextContent('claimed')
    expect(screen.getByText(/Epoch 41: balance/)).toHaveTextContent('intents')
    expect(screen.getByRole('link', { name: 'HASH41' })).toHaveAttribute('href', expect.stringContaining('HASH41'))
  })
})
