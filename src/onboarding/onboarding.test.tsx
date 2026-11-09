import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'
import { readProgress } from './progress'
import { computeSteps, type MemberState } from './steps'
import { FAUCET_URL, MOCK_USDT_ID } from './OnboardingSteps'

const ACCOUNT = 'newagent.x207-circle.near'
const none: MemberState = { kind: 'none' }
const staked = (extra: Partial<{ outstandingDebt: string; settledHistory: string }> = {}): MemberState => ({
  kind: 'member',
  member: { stake: '50000000', outstandingDebt: '0', settledHistory: '0', ...extra },
})
const fresh = { funds: false, payment: false }
const status = (input: Parameters<typeof computeSteps>[0]) => computeSteps(input).map((s) => `${s.id}:${s.status}`)

beforeEach(() => localStorage.clear())

describe('TC-FE-060-01 which step is current, from the chain state and the saved answers', () => {
  it('signed in, not a member: funds is current', () => {
    expect(status({ account: ACCOUNT, member: none, acknowledged: fresh })).toEqual(['login:done', 'funds:current', 'join:upcoming', 'payment:upcoming'])
  })
  it('funds ticked: join is current', () => {
    expect(status({ account: ACCOUNT, member: none, acknowledged: { funds: true, payment: false } })).toEqual(['login:done', 'funds:done', 'join:current', 'payment:upcoming'])
  })
  it('a staked member skips funds and join even with nothing ticked (the chain is the proof)', () => {
    expect(status({ account: ACCOUNT, member: staked(), acknowledged: fresh })).toEqual(['login:done', 'funds:done', 'join:done', 'payment:current'])
  })
  it('a member with zero stake is registered but join stays open', () => {
    const steps = computeSteps({ account: ACCOUNT, member: { kind: 'member', member: { stake: '0', outstandingDebt: '0', settledHistory: '0' } }, acknowledged: fresh })
    expect(steps.find((s) => s.id === 'join')).toMatchObject({ status: 'current', note: 'Registered. Add stake to get a credit limit.' })
  })
  it('debt or settled history means a payment already happened; all done', () => {
    expect(status({ account: ACCOUNT, member: staked({ outstandingDebt: '1' }), acknowledged: fresh }).every((s) => s.endsWith(':done'))).toBe(true)
    expect(status({ account: ACCOUNT, member: staked({ settledHistory: '5' }), acknowledged: fresh }).every((s) => s.endsWith(':done'))).toBe(true)
  })
  it('no account: login is current; a malformed amount counts as zero instead of throwing', () => {
    expect(status({ account: null, member: { kind: 'loading' }, acknowledged: fresh })[0]).toBe('login:current')
    const bad: MemberState = { kind: 'member', member: { stake: 'abc', outstandingDebt: '', settledHistory: '1.5' } }
    expect(status({ account: ACCOUNT, member: bad, acknowledged: fresh })).toEqual(['login:done', 'funds:done', 'join:current', 'payment:upcoming'])
  })
})

const open = async (account = ACCOUNT) => {
  const view = renderApp('/onboarding', undefined, false, createMockWallet(account, account))
  await screen.findByText(/members registered/)
  return { ...view, user: userEvent.setup() }
}
const step = (id: string) => screen.getByTestId(`step-${id}`)

describe('TC-FE-060-02 the wizard on the Onboarding page', () => {
  it('a new account sees four steps, funds as current, the faucet link and the mint command for its own account', async () => {
    await open()
    expect(document.querySelectorAll('li.onboarding-step')).toHaveLength(4)
    expect(await within(step('funds')).findByText('Current step')).toBeInTheDocument()
    expect(within(step('funds')).getByRole('link', { name: 'testnet faucet' })).toHaveAttribute('href', FAUCET_URL)
    const command = within(step('funds')).getByText(/near call/)
    expect(command).toHaveTextContent(MOCK_USDT_ID)
    expect(command).toHaveTextContent(`"account_id":"${ACCOUNT}"`)
    expect(step('login')).toHaveAttribute('data-status', 'done')
    // the join form is still the third step
    expect(within(step('join')).getByLabelText(/pubkey_voucher/)).toBeInTheDocument()
  })

  it('"I have the funds" moves the current step to join, is saved for the account, and survives a reload', async () => {
    const { user, unmount } = await open()
    await user.click(within(step('funds')).getByRole('button', { name: 'I have the funds' }))
    expect(step('funds')).toHaveAttribute('data-status', 'done')
    expect(step('join')).toHaveAttribute('data-status', 'current')
    expect(readProgress(ACCOUNT)).toEqual({ funds: true, payment: false })
    expect(readProgress('someone.else.near')).toEqual(fresh)
    unmount()
    cleanup()
    await open()
    expect(step('funds')).toHaveAttribute('data-status', 'done')
    expect(step('join')).toHaveAttribute('data-status', 'current')
  })

  it('a member who is already staked starts at the last step, read from the read API', async () => {
    const account = 'scraper.x207-circle.near'
    await open(account)
    // fixtures: stake 50 USDT, debt and settled history above zero
    expect(await screen.findByText('Registered and staked.')).toBeInTheDocument()
    expect(step('funds')).toHaveAttribute('data-status', 'done')
    expect(step('join')).toHaveAttribute('data-status', 'done')
    expect(step('payment')).toHaveAttribute('data-status', 'done')
    expect(screen.getByText(/All four steps are done/)).toBeInTheDocument()
  })

  it('the payment step links the marketplace and its answer is saved', async () => {
    const { user } = await open()
    expect(within(step('payment')).getByRole('link', { name: 'marketplace' })).toHaveAttribute('href', '/marketplace')
    await user.click(within(step('payment')).getByRole('button', { name: 'I made a payment' }))
    expect(readProgress(ACCOUNT).payment).toBe(true)
  })

  it('broken storage does not break the page', async () => {
    localStorage.setItem('x207.onboarding.progress', '{not json')
    await open()
    expect(step('funds')).toHaveAttribute('data-status', 'current')
  })
})
