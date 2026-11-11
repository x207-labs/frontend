import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { report42 } from '../api/fixtures'
import { CONTRACT_ID } from '../config'
import { apiError, renderApp } from '../test/render'

const fact = (term: string) => screen.getByText(term, { selector: 'dt' }).closest('div')!
const withReport = (body: unknown, status = 207) => (p: string) =>
  /\/epochs\/\d+$/.test(p) ? { status, body } : undefined
const memberRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)

describe('207 report', () => {
  it('TC-FE-069-01 with no epoch yet the page says so and links on, instead of staying blank', async () => {
    renderApp('/reports', (p) => (/\/epochs(\?.*)?$/.test(p) ? { status: 200, body: { items: [] } } : undefined))
    const empty = await screen.findByRole('region', { name: 'No epoch yet' })
    expect(within(empty).getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', expect.stringContaining('/app'))
    expect(within(empty).getByRole('link', { name: 'What is an epoch?' })).toHaveAttribute('href', expect.stringContaining('/help'))
  })

  it('TC-FE-007-01 and -07 a 207 response is read as success, and the page is a settlement statement', async () => {
    renderApp('/reports')
    expect(await screen.findByRole('heading', { name: 'Epoch 41 settlement statement' })).toBeInTheDocument()
    expect(screen.getByText('agents-main · epoch 41 · payment window')).toBeInTheDocument()
    // the facts row: contract, commit time, deadline, and the state as a result code and a word
    expect(fact('Circle contract')).toHaveTextContent(CONTRACT_ID)
    expect(fact('Committed at')).toHaveTextContent('Nov 9, 2026, 11:30 AM UTC')
    expect(fact('Payment deadline')).toHaveTextContent('Nov 9, 2026, 12:00 PM UTC')
    expect(fact('State')).toHaveTextContent('402Payment window')
    // the two big numbers: what was owed (across the vouchers of the metrics) and what moved (what the debtors pay in)
    expect(screen.getByText('2,563.38')).toBeInTheDocument()
    expect(await screen.findByText('credit owed across 240 vouchers')).toBeInTheDocument()
    expect(screen.getByText('45.00', { selector: '.ep-big .ds-num' })).toBeInTheDocument()
    // the members: a result code and a word, never a colour alone; amounts in credit with 2 decimals
    const rows = memberRows()
    expect(rows.map((r) => within(r).getAllByRole('cell')[2].textContent)).toEqual(['200Settled', '200Settled', '200Settled', '402Due', '402Due', '202Claimable'])
    expect(rows.map((r) => within(r).getByRole('rowheader').textContent)).toEqual(['translator', 'summarizer', 'image', 'scraper', 'cleaner', 'gpu'])
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['0.00', '0.00', '0.00', '-35.00', '-10.00', '+45.00'])
    expect(rows.map((r) => within(r).getAllByRole('cell')[1].textContent)).toEqual(['310.00', '402.74', '288.00', '296.26', '148.00', '375.00'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('v4 the bar splits what was owed into moved, cancelled in loops and netted between pairs, and the legend names each part', async () => {
    renderApp('/reports')
    const bar = await screen.findByRole('img', { name: /Bar to scale/ })
    expect(bar).toHaveAccessibleName('Bar to scale: 45.00 moved, 1,820.00 cancelled in loops, 698.38 netted between pairs, out of 2,563.38 owed')
    expect(bar.querySelectorAll('span')).toHaveLength(3)
    const legend = document.querySelector('.ep-legend') as HTMLElement
    expect(within(legend).getByText('Moved as mock USDT').closest('div')).toHaveTextContent('45.00 credit, 1.75% of what was owed. 2 members paid in, 1 was paid.')
    expect(within(legend).getByText('Cancelled in loops').closest('div')).toHaveTextContent('1,820.00 credit, 71% of what was owed.')
    expect(within(legend).getByText('Netted between pairs').closest('div')).toHaveTextContent('698.38 credit, 27.24% of what was owed.')
  })

  it('v4 "How the epoch ran" marks the step the epoch is in and says Not yet for the ones after it', async () => {
    renderApp('/reports')
    const steps = (await screen.findByRole('heading', { name: 'How the epoch ran' })).closest('section')!.querySelectorAll('li')
    expect([...steps].map((li) => li.querySelector('b')!.textContent)).toEqual(['Open', 'Cutoff', 'Clearing', 'Committed', 'Payment window', 'Finalized'])
    expect([...steps].map((li) => li.getAttribute('aria-current'))).toEqual([null, null, null, null, 'step', null])
    expect(steps[3]).toHaveTextContent('Nov 9, 2026, 11:30 AM UTC')
    expect(steps[4]).toHaveTextContent('Until Nov 9, 2026, 12:00 PM UTC')
    expect(steps[5]).toHaveTextContent('Not yet')
  })

  it('TC-FE-007-02 409 entry with stakeSlashed and haircut', async () => {
    const body = { ...report42, members: [{ account: 'scraper.x207-circle.near', status: 409, net: '-35000000', settlement: 'defaulted', amount: '35000000', stakeSlashed: '35000000', haircut: '0' }] }
    renderApp('/reports', withReport(body))
    expect(await screen.findByText('Default: stake slashed 35.00, haircut 0.00')).toBeInTheDocument()
    expect(within(memberRows()[0]).getByText('Defaulted')).toBeInTheDocument()
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
    expect(await screen.findByText('45.00 claimable after finalization')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /claim/i })).not.toBeInTheDocument()
  })

  it('v4 a finalized epoch says Finalized with code 200 and says whether anyone defaulted', async () => {
    const body = { ...report42, epoch: 41, phase: 'finalized', finalized: true, members: report42.members.map((m) => (m.account.startsWith('scraper') ? { ...m, status: 409, settlement: 'defaulted', stakeSlashed: '35000000' } : m)) }
    renderApp('/reports', withReport(body))
    expect(await screen.findByRole('heading', { name: 'Epoch 41 settlement statement' })).toBeInTheDocument()
    expect(fact('State')).toHaveTextContent('200Finalized')
    expect(screen.getByText('1 member defaulted, covered from stake')).toBeInTheDocument()
  })
})

describe('v4 the split of what was owed', () => {
  it('splitOf: moved is what the debtors pay in, loops is the cleared value, pairs is the rest and never below zero', async () => {
    const { splitOf } = await import('../lib/epochSplit')
    const members = [
      { account: 'a', status: 402, net: '-30000000', settlement: 'due', haircut: '0' },
      { account: 'b', status: 202, net: '+10000000', settlement: 'claimable', haircut: '0' },
      { account: 'c', status: 202, net: '+20000000', settlement: 'claimable', haircut: '0' },
      { account: 'd', status: 200, net: '0', settlement: null, haircut: '0' },
    ] as never
    expect(splitOf({ totalObligation: '100000000', cleared: '40000000', members })).toEqual({ owed: 100000000n, moved: 30000000n, loops: 40000000n, pairs: 30000000n, payers: 1, paid: 2 })
    expect(splitOf({ totalObligation: '50000000', cleared: '40000000', members }).pairs).toBe(0n)
    expect(splitOf({ totalObligation: '50000000', cleared: null, members }).loops).toBe(0n)
  })
})
