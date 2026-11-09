import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'
import { txToasts } from './toastStore'

const PUBKEY = 'ed25519:8hYkQ5Qb2C7XfGmW3sLtVnPz9RdKeHuJa4BcNyTx6M1E'

async function fillJoin(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /pubkey_voucher/ }), PUBKEY)
  await user.type(screen.getByRole('textbox', { name: /terms_hash/ }), 'a'.repeat(64))
  await user.click(screen.getByRole('checkbox', { name: /agree to the circle terms/ }))
  await user.type(screen.getByRole('textbox', { name: /Stake amount/ }), '50')
}

describe('FE-061 transaction status toasts', () => {
  beforeEach(() => txToasts.clear())

  it('TC-FE-061-03 a signed transaction ends as a confirmed toast with a link to the testnet explorer', async () => {
    const user = userEvent.setup()
    renderApp('/onboarding', undefined, false, createMockWallet('a.testnet', 'a.testnet'))
    await screen.findByText('a.testnet')
    await fillJoin(user)
    await user.click(screen.getByRole('button', { name: 'Sign join and stake' }))
    const list = await screen.findByRole('list', { name: 'Transaction status' })
    const confirmed = await within(list).findAllByText('Confirmed')
    expect(confirmed.length).toBe(2) // join, then stake
    const links = within(list).getAllByRole('link', { name: 'View on explorer' })
    expect(links[0]).toHaveAttribute('href', 'https://testnet.nearblocks.io/txns/hash1')
    expect(links[1]).toHaveAttribute('href', 'https://testnet.nearblocks.io/txns/hash2')
  })

  it('TC-FE-061-04 a contract refusal shows the sentence for its ERR_ code, and the sequence stops', async () => {
    const user = userEvent.setup()
    const wallet = createMockWallet('a.testnet', 'a.testnet')
    wallet.failNextWith = 'Smart contract panicked: ERR_ALREADY_MEMBER'
    renderApp('/onboarding', undefined, false, wallet)
    await screen.findByText('a.testnet')
    await fillJoin(user)
    await user.click(screen.getByRole('button', { name: 'Sign join and stake' }))
    const list = await screen.findByRole('list', { name: 'Transaction status' })
    expect(await within(list).findByRole('alert')).toHaveTextContent('This account is already a member of the circle.')
    expect(within(list).queryByText('Confirmed')).toBeNull()
    expect(wallet.txs).toEqual([]) // the stake was not sent after the failed join
  })

  it('TC-FE-061-05 the wallet rejecting shows a cancelled toast, not a failure', async () => {
    const user = userEvent.setup()
    const wallet = createMockWallet('a.testnet', 'a.testnet')
    wallet.rejectNext = true
    renderApp('/onboarding', undefined, false, wallet)
    await screen.findByText('a.testnet')
    await fillJoin(user)
    await user.click(screen.getByRole('button', { name: 'Sign join and stake' }))
    const list = await screen.findByRole('list', { name: 'Transaction status' })
    expect(await within(list).findByText('Cancelled')).toBeInTheDocument()
    expect(within(list).queryByRole('alert')).toBeNull()
  })

  it('TC-FE-061-06 the store shows pending first, and a toast can be dismissed', async () => {
    const user = userEvent.setup()
    renderApp('/stats', undefined, false, createMockWallet('a.testnet', 'a.testnet'))
    const id = txToasts.start('join')
    expect(await screen.findByText('Pending')).toBeInTheDocument()
    txToasts.settle(id, { kind: 'confirmed', label: 'join', hash: 'h9' })
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('list', { name: 'Transaction status' })).toBeNull()
  })
})
