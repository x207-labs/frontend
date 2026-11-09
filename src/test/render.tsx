import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { fixtureFetch, type FixtureReply } from '../api/fixtures'
import { App } from '../App'
import { pollEvery } from '../queryClient'
import { WalletProvider } from '../wallet/WalletContext'
import { createMockWallet, type MockWallet } from './walletMock'

export type Override = (path: string, init?: RequestInit) => FixtureReply | undefined

export function apiError(status: number, code: string, message = code, headers?: Record<string, string>): FixtureReply {
  return { status, body: { error: { code, message } }, ...(headers ? { headers } : {}) }
}

// Renders the whole app with a fake read API; the return value records the paths that were called.
export function renderApp(route: string, override?: Override, pollMs: number | false = false, wallet: MockWallet = createMockWallet()) {
  const fetchMock = vi.fn(fixtureFetch(override))
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({
    // FE-046: the same interval rule as the app (stretched after a 429, paused while the tab is hidden).
    defaultOptions: { queries: { retry: false, refetchInterval: pollMs === false ? false : pollEvery(pollMs), refetchIntervalInBackground: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <WalletProvider port={wallet}>
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      </WalletProvider>
    </QueryClientProvider>,
  )
  const calls = () => fetchMock.mock.calls.map(([input]) => String(input))
  const requests = () => fetchMock.mock.calls.map(([input, init]) => ({ path: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined }))
  return { ...view, calls, requests, client, wallet }
}
