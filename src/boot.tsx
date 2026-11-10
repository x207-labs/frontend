import '@fontsource-variable/schibsted-grotesk'
import './styles.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { API_URL, USE_FIXTURES } from './config'
import { createQueryClient } from './queryClient'
import { fixtureWalletPort } from './wallet/fixtureWallet'
import { nearConnectPort } from './wallet/nearConnect'
import { WalletProvider } from './wallet/WalletContext'

// FE-044: the dashboard boot, moved out of main.tsx unchanged so "/" can load the landing page without the wallet.
if (USE_FIXTURES) {
  const { fixtureFetch } = await import('./api/fixtures')
  const fake = fixtureFetch()
  const real = window.fetch.bind(window)
  // Only the read API is faked; the wallet manifest and everything else still go to the network.
  window.fetch = (input, init) =>
    String(input).startsWith(API_URL) ? fake(input) : real(input, init)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <WalletProvider port={USE_FIXTURES ? fixtureWalletPort : nearConnectPort}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </WalletProvider>
    </QueryClientProvider>
  </StrictMode>,
)
