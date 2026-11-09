import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CIRCLE_OPTIONS } from '../config'
import { CIRCLE_API_ORIGINS } from '../lib/csp'
import { apiError, renderApp } from '../test/render'
import { formatTtl } from '../lib/format'

const rowOf = (table: HTMLElement, id: number) => within(table).getByText(String(id), { selector: 'td.num' }).closest('tr') as HTMLElement

describe('FE-045 account sales (contract 0.0.18), read only', () => {
  it('TC-FE-045-01 lists every account sale with its state, buyer, expiry, kind and lock epoch, and the time limit of the contract', async () => {
    const { calls } = renderApp('/access')
    const table = await screen.findByRole('table', { name: 'Account sales' })
    await within(table).findByText('member account')
    expect(rowOf(table, 5)).toHaveTextContent('sold.seller.testnet')
    expect(rowOf(table, 5)).toHaveTextContent('delivered to the buyer')
    expect(rowOf(table, 5)).toHaveTextContent('buyer.testnet')
    expect(rowOf(table, 5)).toHaveTextContent('Nov 10, 2026, 12:00 PM UTC')
    expect(rowOf(table, 5)).toHaveTextContent('40 (finalized)')
    expect(rowOf(table, 6)).toHaveTextContent('held: keys locked, waiting for delivery')
    expect(rowOf(table, 6)).toHaveTextContent('member account')
    expect(rowOf(table, 6)).toHaveTextContent('waits until the lock epoch is finalized')
    expect(rowOf(table, 7)).toHaveTextContent("cancelled: seller's key returned")
    expect(screen.getByTestId('max-escrow-ttl')).toHaveTextContent('max_escrow_ttl): 72 hours')
    expect(calls().some((c) => c.endsWith('/x207/circles/agents-main/account-escrows'))).toBe(true)
    expect(calls().some((c) => c.endsWith('/x207/circles/agents-main/account-escrows/6'))).toBe(true)
    // read only: no button that would lock, deliver or cancel a sale
    expect(within(table.closest('section')!).queryByRole('button')).not.toBeInTheDocument()
  })

  it('TC-FE-045-02 a circle before 0.0.18 (read API answers 404) says so instead of an error, and does not ask the contract for the limit', async () => {
    const { calls } = renderApp('/access', (p) => (p.includes('/account-escrows') ? apiError(404, 'not_found', 'Unknown endpoint') : undefined))
    expect(await screen.findByText(/This circle has no account sales: they need contract 0.0.18/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByTestId('max-escrow-ttl')).not.toBeInTheDocument()
    expect(calls().some((c) => c.includes('rpc'))).toBe(false)
  })

  it('TC-FE-045-03 an empty list and a contract without the limit view are said in words', async () => {
    renderApp('/access', (p, init) => {
      if (p.endsWith('/account-escrows')) return { status: 200, body: { items: [] } }
      // the only contract view of this page is get_max_escrow_ttl; a contract before 0.0.18 has no such method
      if (String(init?.body ?? '').includes('call_function')) return { status: 200, body: { jsonrpc: '2.0', id: 'x207', result: { error: 'MethodResolveError(MethodNotFound)' } } }
      return undefined
    })
    expect(await screen.findByText('No account sale in this circle yet.')).toBeInTheDocument()
    expect(await screen.findByText(/not available on this contract/)).toBeInTheDocument()
  })

  it('TC-FE-045-04 the limit is shown in hours', () => {
    expect(formatTtl('259200000000000')).toBe('72 hours')
    expect(formatTtl(3_600_000_000_000)).toBe('1 hour')
    expect(formatTtl('5400000000000')).toBe('1.5 hours')
    expect(formatTtl('0')).toBeNull()
    expect(formatTtl('x')).toBeNull()
  })

  it('TC-FE-045-05 the picker offers v018 first, keeps v013 for the history, has no v016, and the CSP allows every host it offers', () => {
    expect(CIRCLE_OPTIONS.map((o) => o.key)).toEqual(['v018', 'v017', 'v015', 'v014', 'v013'])
    expect(CIRCLE_OPTIONS[0]).toMatchObject({ contract: 'x207-v018.testnet', apiUrl: 'https://v018.x207.boxd.sh', label: 'x207-v018 (main circle, 0.0.18)' })
    expect(CIRCLE_OPTIONS.find((o) => o.key === 'v017')).toMatchObject({ contract: 'x207-v017.testnet', apiUrl: 'https://v017.x207.boxd.sh' })
    expect(CIRCLE_OPTIONS.find((o) => o.key === 'v013')).toMatchObject({ contract: 'x207-v013.testnet', apiUrl: 'https://x207.boxd.sh' })
    expect(CIRCLE_OPTIONS.some((o) => o.apiUrl.includes('v016'))).toBe(false)
    expect([...CIRCLE_API_ORIGINS].sort()).toEqual(CIRCLE_OPTIONS.map((o) => o.apiUrl).sort())
  })
})
