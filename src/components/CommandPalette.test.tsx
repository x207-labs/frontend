import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { matchPages } from '../lib/palette'
import { pages } from '../routes'
import { renderApp } from '../test/render'

// The epoch picker is a combobox too, so everything here is scoped to the palette.
const pageBox = () => screen.getByRole('combobox', { name: 'Page name' })
const pageOptions = () => {
  const list = screen.queryByRole('listbox', { name: 'Pages' })
  return list ? within(list).queryAllByRole('option') : []
}

describe('FE-057 command palette', () => {
  it('matches every word in the title, the group or the path, and ranks titles that start with the word first', () => {
    expect(matchPages('')).toHaveLength(pages.length)
    expect(matchPages('settlement').map((p) => p.path)).toEqual(['/settlement'])
    expect(matchPages('market')[0].path).toBe('/marketplace')
    expect(matchPages('my account').map((p) => p.path)).toEqual(['/onboarding', '/settlement', '/settings'])
    expect(matchPages('zzz')).toEqual([])
  })

  it('Ctrl-K opens it with the focus in the search, Escape closes it and the focus returns to the button', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    const button = await screen.findByRole('button', { name: /Search pages/ })
    await user.keyboard('{Control>}k{/Control}')
    const box = await screen.findByRole('combobox', { name: 'Page name' })
    expect(box).toHaveFocus()
    expect(pageOptions()).toHaveLength(pages.length)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Search pages' })).toBeNull()
    expect(button).toHaveFocus()
  })

  it('typing narrows the pages, the arrows move, Enter opens the page and keeps the epoch in the address', async () => {
    const user = userEvent.setup()
    renderApp('/stats?epoch=41')
    await user.click(await screen.findByRole('button', { name: /Search pages/ }))
    await user.type(pageBox(), 'pay')
    const names = pageOptions().map((o) => o.textContent)
    expect(names.length).toBeGreaterThan(1)
    expect(names.length).toBeLessThan(pages.length)
    await user.clear(pageBox())
    await user.type(pageBox(), 'rent')
    expect(pageOptions().find((o) => o.getAttribute('aria-selected') === 'true')).toHaveTextContent('Rent access')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'Rent access' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Search pages' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Marketplace' })).toHaveAttribute('href', expect.stringContaining('epoch=41'))
  })

  it('ArrowDown moves the selection and wraps; a click opens a page', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    await user.click(await screen.findByRole('button', { name: /Search pages/ }))
    const box = pageBox()
    expect(pageOptions()[0]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}')
    expect(pageOptions()[1]).toHaveAttribute('aria-selected', 'true')
    expect(box.getAttribute('aria-activedescendant')).toBe(pageOptions()[1].id)
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(pageOptions().at(-1)).toHaveAttribute('aria-selected', 'true')
    await user.click(within(screen.getByRole('listbox', { name: 'Pages' })).getByRole('option', { name: /Risk/ }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Risk' })).toBeInTheDocument())
  })

  it('says so when no page matches', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    await user.click(await screen.findByRole('button', { name: /Search pages/ }))
    await user.type(pageBox(), 'zzz')
    expect(pageOptions()).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent('No page matches “zzz”')
  })
})
