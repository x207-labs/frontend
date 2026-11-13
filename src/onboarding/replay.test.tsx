// FE-122: the onboarding and the tour can be walked again on request; the reset touches only the onboarding answers of the account.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'
import { saveProgress, TOUR_EVENT, TOUR_PROGRESS_KEY, TOUR_PROMPT_KEY } from '../tour/state'
import { forgetProgress, readProgress, writeProgress } from './progress'
import { wantsOnboarding, withoutOnboardingParam } from './replay'

const ACCOUNT = 'newagent.x207-circle.near'
const OTHER = 'someone.else.near'
// every other key the dashboard keeps (wallet, account cache, tour) plus one it does not know
const OTHERS: Record<string, string> = {
  'x207.wallet.connected': '1',
  'x207.account.cache': '{"displayName":"Ana"}',
  [TOUR_PROGRESS_KEY]: '{"step":4,"done":false}',
  [TOUR_PROMPT_KEY]: '1',
  'unrelated.key': 'kept',
}

function seed() {
  for (const [k, v] of Object.entries(OTHERS)) localStorage.setItem(k, v)
  writeProgress(ACCOUNT, { funds: true, payment: true })
  writeProgress(OTHER, { funds: true, payment: false })
}
function expectOthersKept() {
  for (const [k, v] of Object.entries(OTHERS)) expect(localStorage.getItem(k), k).toBe(v)
  expect(readProgress(OTHER)).toEqual({ funds: true, payment: false })
}
const step = (id: string) => screen.getByTestId(`step-${id}`)

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => vi.restoreAllMocks())

describe('FE-122 replay the onboarding', () => {
  it('forgetProgress drops only the answers of that account; every other key stays', () => {
    seed()
    forgetProgress(ACCOUNT)
    expect(readProgress(ACCOUNT)).toEqual({ funds: false, payment: false })
    expectOthersKept()
  })

  it('forgetProgress keeps working when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => forgetProgress(ACCOUNT)).not.toThrow()
  })

  it('reads the deep link and keeps the other parameters', () => {
    expect(wantsOnboarding('?onboarding=1')).toBe(true)
    expect(wantsOnboarding('?circle=v018&onboarding=1')).toBe(true)
    expect(wantsOnboarding('?onboarding=0')).toBe(false)
    expect(wantsOnboarding('')).toBe(false)
    expect(withoutOnboardingParam('?circle=v018&onboarding=1')).toBe('?circle=v018')
    expect(withoutOnboardingParam('?onboarding=1')).toBe('')
  })

  it('"Replay onboarding" in Settings resets the answers, opens step 1 and the onboarding shows again, other keys intact', async () => {
    seed()
    renderApp('/settings', undefined, false, createMockWallet(ACCOUNT, ACCOUNT))
    const user = userEvent.setup()
    const group = (await screen.findByRole('heading', { name: 'Onboarding and tour' })).closest('section')!
    await user.click(within(group as HTMLElement).getByRole('button', { name: 'Replay onboarding' }))
    expect(await screen.findByTestId('onboarding-replayed')).toHaveTextContent('Onboarding restarted at step 1.')
    // the funds answer was forgotten, so funds is the current step again (the account is not a member in the fixtures)
    await waitFor(() => expect(step('funds')).toHaveAttribute('data-status', 'current'))
    expect(step('login').querySelector('details')).toHaveAttribute('open')
    await waitFor(() => expect(document.activeElement).toBe(step('login').querySelector('summary')))
    expect(readProgress(ACCOUNT)).toEqual({ funds: false, payment: false })
    expectOthersKept()
  })

  it('?onboarding=1 on a dashboard page does the same', async () => {
    seed()
    renderApp('/app?onboarding=1', undefined, false, createMockWallet(ACCOUNT, ACCOUNT))
    expect(await screen.findByTestId('onboarding-replayed')).toBeInTheDocument()
    await waitFor(() => expect(step('funds')).toHaveAttribute('data-status', 'current'))
    expect(readProgress(ACCOUNT)).toEqual({ funds: false, payment: false })
    expectOthersKept()
  })

  it('without the replay mark the saved answers stay (a plain visit does not reset)', async () => {
    seed()
    renderApp('/onboarding', undefined, false, createMockWallet(ACCOUNT, ACCOUNT))
    await screen.findByText(/members registered/)
    expect(screen.queryByTestId('onboarding-replayed')).toBeNull()
    expect(readProgress(ACCOUNT)).toEqual({ funds: true, payment: true })
  })
})

describe('FE-122 the guide buttons', () => {
  it('Help shows them without a wallet; the tour restarts at step 1 or resumes at the saved step', async () => {
    saveProgress({ step: 4, done: false })
    const seen: unknown[] = []
    const on = (e: Event) => seen.push((e as CustomEvent).detail)
    window.addEventListener(TOUR_EVENT, on)
    renderApp('/help')
    const user = userEvent.setup()
    const section = (await screen.findByRole('heading', { name: 'See the guides again' })).closest('section') as HTMLElement
    expect(within(section).getByRole('button', { name: 'Replay onboarding' })).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: 'Restart the product tour' }))
    await user.click(within(section).getByRole('button', { name: 'Resume the tour at step 5' }))
    window.removeEventListener(TOUR_EVENT, on)
    expect(seen).toEqual([{ restart: true }, { restart: false }])
  })

  it('no resume button when no step is saved', async () => {
    renderApp('/help')
    await screen.findByRole('heading', { name: 'See the guides again' })
    expect(screen.queryByRole('button', { name: /Resume the tour/ })).toBeNull()
  })

  it('the All pages sheet has a Guides group that closes the sheet and opens the tour', async () => {
    const seen: unknown[] = []
    const on = (e: Event) => seen.push((e as CustomEvent).detail)
    window.addEventListener(TOUR_EVENT, on)
    renderApp('/app')
    const user = userEvent.setup()
    await user.click((await screen.findAllByRole('button', { name: 'All pages' }))[0])
    const guides = within(screen.getByRole('dialog', { name: 'All pages' })).getByRole('group', { name: 'Guides' })
    expect(within(guides).getByRole('button', { name: 'Replay onboarding' })).toBeInTheDocument()
    await user.click(within(guides).getByRole('button', { name: 'Restart the product tour' }))
    window.removeEventListener(TOUR_EVENT, on)
    expect(screen.queryByRole('dialog', { name: 'All pages' })).toBeNull()
    expect(seen).toEqual([{ restart: true }])
  })
})
