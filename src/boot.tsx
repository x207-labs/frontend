// The v4 design system: "Agent Console" type and the --ds-* tokens, shared with the landing (landing/mount.tsx imports the same two).
import './ds/fonts.css'
import './ds/tokens.css'
import './styles.css'
import './ds/components.css'
import './ds/app.css'
import './ds/epoch.css'
import './ds/pages-circle.css'
import './ds/pages-market.css'
import './ds/pages-access.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { API_URL, USE_FIXTURES } from './config'
import { DEMO_MODE } from './demo/mode'
import { createQueryClient } from './queryClient'
import { fixtureWalletPort } from './wallet/fixtureWallet'
import { nearConnectPort } from './wallet/nearConnect'
import type { WalletPort } from './wallet/types'
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

// FE-100: demo mode answers every request inside the tab and signs with a demo wallet; the live network and wallet are not loaded.
let port: WalletPort = USE_FIXTURES ? fixtureWalletPort : nearConnectPort
if (DEMO_MODE && !USE_FIXTURES) {
  const [{ installDemoNetwork }, { demoWalletPort }] = await Promise.all([import('./demo/network'), import('./demo/wallet')])
  await installDemoNetwork()
  port = demoWalletPort
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <WalletProvider port={port}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </WalletProvider>
    </QueryClientProvider>
  </StrictMode>,
)
