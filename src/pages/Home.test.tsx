import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { EpochItem, MemberResponse, SettlementItem } from '../api/types'
import { apiError, renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'
import { currentEpoch, epochLengthText, epochOutcome, formatCredit2, homeActions, memberTotals, voucherEpoch } from '../lib/home'
import { resetCache, writeCache } from '../account/cache'
import { displayAccount } from '../lib/account'

const SCRAPER = 'scraper.x207-circle.near'
const settlement = (status: string, extra: object = {}): SettlementItem =>
  ({ epoch: 42, phase: 'payment_window', role: 'debtor', net: '-35000000', amount: '35000000', status, due: '2026-11-09T12:00:00Z', ...extra }) as SettlementItem
const member = (status = 'active'): MemberResponse =>
  ({ account: SCRAPER, status, stake: '50000000', limit: '100000000', outstandingDebt: '35000000', headroom: '65000000' }) as MemberResponse
const epoch = (n: number, phase: string): EpochItem => ({ epoch: n, phase, proposalDeadline: null }) as EpochItem
const reply = (path: string, items: unknown[]) => (p: string) => (p.includes(path) ? { status: 200, body: { unit: 'credit', decimals: 6, items, nextCursor: null } } : undefined)

describe('FE-056 home: what to do', () => {
  it('the live epoch is the newest one not finalized, else the newest', () => {
    expect(currentEpoch([epoch(41, 'finalized'), epoch(43, 'open'), epoch(42, 'payment_window')])?.epoch).toBe(43)
    expect(currentEpoch([epoch(40, 'finalized'), epoch(41, 'finalized')])?.epoch).toBe(41)
    expect(currentEpoch([])).toBeNull()
  })

  it('an unknown account is sent to onboarding', () => {
    expect(homeActions(null, [])).toMatchObject([{ to: '/onboarding', cta: 'Join the circle' }])
  })

  it('a due payment is urgent and names the amount and the deadline; a defaulted one is urgent too', () => {
    const [due] = homeActions(member(), [settlement('due')])
    expect(due).toMatchObject({ tone: 'urgent', to: '/settlement', cta: 'Pay residual' })
    expect(due.text).toContain('pay 35 credit')
    expect(due.text).toContain('Nov 9, 2026')
    expect(homeActions(member(), [settlement('defaulted')])[0]).toMatchObject({ tone: 'urgent', cta: 'See the settlement' })
  })

  it('a claimable balance says Claim when it can be claimed now, and waits otherwise', () => {
    expect(homeActions(member(), [settlement('claimable', { role: 'creditor', amount: '9000000', claimableNow: true })])[0]).toMatchObject({ cta: 'Claim' })
    expect(homeActions(member(), [settlement('claimable', { amount: '9000000', claimableNow: false })])[0].text).toContain('once the epoch is finalized')
  })

  it('suspended and pending members are told; a member with nothing to do is told so', () => {
    expect(homeActions(member('suspended'), [])[0]).toMatchObject({ tone: 'urgent', to: '/risk' })
    expect(homeActions(member('pending'), [])[0]).toMatchObject({ to: '/onboarding' })
    expect(homeActions(member(), [settlement('paid'), settlement('claimed')])).toMatchObject([{ tone: 'info', text: expect.stringContaining('Nothing to do') }])
  })
})

describe('FE-056 home page', () => {
  it('without a wallet it asks for a sign-in and reads no account data', async () => {
    const { calls } = renderApp('/app', undefined, false)
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Home: sign in' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Sign in with wallet' }).length).toBeGreaterThan(0)
    expect(calls().filter((p) => p.includes('/members/'))).toEqual([])
  })

  it('with a wallet it shows the limits, the position, the deadline and the actions', async () => {
    renderApp('/app', reply('/settlements', [settlement('due')]), false, createMockWallet(SCRAPER, SCRAPER))
    const actions = await screen.findByRole('region', { name: 'Actions to take' })
    expect(await within(actions).findByText(/pay 35 credit/)).toBeInTheDocument()
    const numbers = screen.getByRole('region', { name: 'Your account' })
    expect(numbers).toHaveTextContent('Credit limit')
    expect(numbers).toHaveTextContent('Remaining limit')
    // FE-069: the hero card says how much of the limit is used, and leads to the two main tasks
    expect(numbers).toHaveTextContent(/\d+% used/)
    expect(within(numbers).getByRole('link', { name: 'Pay and claim' })).toHaveAttribute('href', expect.stringContaining('/settlement'))
    const epochBlock = screen.getByRole('region', { name: 'This epoch' })
    expect(epochBlock).toHaveTextContent('Payment deadline')
    expect(epochBlock).toHaveTextContent('Nov 9, 2026')
  })

  it('TC-FE-063-01 Home names one epoch, the live one (42), and has no epoch picker that points at another (41)', async () => {
    renderApp('/app', reply('/settlements', [settlement('due')]), false, createMockWallet(SCRAPER, SCRAPER))
    const actions = await screen.findByRole('region', { name: 'Actions to take' })
    expect(await within(actions).findByText(/Epoch 42: pay 35 credit/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'This epoch' })).toHaveTextContent('Position in epoch 42')
    expect(screen.queryByRole('combobox', { name: 'Epoch' })).toBeNull()
  })

  it('TC-FE-063-02 pages that read one epoch keep the picker; the pages that do not have none', async () => {
    const withPicker = renderApp('/stats')
    expect(await screen.findByRole('combobox', { name: 'Epoch' })).toBeInTheDocument()
    withPicker.unmount()
    renderApp('/marketplace')
    expect(await screen.findByRole('heading', { level: 1, name: 'Marketplace' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Epoch' })).toBeNull()
  })

  it('an account the read API does not know is offered onboarding, not an error', async () => {
    renderApp('/app', (p) => (p.includes('/members/new.testnet') && !p.includes('settlements') ? apiError(404, 'not_found', 'no such member') : undefined), false, createMockWallet('new.testnet', 'new.testnet'))
    expect(await screen.findByRole('region', { name: 'Start here' })).toHaveTextContent('Register and stake')
    // FE-073: Start here already carries the join step, so the actions card with the same "Join the circle" link is left out.
    expect(screen.queryByRole('region', { name: 'Actions to take' })).toBeNull()
  })

  it('TC-FE-074-01 main carries the page group, so the CSS can centre the Marketplace pages', async () => {
    renderApp('/marketplace')
    expect(await screen.findByRole('heading', { level: 1, name: 'Marketplace' })).toBeInTheDocument()
    expect(document.querySelector('main')).toHaveAttribute('data-group', 'Marketplace')
  })

  it('TC-FE-073-01 a 64-hex implicit account is greeted by its saved name and shown short, never in full', async () => {
    const implicit = 'e'.repeat(60) + '1234'
    writeCache(implicit, { displayName: 'Shenhan' })
    try {
      renderApp('/app', (p) => (p.includes(`/members/${implicit}`) && !p.includes('settlements') ? apiError(404, 'not_found', 'no such member') : undefined), false, createMockWallet(implicit, implicit))
      // the guest view shows first while the wallet restores the session, so wait for the signed-in note
      expect(await screen.findByText(`Signed in as ${displayAccount(implicit)}.`)).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Start here' })).not.toHaveTextContent(implicit)
      expect(screen.getByText('Shenhan', { selector: '.greet strong' })).toBeInTheDocument()
      expect(document.querySelector('.account-trigger .avatar')).toHaveTextContent('S')
    } finally {
      resetCache()
    }
  })
})

// v4: Home leads with a statement about the latest epoch that carried vouchers, then the facts, four cards, the three figures and the table of epochs.
const METRICS_OF = /\/epochs\/(\d+)\/metrics$/
const noVouchers = (p: string) => {
  const m = METRICS_OF.exec(p)
  return m
    ? { status: 200, body: { circle: 'agents-main', epoch: Number(m[1]), phase: 'finalized', unit: 'credit', decimals: 6, totalVoucherValue: '0', cleared: null, clearedRatio: null, voucherCount: 0, residualTransfers: null, transferSavings: null, debtBefore: null, debtAfter: null, debtReduction: null, netDebt: null, defaultRate: null, clearingTimeSeconds: null, graph: { participants: 0, edges: 0, density: 0 } } }
    : undefined
}
const glowing = () => [...document.querySelectorAll('[data-variant="glow"]')].map((e) => e.textContent)

describe('v4 home: helpers', () => {
  it('formatCredit2 gives two decimals with separators, rounds half up and survives bad input', () => {
    expect(formatCredit2('2563380000')).toBe('2,563.38')
    expect(formatCredit2('45000000')).toBe('45.00')
    expect(formatCredit2('1234')).toBe('0.00')
    expect(formatCredit2('5000')).toBe('0.01')
    expect(formatCredit2('-35000000')).toBe('-35.00')
    expect(formatCredit2(null)).toBe('-')
    expect(formatCredit2('abc')).toBe('-')
  })

  it('epochLengthText says seconds, minutes or hours', () => {
    expect([3600, 7200, 600, 60, 90, 0].map(epochLengthText)).toEqual(['1 hour', '2 hours', '10 minutes', '1 minute', '90 seconds', 'not available'])
  })

  it('voucherEpoch reads owed, cancelled and moved (netDebt) from the metrics, and the moved share to one decimal', () => {
    const v = voucherEpoch({ circle: 'c', epoch: 8, phase: 'finalized', unit: 'credit', decimals: 6, totalVoucherValue: '41350000', cleared: '21800000', clearedRatio: 0.527, voucherCount: 24, residualTransfers: 5, transferSavings: 4.8, debtBefore: '41350000', debtAfter: '19550000', debtReduction: 0.527, netDebt: '7750000', defaultRate: 0.1, clearingTimeSeconds: 60, graph: { participants: 15, edges: 24, density: 0.1 } })
    expect(v).toMatchObject({ epoch: 8, vouchers: 24, participants: 15, owed: '41350000', cancelled: '21800000', moved: '7750000', movedPercent: 18.7 })
    expect(epochOutcome(v)).toEqual({ code: 409, label: 'Default, covered from stake' })
    expect(epochOutcome({ ...v, defaultRate: 0 })).toEqual({ code: 200, label: 'Settled' })
    expect(epochOutcome({ ...v, phase: 'payment_window' })).toMatchObject({ code: 402 })
    expect(epochOutcome({ ...v, phase: 'clearing' })).toBeNull()
  })

  it('memberTotals counts members by standing and sums the stake', () => {
    const m = (status: string, stake: string) => ({ status, stake }) as never
    expect(memberTotals([m('active', '50000000'), m('active', '25500000'), m('suspended', '10000000')])).toEqual({ total: 3, active: 2, suspended: 1, staked: '85500000' })
  })
})

describe('v4 home: the statement page', () => {
  it('leads with the latest epoch that has vouchers: eyebrow, then the sentence with its real numbers and units', async () => {
    renderApp('/app', undefined, false)
    const sentence = await screen.findByText(/In epoch/, { selector: '.home-statement' })
    expect(sentence).toHaveTextContent('In epoch 42, 2,563.38 credit is owed and 45 mock USDT is due to move.')
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('agents-main · epoch 42 · payment window')
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
    expect(document.querySelector('.home-sub')).toHaveTextContent('512 vouchers among 6 members. Credit is settled in mock USDT on NEAR testnet; no real funds move.')
  })

  it('shows the facts of the circle, four cards and the three figures of the epoch', async () => {
    renderApp('/app', undefined, false)
    const facts = await screen.findByLabelText('This circle')
    expect(facts).toHaveTextContent('Contract')
    expect(facts).toHaveTextContent('x207:agents-main')
    await within(facts).findByText('1 hour')
    expect(facts).toHaveTextContent('Live epoch')
    const cards = screen.getByRole('region', { name: 'Circle in numbers' })
    await within(cards).findByText('512')
    expect(cards).toHaveTextContent('Members')
    expect(cards).toHaveTextContent('6 active, 0 suspended')
    expect(cards).toHaveTextContent('71%')
    expect(cards).toHaveTextContent('45.00mock USDT')
    const figures = await screen.findByRole('region', { name: 'Epoch 42 in three figures' })
    expect(figures).toHaveTextContent('Owed between members2,563.38credit, 512 vouchers')
    expect(figures).toHaveTextContent('Cancelled in loops1,820.00credit, 71% of owed')
    expect(figures).toHaveTextContent('Moved as mock USDT45.00')
  })

  it('lists the epochs with vouchers, newest first, with units in the header and an outcome by code and word', async () => {
    renderApp('/app', undefined, false)
    const table = await screen.findByRole('table', { name: 'Epochs with vouchers' })
    expect(await within(table).findByRole('link', { name: 'Epoch 42 statement' })).toHaveAttribute('href', '/reports?epoch=42')
    expect(within(table).getAllByRole('rowheader').map((c) => c.textContent)).toEqual(['42', '41', '40'])
    expect(within(table).getByRole('columnheader', { name: /Owed\s*credit/ })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /Moved\s*mock USDT/ })).toBeInTheDocument()
    const rows = within(table).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('2,563.38')
    expect(rows[1]).toHaveTextContent('402Payment window open')
    expect(rows[2]).toHaveTextContent('200Settled')
    expect(rows[3]).toHaveTextContent('409Default, covered from stake')
  })

  it('says so when none of the newest epochs carried vouchers, and shows no figures', async () => {
    renderApp('/app', noVouchers, false)
    expect(await screen.findByText((_, el) => el?.classList.contains('home-statement') === true && el.textContent === 'None of the newest 3 epochs carried vouchers.')).toBeInTheDocument()
    const section = screen.getByRole('region', { name: 'Epochs with vouchers' })
    expect(await within(section).findByText(/Nobody has posted vouchers/)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Epochs with vouchers' })).toBeNull()
    expect(screen.queryByRole('region', { name: /in three figures/ })).toBeNull()
  })

  it('says so, with a retry, when the epochs cannot be read', async () => {
    renderApp('/app', (p) => (p.endsWith('/epochs') ? apiError(500, 'internal_error', 'The read API failed.') : undefined), false)
    expect(await screen.findByText(/could not be read from the read API/)).toBeInTheDocument()
    const section = screen.getByRole('region', { name: 'Epochs with vouchers' })
    expect(await within(section).findByRole('alert')).toHaveTextContent('internal_error')
    expect(within(section).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('one glowing button: the sign-in of the top bar while signed out, and it is not repeated on the page', async () => {
    renderApp('/app', undefined, false)
    await screen.findByRole('table', { name: 'Epochs with vouchers' })
    expect(glowing()).toEqual(['Sign in with wallet'])
    // the page's own sign-in and its other actions are quiet
    expect(screen.getAllByRole('button', { name: 'Sign in with wallet' }).filter((b) => b.getAttribute('data-variant') === 'quiet').length).toBeGreaterThan(0)
  })

  it('one glowing button when signed in: the payment that is due takes it, the statement link goes quiet', async () => {
    renderApp('/app', reply('/settlements', [settlement('due')]), false, createMockWallet(SCRAPER, SCRAPER))
    await screen.findByRole('region', { name: 'Actions to take' })
    expect(glowing()).toEqual(['Pay what is due'])
    expect(screen.getByRole('link', { name: 'Read the epoch 42 statement' })).toHaveAttribute('data-variant', 'quiet')
  })

  it('signed in with nothing due, the statement link is the glowing one; an account outside the circle gets Join the circle', async () => {
    const view = renderApp('/app', reply('/settlements', []), false, createMockWallet(SCRAPER, SCRAPER))
    await screen.findByRole('region', { name: 'Actions to take' })
    expect(glowing()).toEqual(['Read the epoch 42 statement'])
    view.unmount()
    renderApp('/app', (p) => (p.includes('/members/new.testnet') && !p.includes('settlements') ? apiError(404, 'not_found', 'no such member') : undefined), false, createMockWallet('new.testnet', 'new.testnet'))
    // the guest view shows first while the wallet restores the session, so wait for the signed-in note
    await screen.findByText('Signed in as new.testnet.')
    expect(glowing()).toEqual(['Join the circle'])
  })

  it('a due payment in Actions to take carries the 402 code and word', async () => {
    renderApp('/app', reply('/settlements', [settlement('due')]), false, createMockWallet(SCRAPER, SCRAPER))
    const actions = await screen.findByRole('region', { name: 'Actions to take' })
    expect(await within(actions).findByText('402')).toBeInTheDocument()
    expect(actions).toHaveTextContent('Due')
  })
})
