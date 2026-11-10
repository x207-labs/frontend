// FE-099: the landing uses the dashboard's four faces (FE-098), self-hosted because the CSP allows only 'self' fonts.
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/geist'
import '@fontsource-variable/fraunces/wght-italic.css'
import '@fontsource-variable/geist-mono'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Landing from './Landing'

// FE-044: "/" boots only this: no wallet, no query client, no dashboard styles.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
)
