import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'
import { JOIN_STORAGE_DEPOSIT as CORE_JOIN_DEPOSIT } from '@x207/core'
import { JOIN_STORAGE_DEPOSIT } from './transactions'

const PUBKEY = 'ed25519:8hYkQ5Qb2C7XfGmW3sLtVnPz9RdKeHuJa4BcNyTx6M1E'
const HASH = 'a'.repeat(64)
const noPoll = false

async function fillJoin(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /pubkey_voucher/ }), PUBKEY)
  await user.type(screen.getByRole('textbox', { name: /terms_hash/ }), HASH)
  await user.click(screen.getByRole('checkbox', { name: /agree to the circle terms/ }))
  await user.type(screen.getByRole('textbox', { name: /Stake amount/ }), '50')
}

describe('NEAR Connect', () => {
  it('TC-FE-003-01 the login button opens the wallet and the account shows', async () => {
    const user = userEvent.setup()
    const wallet = createMockWallet()
    renderApp('/onboarding', undefined, noPoll, wallet)
    // the header and the prompt of the page (FE-035) both have the button; either one opens the wallet
    await user.click((await screen.findAllByRole('button', { name: 'Sign in with wallet' }))[0]!)
    expect(wallet.connectCalls).toBe(1)
    expect(await screen.findByText('scraper.x207-circle.near')).toBeInTheDocument()
  })

  it('a saved session is restored after reload', async () => {
    renderApp('/onboarding', undefined, noPoll, createMockWallet('a.testnet', 'a.testnet'))
    expect(await screen.findByText('a.testnet')).toBeInTheDocument()
  })

  it('TC-FE-003-05 sign out: the account is gone and the form gives way to the sign-in prompt', async () => {
    const user = userEvent.setup()
    renderApp('/onboarding', undefined, noPoll, createMockWallet('a.testnet', 'a.testnet'))
    // FE-055: the sign-out control moved into the account menu, so open it first.
    await user.click(await screen.findByRole('button', { name: /Account menu/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Disconnect' }))
    expect(screen.queryByText('a.testnet')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign join and stake' })).toBeNull()
    expect(screen.getByText(/Join the circle works on your own account/)).toBeInTheDocument()
  })

  it('TC-FE-003-06 the join transaction carries network, receiver, gas, and deposit', async () => {
    const user = userEvent.setup()
    const wallet = createMockWallet('a.testnet', 'a.testnet')
    renderApp('/onboarding', undefined, noPoll, wallet)
    await screen.findByText('a.testnet')
    await fillJoin(user)
    await user.click(screen.getByRole('button', { name: 'Sign join and stake' }))
    expect(await screen.findByRole('link', { name: 'hash2' })).toHaveAttribute('href', expect.stringContaining('hash2'))
    expect(wallet.txs.slice(0, 1)).toEqual([
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
    expect(BigInt(wallet.txs[0].deposit)).toBe(CORE_JOIN_DEPOSIT)
    // Onboarding and settlement use the same signing helper: the stake fills network, receiver, and gas too.
    expect(wallet.txs[1]).toMatchObject({ network: 'testnet', methodName: 'ft_transfer_call', receiverId: 'usdt.x207-deployer.testnet' })
    expect(wallet.txs[1].gas).not.toBe('')
  })

  it('TC-FE-003-04 wallet rejects: cancelled message, no transaction', async () => {
    const user = userEvent.setup()
    const wallet = createMockWallet('a.testnet', 'a.testnet')
    wallet.rejectNext = true
    renderApp('/onboarding', undefined, noPoll, wallet)
    await screen.findByText('a.testnet')
    await fillJoin(user)
    await user.click(screen.getByRole('button', { name: 'Sign join and stake' }))
    expect(await screen.findByText(/Cancelled by user/)).toBeInTheDocument()
    expect(wallet.txs).toEqual([])
  })

  it('invalid input holds the button', async () => {
    const user = userEvent.setup()
    renderApp('/onboarding', undefined, noPoll, createMockWallet('a.testnet', 'a.testnet'))
    await screen.findByText('a.testnet')
    await user.type(screen.getByRole('textbox', { name: /pubkey_voucher/ }), 'not-a-key')
    await user.type(screen.getByRole('textbox', { name: /terms_hash/ }), HASH)
    expect(screen.getByRole('button', { name: 'Sign join and stake' })).toBeDisabled()
  })
})
