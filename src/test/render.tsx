import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { fixtureFetch, type FixtureReply } from '../api/fixtures'
import { App } from '../App'

export type Override = (path: string) => FixtureReply | undefined

export function apiError(status: number, code: string, message = code): FixtureReply {
  return { status, body: { error: { code, message } } }
}

// Merender seluruh aplikasi dengan read API tiruan; kembalian mencatat path yang dipanggil.
export function renderApp(route: string, override?: Override) {
  const fetchMock = vi.fn(fixtureFetch(override))
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  const calls = () => fetchMock.mock.calls.map(([input]) => String(input))
  return { ...view, calls, client }
}
