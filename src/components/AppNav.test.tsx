import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import css from '../styles.css?raw'
import { pages } from '../routes'
import { renderApp } from '../test/render'
import { DetailPanel, DetailSlot, DetailSlotProvider } from './detail'

describe('FE-054 app frame', () => {
  it('v6: the sidebar lists the circle pages and the account pages, each with its name and one plain line; the line is not part of the name', () => {
    renderApp('/stats?epoch=41')
    const nav = screen.getByRole('navigation', { name: 'Pages' })
    const results = within(nav).getByRole('link', { name: 'Clearing results' })
    expect(results).toHaveAttribute('href', '/stats?epoch=41')
    expect(results).toHaveTextContent('How an epoch cleared')
    expect(within(nav).getByRole('link', { name: 'Pay and claim' })).toHaveAttribute('href', '/settlement?epoch=41')
  })

  it('v6: the Members group lists the agents of the circle with a mascot and one line, and opens the page of an agent', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    const group = await screen.findByRole('group', { name: 'Members' })
    const gpu = await within(group).findByRole('link', { name: /^gpu/ })
    expect(gpu).toHaveAttribute('href', '/agents/gpu.x207-circle.near')
    expect(gpu.querySelector('svg.mascot')).not.toBeNull()
    await user.click(gpu)
    expect(await screen.findByRole('heading', { level: 1, name: 'gpu' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'About this agent' })).toBeInTheDocument()
  })

  it('All pages opens a dialog with every page; Escape closes it and gives the focus back; a link closes it and opens the page', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    const all = screen.getByRole('button', { name: 'All pages' })
    await user.click(all)
    const dialog = screen.getByRole('dialog', { name: 'All pages' })
    expect(within(dialog).getAllByRole('link')).toHaveLength(pages.length)
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(all).toHaveFocus()
    await user.click(all)
    await user.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Rent access' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Rent access' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('FE-092: "Send feedback" in All pages closes the sheet and opens the feedback panel with the focus in its field', async () => {
    const user = userEvent.setup()
    renderApp('/risk')
    await user.click(screen.getByRole('button', { name: 'All pages' }))
    await user.click(within(screen.getByRole('dialog', { name: 'All pages' })).getByRole('button', { name: 'Send feedback' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const panel = await screen.findByRole('form', { name: 'Send feedback' })
    expect(within(panel).getByRole('textbox')).toHaveFocus()
  })

  it('v6: under 840 px the menu button of the top bar opens the sidebar as a full-screen list, and a page change closes it', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    const toggle = screen.getByRole('button', { name: 'Open the list' })
    expect(document.querySelector('aside.rail')).not.toHaveAttribute('data-open')
    await user.click(toggle)
    expect(document.querySelector('aside.rail')).toHaveAttribute('data-open')
    expect(screen.getByRole('button', { name: 'Close the list' })).toHaveAttribute('aria-expanded', 'true')
    await user.click(within(screen.getByRole('navigation', { name: 'Pages' })).getByRole('link', { name: 'Risk' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Risk' })).toBeInTheDocument()
    expect(document.querySelector('aside.rail')).not.toHaveAttribute('data-open')
  })

  it('v6.4: the logo at the top of the sidebar leads to the landing page; the circle is named under it', async () => {
    renderApp('/stats?epoch=41')
    const rail = document.querySelector('aside.rail') as HTMLElement
    const brand = within(rail).getByRole('link', { name: 'x207, landing page' })
    expect(brand).toHaveAttribute('href', '/')
    expect(brand.querySelector('.brand-logo img')).toHaveAttribute('src', '/logo/logo-x207.webp')
    expect(brand.querySelector('img.brand-mark')).toHaveAttribute('src', '/logo/logo-x207.webp')
    expect(rail.querySelector('.brand > span')).toHaveTextContent('agents-main')
  })

  it('v4: the top bar names the network, signed in or out, next to the search and the wallet', async () => {
    renderApp('/stats')
    const bar = document.querySelector('.topbar') as HTMLElement
    const chip = await within(bar).findByText('NEAR testnet')
    expect(chip).toHaveAttribute('title', expect.stringContaining('mock tokens'))
    expect(within(bar).getByRole('button', { name: /Search pages/ })).toBeInTheDocument()
    expect(within(bar).getAllByRole('button', { name: 'Sign in with wallet' })).toHaveLength(1)
  })

  it('the sidebar is still one navigation named Pages with a labelled group per section', () => {
    renderApp('/stats')
    const nav = screen.getByRole('navigation', { name: 'Pages' })
    expect(within(nav).getAllByRole('group').map((g) => g.getAttribute('aria-labelledby'))).toEqual(['nav-Overview', 'nav-Members', 'nav-My-account'])
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
  it('the stylesheet switches the navigation at 840 and 1200 px: hidden under 840 (the list opens it), icon rail from 840, labels from 1200', () => {
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
    // FE-067: the rail floats as a glass card with a margin, so the first column is 5.25rem (rail 4.5rem + gutter) and the sidebar 15.5rem
    expect(rail).toMatch(/grid-template-columns: 5\.25rem/)
    const wide = block('(min-width: 1200px)')
    expect(wide).toMatch(/grid-template-columns: 15\.5rem/)
    expect(wide).toMatch(/\.nav-label \{ position: static;/)
  })
})
