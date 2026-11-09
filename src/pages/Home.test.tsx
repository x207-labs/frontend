import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { EpochItem, MemberResponse, SettlementItem } from '../api/types'
import { apiError, renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'
import { currentEpoch, homeActions } from '../lib/home'

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
    expect(await screen.findByText(/not a member of the circle yet/)).toBeInTheDocument()
    // FE-069: the sidebar now names the onboarding page "Join the circle" too, so the action link is looked up inside its own block.
    const actions = screen.getByRole('region', { name: 'Actions to take' })
    expect(within(actions).getByRole('link', { name: 'Join the circle' })).toHaveAttribute('href', expect.stringContaining('/onboarding'))
    expect(screen.getByRole('region', { name: 'Start here' })).toHaveTextContent('Register and stake')
  })
})
