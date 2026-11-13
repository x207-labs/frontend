// FE-121: the ways into the tour inside the dashboard (sidebar button, /tour, ?tour=1, the first-visit prompt), focus on the way out, and that it
// sends nothing.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render'
import { wasPrompted } from './state'
import { TourLauncher } from './TourLauncher'

const opened = () => screen.findByRole('dialog', { name: 'Barter, fixed for AI agents' }, { timeout: 4000 })

describe('tour entry points', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens from the sidebar button, and gives focus back to it on Escape', async () => {
    renderApp('/app')
    const button = await screen.findByRole('button', { name: 'Take the tour' })
    button.focus()
    fireEvent.click(button)
    const d = await opened()
    expect(d).toHaveAttribute('aria-modal', 'true')
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Barter, fixed for AI agents' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Take the tour' })))
  })

  it('opens from ?tour=1 and drops the ask from the URL', async () => {
    renderApp('/stats?circle=v018&tour=1')
    await opened()
    expect(document.querySelector('.tour-count')?.textContent).toContain('Step 1 of 11')
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Barter, fixed for AI agents' })).toBeNull())
    // the ask left the URL, so closing it does not open it again
    await new Promise((r) => setTimeout(r, 50))
    expect(document.querySelector('.tour')).toBeNull()
  })

  it('opens from /tour without a "Page not found"', async () => {
    renderApp('/tour')
    await opened()
    expect(screen.queryByText(/Page not found/i)).toBeNull()
  })

  it('sends nothing: every request while the tour runs is a read', async () => {
    const { requests } = renderApp('/app?tour=1')
    await opened()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
    await waitFor(() => expect(document.querySelector('.tour-count')?.textContent).toContain('Step 2 of 11'))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /Marketplace/i })).toBeInTheDocument(), { timeout: 3000 })
    expect(requests().filter((r) => r.method !== 'GET')).toEqual([])
  })
})

describe('first-visit prompt', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => cleanup())

  function at(path: string) {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={null} />
        </Routes>
        <TourLauncher firstVisitPrompt promptDelay={0} />
      </MemoryRouter>,
    )
  }

  it('offers the tour once on a dashboard page, and "Not now" hides it for good', async () => {
    at('/app')
    const prompt = await screen.findByRole('complementary', { name: 'Guided tour' })
    expect(prompt).toHaveTextContent('No wallet needed.')
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('complementary', { name: 'Guided tour' })).toBeNull()
    expect(wasPrompted()).toBe(true)
    cleanup()
    at('/app')
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('complementary', { name: 'Guided tour' })).toBeNull()
  })

  it('is not shown on the landing page', async () => {
    at('/')
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('complementary', { name: 'Guided tour' })).toBeNull()
  })

  it('is off by default under test, so other tests never meet it', async () => {
    render(
      <MemoryRouter initialEntries={['/app']}>
        <TourLauncher />
      </MemoryRouter>,
    )
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByRole('complementary', { name: 'Guided tour' })).toBeNull()
  })
})
