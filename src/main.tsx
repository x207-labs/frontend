import '@fontsource-variable/schibsted-grotesk'
import './styles.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { USE_FIXTURES } from './config'
import { createQueryClient } from './queryClient'

if (USE_FIXTURES) {
  const { fixtureFetch } = await import('./api/fixtures')
  window.fetch = fixtureFetch()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
