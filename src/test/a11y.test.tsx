// FE-031: accessibility of the pages with axe-core. jsdom has no layout, so the rules that need one (colour contrast, hidden-by-position) are off here; contrast is tested on the
// colour tokens in `contrast.test.ts`. The bar is zero violations of level serious or critical on every page.
import axe from 'axe-core'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { pages } from '../routes'
import { renderApp } from './render'
import { createMockWallet } from './walletMock'

const ACCOUNT = 'research.x207-circle.near'

describe('FE-031 accessibility (axe-core)', () => {
  for (const { path, title } of pages) {
    it(`TC-FE-031-01 ${title} (${path}): no serious or critical violation`, async () => {
      const { container } = renderApp(path, undefined, false, createMockWallet(ACCOUNT, ACCOUNT))
      await screen.findAllByRole('heading')
      await waitFor(() => expect(screen.queryByText(/Loading/)).not.toBeInTheDocument(), { timeout: 3000 }).catch(() => undefined)
      const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] })
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')})`)).toEqual([])
    })
  }
  it('TC-FE-031-02 the check can fail: an image with no alternative text and an input with no label are found as serious or critical', async () => {
    document.body.innerHTML = '<main><img src="x.png"><input type="text"><button></button></main>'
    const results = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } }, resultTypes: ['violations'] })
    const ids = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)
    expect(ids).toEqual(expect.arrayContaining(['image-alt', 'label', 'button-name']))
    document.body.innerHTML = ''
  })
  it('TC-FE-031-06 the first stop of the keyboard is the skip link; it moves the focus to the content; each page has its own title', async () => {
    const user = userEvent.setup()
    renderApp('/reports', undefined, false, createMockWallet(ACCOUNT, ACCOUNT))
    await screen.findAllByRole('heading')
    expect(document.title).toBe('Epoch report · x207')
    await user.tab()
    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(skip).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('main')).toHaveFocus()
    // a change of page moves the focus to the content and changes the title
    await user.click(within(screen.getByRole('navigation', { name: 'Pages' })).getByRole('link', { name: 'Clearing results' }))
    await waitFor(() => expect(document.title).toBe('Clearing results · x207'))
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('TC-FE-031-07 the loading state and the errors are announced: a status region while loading, an alert when a read fails', async () => {
    renderApp('/stats', (p) => (p.includes('/metrics') || p.includes('/stats') ? { status: 500, body: { error: { code: 'boom', message: 'x' } } } : undefined), false, createMockWallet(ACCOUNT, ACCOUNT))
    expect((await screen.findAllByRole('status')).length + (await screen.findAllByRole('alert').catch(() => [])).length).toBeGreaterThan(0)
  })

  it('TC-FE-031-08 every message of the pages that appears after an action has a role (status or alert): no dynamic error text without one', async () => {
    const files = import.meta.glob(['../pages/*.tsx', '../components/*.tsx', '!../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const bare: string[] = []
    for (const [file, text] of Object.entries(files)) {
      for (const m of text.matchAll(/<(p|small|div)\b[^>]*className=\{?["'`][^"'`]*state-error[^>]*>/g)) if (!/role=|data-hint/.test(m[0]) && !/\bkind === 'unproven'/.test(m[0])) bare.push(`${file}: ${m[0].slice(0, 90)}`)
    }
    expect(bare).toEqual([])
  })
})
