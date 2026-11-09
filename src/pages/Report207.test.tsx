import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { report42 } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'

const fact = (term: string) => screen.getByText(term, { selector: 'dt' }).closest('div')!
const withReport = (body: unknown, status = 207) => (p: string) =>
  /\/epochs\/\d+$/.test(p) ? { status, body } : undefined

describe('207 report', () => {
  it('TC-FE-069-01 with no epoch yet the page says so and links on, instead of staying blank', async () => {
    renderApp('/reports', (p) => (/\/epochs(\?.*)?$/.test(p) ? { status: 200, body: { items: [] } } : undefined))
    const empty = await screen.findByRole('region', { name: 'No epoch yet' })
    expect(within(empty).getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', expect.stringContaining('/app'))
    expect(within(empty).getByRole('link', { name: 'What is an epoch?' })).toHaveAttribute('href', expect.stringContaining('/help'))
  })

  it('TC-FE-007-01 and -07 a 207 response is read as success', async () => {
    renderApp('/reports')
    await screen.findByText('Status per member')
    expect(fact('Cleared value')).toHaveTextContent('1,820')
    expect(fact('Cleared ratio')).toHaveTextContent('71%')
    // FE-072: the cell shows a word and a sign; the status number stays in data-status
    const cells = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0])
    expect(cells.map((c) => c.querySelector('[data-status]')?.getAttribute('data-status'))).toEqual(['200', '200', '200', '402', '402', '202'])
    expect(cells.map((c) => c.textContent)).toEqual(['Settled', 'Settled', 'Settled', 'Pays', 'Pays', 'Claims'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('TC-FE-007-02 409 entry with stakeSlashed and haircut', async () => {
    const body = { ...report42, members: [{ account: 'scraper.x207-circle.near', status: 409, net: '-35000000', settlement: 'defaulted', amount: '35000000', stakeSlashed: '35000000', haircut: '0' }] }
    renderApp('/reports', withReport(body))
    expect(await screen.findByText('Default: stake slashed 35, haircut 0')).toBeInTheDocument()
  })

  it('TC-FE-007-03 not committed: a message, no table', async () => {
    renderApp('/reports', withReport({ ...report42, committed: false, members: [] }, 200))
    expect(await screen.findByText(/Epoch is not committed yet/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('TC-FE-007-04 404 error', async () => {
    renderApp('/reports', (p) => (/\/epochs\/\d+$/.test(p) ? apiError(404, 'epoch_not_found') : undefined))
    expect(await screen.findByRole('alert')).toHaveTextContent('epoch_not_found')
  })

  it('TC-FE-007-05 loading', async () => {
    renderApp('/reports', (p) => (/\/epochs\/\d+$/.test(p) ? { status: 207, body: report42, delayMs: 50 } : undefined))
    expect(await screen.findByText(/Loading report/)).toBeInTheDocument()
  })

  it('TC-FE-007-06 202 claimable false: wait-for-finalization label, no claim button', async () => {
    renderApp('/reports')
    expect(await screen.findByText('45 claimable after finalization')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /claim/i })).not.toBeInTheDocument()
  })
})
