import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import css from '../styles.css?raw'
import { pages } from '../routes'
import { renderApp } from '../test/render'
import { DetailPanel, DetailSlot, DetailSlotProvider } from './detail'

describe('FE-054 app frame', () => {
  it('the tab bar has one tab per group and More; the tab of the current group is marked', async () => {
    renderApp('/marketplace')
    const bar = screen.getByRole('navigation', { name: 'Main' })
    expect(within(bar).getAllByRole('link').map((a) => a.textContent)).toEqual(['Overview', 'Account', 'Market', 'Govern'])
    expect(within(bar).getByRole('button', { name: 'More' })).toBeInTheDocument()
    expect(within(bar).getByRole('link', { name: 'Market' })).toHaveAttribute('aria-current', 'page')
    expect(within(bar).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
  })

  it('a tab opens the first page of its group and keeps the query (the epoch and circle)', async () => {
    const user = userEvent.setup()
    renderApp('/stats?epoch=41')
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Market' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Marketplace' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Market' })).toHaveAttribute('href', '/marketplace?epoch=41')
  })

  it('More opens a dialog with every page; Escape closes it and gives the focus back; a link closes it and opens the page', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    const more = within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'More' })
    await user.click(more)
    const dialog = screen.getByRole('dialog', { name: 'All pages' })
    expect(within(dialog).getAllByRole('link')).toHaveLength(pages.length)
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(more).toHaveFocus()
    await user.click(more)
    await user.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Access rent' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Access rent' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('the sidebar is still one navigation named Pages with a labelled group per section', () => {
    renderApp('/stats')
    const nav = screen.getByRole('navigation', { name: 'Pages' })
    expect(within(nav).getAllByRole('group').map((g) => g.getAttribute('aria-labelledby'))).toEqual(['nav-Overview', 'nav-My-account', 'nav-Marketplace', 'nav-Governance'])
  })

  it('the detail slot shows what a page puts in it and stays empty (hidden by CSS) when nothing is', () => {
    const { rerender } = render(
      <DetailSlotProvider>
        <DetailSlot />
      </DetailSlotProvider>,
    )
    const slot = screen.getByRole('complementary', { name: 'Details' })
    expect(slot).toBeEmptyDOMElement()
    rerender(
      <DetailSlotProvider>
        <DetailSlot />
        <DetailPanel>
          <p>Selected row</p>
        </DetailPanel>
      </DetailSlotProvider>,
    )
    expect(within(screen.getByRole('complementary', { name: 'Details' })).getByText('Selected row')).toBeInTheDocument()
  })

  // jsdom runs no media queries, so the breakpoints are read from the stylesheet.
  it('the stylesheet switches the navigation at 840 and 1200 px: tab bar under 840, icon rail from 840, labels from 1200', () => {
    const block = (query: string) => {
      const start = css.indexOf(`@media ${query} {`)
      expect(start, query).toBeGreaterThan(-1)
      let depth = 0
      for (let i = css.indexOf('{', start); i < css.length; i++) {
        if (css[i] === '{') depth++
        if (css[i] === '}' && --depth === 0) return css.slice(start, i)
      }
      throw new Error('unclosed block')
    }
    expect(css).toMatch(/\.rail \{ display: none;/)
    expect(css).toMatch(/\.tabbar \{ position: fixed;/)
    const rail = block('(min-width: 840px)')
    expect(rail).toMatch(/\.rail \{ display: block; \}/)
    expect(rail).toMatch(/\.tabbar \{ display: none; \}/)
    expect(rail).toMatch(/grid-template-columns: 4\.5rem/)
    const wide = block('(min-width: 1200px)')
    expect(wide).toMatch(/grid-template-columns: 15rem/)
    expect(wide).toMatch(/\.nav-label \{ position: static;/)
  })
})
