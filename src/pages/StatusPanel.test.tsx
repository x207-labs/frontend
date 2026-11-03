import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { members } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const SCRAPER = 'scraper.x207-circle.near'
const NEW = 'newagent.x207-circle.near'

const status = (container: HTMLElement) => container.querySelector('dl[aria-label="Onboarding status"]') as HTMLElement

describe('onboarding status panel', () => {
  it('TC-FE-005-01 member active: status, stake 50, limit 50, headroom 37.5', async () => {
    const { container } = renderApp('/onboarding', undefined, false, createMockWallet(SCRAPER, SCRAPER))
    await waitFor(() => expect(status(container)).toHaveTextContent('active'))
    expect(status(container)).toHaveTextContent('Stake50')
    expect(status(container)).toHaveTextContent('Credit limit50')
    expect(status(container)).toHaveTextContent('Headroom37.5')
  })

  it('TC-FE-005-02 pending becomes active without reload within one polling interval', async () => {
    let calls = 0
    const base = members.find((m) => m.account === SCRAPER)!
    const { container } = renderApp(
      '/onboarding',
      (p) =>
        p.endsWith(`/members/${SCRAPER}`)
          ? { status: 200, body: { circle: 'agents-main', unit: 'credit', decimals: 6, ...base, ...(calls++ < 1 ? { status: 'pending', stake: '0', limit: '0', headroom: '0' } : {}) } }
          : undefined,
      20,
      createMockWallet(SCRAPER, SCRAPER),
    )
    await waitFor(() => expect(status(container)).toHaveTextContent('pending'))
    await waitFor(() => expect(status(container)).toHaveTextContent('active'))
    expect(status(container)).toHaveTextContent('Stake50')
  })

  it('TC-FE-005-03 loading in status and the three numbers', async () => {
    const { container } = renderApp(
      '/onboarding',
      (p) => (p.endsWith(`/members/${SCRAPER}`) ? { ...apiError(503, 'x'), status: 200, body: members[0], delayMs: 80 } : undefined),
      false,
      createMockWallet(SCRAPER, SCRAPER),
    )
    await waitFor(() => expect(status(container).querySelectorAll('[role="status"]')).toHaveLength(4))
  })

  it('TC-FE-005-04 not registered: message with link to the onboarding form', async () => {
    renderApp('/onboarding', undefined, false, createMockWallet(NEW, NEW))
    expect(await screen.findByText(/is not registered yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Fill in the join form/ })).toHaveAttribute('href', '#join')
  })

  it('TC-FE-005-05 error 503 indexer_unavailable with try again button', async () => {
    renderApp(
      '/onboarding',
      (p) => (p.endsWith(`/members/${SCRAPER}`) ? apiError(503, 'indexer_unavailable') : undefined),
      false,
      createMockWallet(SCRAPER, SCRAPER),
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('indexer_unavailable')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('TC-FE-005-07 member suspended: limit 0 and headroom 0', async () => {
    const base = members.find((m) => m.account === SCRAPER)!
    const { container } = renderApp(
      '/onboarding',
      (p) =>
        p.endsWith(`/members/${SCRAPER}`)
          ? { status: 200, body: { circle: 'agents-main', unit: 'credit', decimals: 6, ...base, status: 'suspended', limit: '0', headroom: '0' } }
          : undefined,
      false,
      createMockWallet(SCRAPER, SCRAPER),
    )
    await waitFor(() => expect(status(container)).toHaveTextContent('suspended'))
    expect(status(container)).toHaveTextContent('Credit limit0')
    expect(status(container)).toHaveTextContent('Headroom0')
  })
})
