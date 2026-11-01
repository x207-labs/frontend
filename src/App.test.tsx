import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import { pages } from './routes'

describe('rute halaman', () => {
  it('memuat tujuh halaman', () => {
    expect(pages).toHaveLength(7)
  })

  it.each(pages)('$path membuka $title', ({ path, title }) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })
})
