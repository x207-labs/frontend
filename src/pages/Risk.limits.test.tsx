import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { epochSettlements42 } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'
import { lossAllocation } from './Risk'

const defaulted = (extra: object) => ({
  epoch: 42, phase: 'finalized', account: 'scraper.x207-circle.near', role: 'debtor', net: '-35000000', amount: '35000000', status: 'defaulted',
  due: '2026-11-09T12:00:00Z', paidAmount: '0', stakeSlashed: '35000000', haircut: '0', ...extra,
})

describe('FE-013 limit history and loss allocation', () => {
  it('TC-FE-013-01 limit history of the first member from the read API, newest first', async () => {
    const { calls } = renderApp('/risk')
    const table = await screen.findByRole('table', { name: 'Limit history' })
    await waitFor(() => expect(calls().some((c) => c.includes('/members/cleaner.x207-circle.near/limits'))).toBe(true))
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('42')
    expect(rows[1]).toHaveTextContent('cash_settlement')
    expect(rows[1]).toHaveTextContent('40')
    expect(rows[1]).toHaveTextContent('50')
    expect(rows[2]).toHaveTextContent('stake')
    // FE-090: a change outside any epoch (the first stake) says so in words, not with a dash
    expect(rows[2]).toHaveTextContent('No epoch')
  })

  it('TC-FE-013-02 choosing another member loads the history of that member', async () => {
    const { calls } = renderApp('/risk')
    const user = userEvent.setup()
    await screen.findByRole('table', { name: 'Limit history' })
    await user.selectOptions(screen.getByLabelText('Member'), 'gpu.x207-circle.near')
    await waitFor(() => expect(calls().some((c) => c.includes('/members/gpu.x207-circle.near/limits'))).toBe(true))
  })

  it('TC-FE-013-03 a member with no history or an error: a message, not an empty table', async () => {
    renderApp('/risk', (p) => (p.endsWith('/limits') ? { status: 200, body: { items: [], nextCursor: null } } : undefined))
    expect(await screen.findByText('No limit changes for this member yet.')).toBeInTheDocument()
  })

  it('TC-FE-013-04 a 404 error on the history shows as a message', async () => {
    renderApp('/risk', (p) => (p.endsWith('/limits') ? apiError(404, 'member_not_found', 'Account is not registered in the circle') : undefined))
    expect((await screen.findAllByText(/member_not_found|not registered/)).length).toBeGreaterThan(0)
  })

  it('TC-FE-013-05 defaults: stake, reserve fund, and haircut columns with the rest computed from the loss order', async () => {
    renderApp('/risk?epoch=42', (p) =>
      p.includes('/epochs/42/settlements') ? { status: 200, body: { items: [defaulted({ paidAmount: '5000000', stakeSlashed: '20000000', haircut: '4000000' })], nextCursor: null } } : undefined,
    )
    const table = (await screen.findByRole('columnheader', { name: 'Reserve fund' })).closest('table')!
    const row = within(table).getAllByRole('row')[1]!
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent)
    // owed 35, paid 5, stake 20, haircut 4: reserve 35 - 5 - 20 - 4 = 6
    expect(cells.slice(1)).toEqual(['35', '20', '6', '4'])
    // FE-090: the loss order is a list of its three steps, in order
    const order = within(screen.getByRole('list', { name: 'Loss order' })).getAllByRole('listitem').map((li) => li.querySelector('strong')?.textContent)
    expect(order).toEqual(['Debtor stake', 'Reserve fund', 'Haircut to direct creditors'])
  })

  it('TC-FE-013-06 lossAllocation: stake first, then reserve, then haircut', () => {
    expect(lossAllocation({ amount: '100', paidAmount: '0', stakeSlashed: '100', haircut: '0' })).toEqual({ owed: 100n, stake: 100n, haircut: 0n, reserve: 0n })
    expect(lossAllocation({ amount: '100', paidAmount: '10', stakeSlashed: '40', haircut: '20' })).toEqual({ owed: 90n, stake: 40n, haircut: 20n, reserve: 30n })
    expect(lossAllocation({ amount: '100', stakeSlashed: '120', haircut: '0' }).reserve).toBe(0n)
    expect(epochSettlements42.items.length).toBeGreaterThan(0)
  })
})
