// The --ds-* tokens the canvas engines read (the app's boot.tsx imports the same file). The landing's own type comes with Landing.tsx.
import '../ds/tokens.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Landing from './Landing'

// FE-044: "/" boots only this: no wallet, no query client, no dashboard styles.
// The page rules of landing.css hang on `html.is-landing`; set it before the first paint so the dark page does not flash white (Landing also sets it, for the route inside the app).
document.documentElement.classList.add('is-landing')
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
)
