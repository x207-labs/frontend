import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { daoProposals } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'
import { tally } from './Governance'

describe('FE-015 DAO proposals on the governance page', () => {
  it('TC-FE-015-01 open proposals: status, change, votes, and link to the DAO', async () => {
    renderApp('/governance')
    const table = await screen.findByRole('table', { name: 'Open proposals' })
    expect(table).toHaveTextContent('Open')
    expect(table).toHaveTextContent('Payment window: 45 minutes')
    expect(table).toHaveTextContent('council1.near')
    expect(table).toHaveTextContent('1 / 0 / 0')
    expect(within(table).getByRole('link', { name: '7' })).toHaveAttribute('href', expect.stringContaining('x207.sputnik-dao.near'))
    expect(screen.getByRole('link', { name: 'x207.sputnik-dao.near' })).toBeInTheDocument()
  })

  it('TC-FE-015-02 closed proposals are separate from the open ones', async () => {
    renderApp('/governance')
    const closed = await screen.findByRole('table', { name: 'Closed proposals' })
    expect(closed).toHaveTextContent('Approved')
    expect(closed).toHaveTextContent('limit_cap')
    expect(screen.getByRole('table', { name: 'Open proposals' })).not.toHaveTextContent('Approved')
  })

  it('TC-FE-015-03 next epoch parameters are written with their effective epoch', async () => {
    renderApp('/governance')
    const note = await screen.findByLabelText('Next epoch parameters')
    expect(note).toHaveTextContent('Effective from epoch 43')
    expect(note).toHaveTextContent('Payment window 30 minutes becomes 45 minutes')
  })

  it('TC-FE-015-04 no open proposal: a message, the closed table stays', async () => {
    renderApp('/governance', (p) => (p.endsWith('/proposals') ? { status: 200, body: { ...daoProposals, items: daoProposals.items.slice(1) } } : undefined))
    expect(await screen.findByText('No open proposals.')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Closed proposals' })).toBeInTheDocument()
  })

  it('TC-FE-015-05 DAO unreadable (502): an error message, the parameter page still shows', async () => {
    renderApp('/governance', (p) => (p.endsWith('/proposals') ? apiError(502, 'dao_unavailable', 'DAO proposals unreadable') : undefined))
    // FE-097: the upstream RPC text is not shown; the note says the parameters are still current
    const note = await screen.findByTestId('dao-unavailable')
    expect(note).toHaveTextContent('dao_unavailable')
    expect(note).toHaveTextContent('parameters above come from the circle contract')
    expect(note).not.toHaveTextContent('DAO proposals unreadable')
    expect(await screen.findByText('Limit decay')).toBeInTheDocument()
  })

  it('TC-FE-015-06 tally sums the votes of all roles', () => {
    expect(tally({ council: [2, 1, 0], community: [1, 0, 1] })).toEqual({ approve: 3, reject: 1, remove: 1 })
    expect(tally({})).toEqual({ approve: 0, reject: 0, remove: 0 })
  })
})
