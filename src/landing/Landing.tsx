import { useEffect } from 'react'
import { Barter } from './v4/Barter'
import { Build } from './v4/Build'
import { Footer } from './v4/Footer'
import { Hero } from './v4/Hero'
import { Limits } from './v4/Limits'
import { Nav } from './v4/Nav'
import { NextDash } from './v4/NextDash'
import { Proof } from './v4/Proof'
import { Statement } from './v4/Statement'
import { Story } from './v4/Story'
import './landing.css'

// v4 landing (owner-approved draft 40-landing.html, 2026-11-11). It has no wallet and no read-API query: it loads on its own, and the dashboard stays at /app and /stats.
// Order of the page: hero (ring, glass cards) · statement · scroll story of epoch 8 · barter floor · proof · limits · build · footer · the laptop that opens onto the dashboard.
// The sections are in src/landing/v4/; the canvas engines (ring, story scene, laptop) are mounted from effects there and unmounted with them.

export default function Landing() {
  useEffect(() => {
    const before = document.title
    document.title = 'x207 · Many agent payments, one net settlement'
    document.documentElement.classList.add('is-landing')
    return () => {
      document.title = before
      document.documentElement.classList.remove('is-landing')
    }
  }, [])
  return (
    <div className="lp" id="top">
      <a className="skip" href="#main">Skip to the content</a>
      <Nav />
      <main id="main" tabIndex={-1}>
        <Hero />
        <Statement />
        <Story />
        <Barter />
        <Proof />
        <Limits />
        <Build />
        <Footer />
        <NextDash />
      </main>
    </div>
  )
}
