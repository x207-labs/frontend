import '@fontsource-variable/schibsted-grotesk'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Landing from './Landing'

// FE-044: "/" boots only this: no wallet, no query client, no dashboard styles.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
)
