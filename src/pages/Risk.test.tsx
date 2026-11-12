import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { members } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'

const defaulted = {
  unit: 'credit', decimals: 6, nextCursor: null,
  items: [{ epoch: 42, phase: 'finalized', account: 'scraper.x207-circle.near', role: 'debtor', net: '-35000000', amount: '35000000', status: 'defaulted', stakeSlashed: '35000000', haircut: '0' }],
}

describe('risk', () => {
  it('TC-FE-012-01 table of status, stake, limit, headroom, history', async () => {
    renderApp('/risk')
    const row = (await within(screen.getByRole('main')).findByText('scraper')).closest('tr')!
    expect(within(row).getByText('active')).toBeInTheDocument()
    expect(row).toHaveTextContent('37.5')
    expect(row).toHaveTextContent('35')
  })

  it('FE-042 a pending member is not listed in the risk table or the limit history picker', async () => {
    const pending = { ...members[0], account: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', status: 'pending' }
    renderApp('/risk', (p) => (p.endsWith('/members') ? { status: 200, body: { items: [...members, pending] } } : undefined))
    await screen.findByText('scraper')
    expect(screen.queryByText(/0x70997970/)).toBeNull()
    expect(screen.queryByRole('option', { name: pending.account })).toBeNull()
  })

  it('TC-FE-012-02 defaults list with stake slashed calls status=defaulted', async () => {
    const { calls } = renderApp('/risk?epoch=42', (p) => (p.includes('status=defaulted') ? { status: 200, body: defaulted } : undefined))
    await screen.findByRole('heading', { name: 'Defaults in epoch 42' })
    expect((await screen.findAllByText('35.00')).length).toBeGreaterThan(0)
    expect(calls().some((c) => c.endsWith('/epochs/42/settlements?status=defaulted'))).toBe(true)
  })

  it('TC-FE-012-03 no defaults', async () => {
    renderApp('/risk')
    expect(await screen.findByText('No defaults in this epoch.')).toBeInTheDocument()
  })

  it('TC-FE-012-04 loading', async () => {
    renderApp('/risk', (p) => (p.endsWith('/members') ? { status: 200, body: { items: members }, delayMs: 50 } : undefined))
    expect(await screen.findByText(/Loading members/)).toBeInTheDocument()
  })

  it.each([
    [404, 'circle_not_found'],
    [503, 'indexer_unavailable'],
  ])('TC-FE-012-05 error %i %s', async (status, code) => {
    renderApp('/risk', (p) => (p.endsWith('/members') ? apiError(status, code) : undefined))
    expect(await screen.findByRole('alert')).toHaveTextContent(code)
  })

  it('a suspended member shows with limit 0', async () => {
    const suspended = members.map((m) => (m.account.startsWith('scraper') ? { ...m, status: 'suspended', limit: '0', headroom: '0' } : m))
    renderApp('/risk', (p) => (p.endsWith('/members') ? { status: 200, body: { items: suspended, nextCursor: null } } : undefined))
    const row = (await within(screen.getByRole('main')).findByText('scraper')).closest('tr')!
    expect(within(row).getByText('suspended')).toBeInTheDocument()
    expect(within(row).getAllByText('0.00').length).toBeGreaterThanOrEqual(2)
  })
})
