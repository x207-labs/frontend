import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { displayAccount, initial } from '../lib/account'
import { createMockWallet } from '../test/walletMock'
import { renderApp } from '../test/render'

const noPoll = { refetchInterval: false } as never

describe('FE-055 account menu', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps a NEAR name whole and shortens the long address forms', () => {
    expect(displayAccount('scraper.x207-circle.near')).toBe('scraper.x207-circle.near')
    expect(displayAccount('a'.repeat(64))).toBe('aaaaaa…aaaa')
    expect(displayAccount('0x' + '1234567890'.repeat(4))).toBe('0x1234…7890')
    expect(initial('scraper.near')).toBe('S')
    expect(initial('0xabc')).toBe('A')
  })

  it('signed in: shows the network badge and the account, menu closed', async () => {
    renderApp('/stats', undefined, noPoll, createMockWallet('a.testnet', 'a.testnet'))
    const trigger = await screen.findByRole('button', { name: /Account menu for a.testnet/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Testnet')).toBeInTheDocument()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens with a click, focuses the first item and closes with Escape, giving the focus back', async () => {
    const user = userEvent.setup()
    renderApp('/stats', undefined, noPoll, createMockWallet('a.testnet', 'a.testnet'))
    const trigger = await screen.findByRole('button', { name: /Account menu/ })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const items = screen.getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['Copy address', 'Disconnect'])
    expect(items[0]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(items[1]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(items[0]).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('closes on a click outside', async () => {
    const user = userEvent.setup()
    renderApp('/stats', undefined, noPoll, createMockWallet('a.testnet', 'a.testnet'))
    await user.click(await screen.findByRole('button', { name: /Account menu/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.click(document.body)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('copy address writes the full account to the clipboard and says so', async () => {
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    renderApp('/stats', undefined, noPoll, createMockWallet('a.testnet', 'a.testnet'))
    await user.click(await screen.findByRole('button', { name: /Account menu/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Copy address' }))
    expect(write).toHaveBeenCalledWith('a.testnet')
    expect(await screen.findByText('Address copied')).toBeInTheDocument()
  })

  it('copy address tells the user when the clipboard refuses', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    renderApp('/stats', undefined, noPoll, createMockWallet('a.testnet', 'a.testnet'))
    await user.click(await screen.findByRole('button', { name: /Account menu/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Copy address' }))
    expect(await screen.findByText(/Copy failed/)).toBeInTheDocument()
  })

  it('disconnect signs out and shows the sign-in button again', async () => {
    const user = userEvent.setup()
    renderApp('/stats', undefined, noPoll, createMockWallet('a.testnet', 'a.testnet'))
    await user.click(await screen.findByRole('button', { name: /Account menu/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Disconnect' }))
    expect((await screen.findAllByRole('button', { name: 'Sign in with wallet' })).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Account menu/ })).toBeNull()
  })

  it('signed out: only the sign-in button, no menu and no badge', async () => {
    renderApp('/stats', undefined, noPoll)
    expect((await screen.findAllByRole('button', { name: 'Sign in with wallet' })).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Account menu/ })).toBeNull()
    expect(screen.queryByText('Testnet')).toBeNull()
  })
})
