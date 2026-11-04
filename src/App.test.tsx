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
    renderApp('/')
    const nav = screen.getByRole('navigation', { name: 'Pages' })
    expect(within(nav).getAllByRole('link')).toHaveLength(15)
    for (const { title } of pages) {
      await user.click(within(nav).getByRole('link', { name: title }))
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    }
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
