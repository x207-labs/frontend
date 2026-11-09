import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { epochs } from './api/fixtures'
import { pages } from './routes'
import { apiError, renderApp } from './test/render'

const EPOCHS_PATH = '/x207/circles/agents-main/epochs'

describe('dashboard shell', () => {
  it.each(pages)('$path opens $title', async ({ path, title }) => {
    renderApp(path)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })

  it('TC-FE-002-01 fifteen pages (F1-F4, governance, marketplace F9, access F8, invoices P8, orders P6, licenses P7, codes P3, transfers P4 and access rent P2) open from one navigation', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    const nav = screen.getByRole('navigation', { name: 'Pages' })
    expect(within(nav).getAllByRole('link')).toHaveLength(15)
    for (const { title } of pages) {
      await user.click(within(nav).getByRole('link', { name: title }))
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    }
  })

  it('FE-037 FE-044 "/" opens the landing page outside the dashboard layout, and "Page not found" is never in the document, not even for one frame', async () => {
    let seen = false
    const watch = new MutationObserver(() => {
      if (document.body.textContent?.includes('Page not found')) seen = true
    })
    watch.observe(document.body, { childList: true, subtree: true, characterData: true })
    const { calls } = renderApp('/')
    // The landing is a lazy chunk; its first import in a test run takes longer than the default second.
    expect(await screen.findByRole('heading', { level: 1 }, { timeout: 8000 })).toHaveTextContent('x207 lets many agents settle at once.')
    expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /dashboard/i })[0]).toHaveAttribute('href', '/stats')
    watch.disconnect()
    expect(seen).toBe(false)
    expect(calls()).toEqual([])
  })

  it.each(['/?circle=v014', '/?epoch=8'])('FE-044 an old dashboard link %s on "/" opens the stats page, not the landing', async (path) => {
    renderApp(path)
    expect(await screen.findByRole('heading', { level: 1, name: 'Clearing stats' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Pages' })).toBeInTheDocument()
  })

  it('FE-035 a path that no page owns shows a not-found page with a link, not a blank page', async () => {
    renderApp('/nope')
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByText('/nope')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the clearing stats' })).toHaveAttribute('href', '/stats')
  })

  it('TC-FE-002-02 the epoch picker is sorted descending and calls the selected {n}', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/stats')
    const select = await screen.findByRole('combobox', { name: 'Epoch' })
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['42', '41', '40'])
    await user.selectOptions(select, '41')
    await waitFor(() => expect(calls().some((c) => c.endsWith('/epochs/41/metrics'))).toBe(true))
  })

  it('the selected epoch follows the page change', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/stats')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Epoch' }), '40')
    await user.click(screen.getByRole('link', { name: '207 report' }))
    await waitFor(() => expect(calls().some((c) => c.endsWith('/epochs/40'))).toBe(true))
    expect(screen.getByRole('combobox', { name: 'Epoch' })).toHaveValue('40')
  })

  it('FE-040 the newest epoch past the deadline of its phase shows a notice with a link to the guide; an on-time one shows none', async () => {
    renderApp('/stats')
    await screen.findByRole('combobox', { name: 'Epoch' })
    expect(screen.queryByText(/is late/)).not.toBeInTheDocument()
  })

  it('FE-040 late epoch notice on the stats page', async () => {
    const stuck = [{ epoch: 43, phase: 'clearing', proposalDeadline: '2020-01-01T00:00:00Z' }, ...epochs]
    renderApp('/stats', (p) => (p.endsWith('/epochs') ? { status: 200, body: { items: stuck } } : undefined))
    const notice = await screen.findByText(/Epoch 43 is late/)
    expect(notice).toHaveTextContent('moved by a keeper the team runs until 2026-11-18; if one is late, anyone can move it')
    expect(notice).not.toHaveTextContent('manual')
    expect(within(notice.closest('p')!).getByRole('link', { name: 'How to move it' })).toHaveAttribute('href', expect.stringContaining('join-the-circle.md#move-the-epoch-yourself'))
  })

  it('TC-FE-002-03 loading in the epoch picker', () => {
    renderApp('/stats', (p) =>
      p.endsWith('/epochs') ? { status: 200, body: { items: epochs }, delayMs: 2000 } : undefined,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading epoch')
  })

  it('TC-FE-002-04 the error names the code and try again works', async () => {
    const user = userEvent.setup()
    let down = true
    renderApp('/onboarding', (p) =>
      p.endsWith('/epochs') && down ? apiError(503, 'indexer_unavailable', 'Indexer not ready') : undefined,
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('indexer_unavailable')
    down = false
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('combobox', { name: 'Epoch' })).toBeInTheDocument()
  })

  it('TC-FE-002-05 empty: no per-epoch endpoint is called', async () => {
    const { calls } = renderApp('/stats', (p) =>
      p === EPOCHS_PATH ? { status: 200, body: { items: [], nextCursor: null } } : undefined,
    )
    expect(await screen.findByText('No epoch in this circle yet.')).toBeInTheDocument()
    expect(calls().filter((c) => /\/epochs\/\d+/.test(c))).toEqual([])
  })
})
