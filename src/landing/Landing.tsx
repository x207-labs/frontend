import { LazyMotion, MotionConfig, domAnimation } from 'motion/react'
import { useEffect } from 'react'
import { Barter } from './Barter'
import { Builders } from './Builders'
import { Epoch8 } from './Epoch8'
import { LIVE } from './facts'
import { Hero } from './Hero'
import { Limits } from './Limits'
import { Nav } from './Nav'
import { Reveal } from './motion'
import { Story } from './Story'
import './landing.css'

// FE-044: the landing page of x207. It has no wallet and no read-API query: it loads on its own, and the dashboard stays at /stats.

const LINKS = [
  { label: 'Contract', value: LIVE.contract, href: LIVE.contractUrl },
  { label: 'Read API', value: 'v018.x207.boxd.sh', href: LIVE.apiEpochs },
  { label: 'MCP server', value: 'mcp.x207.boxd.sh', href: LIVE.mcp },
  { label: 'Source', value: 'github.com/x207-labs', href: LIVE.github },
  { label: 'Every claim, with its proof', value: 'CLAIMS.md', href: LIVE.claims },
]

function Live() {
  return (
    <section id="live" className="section live" aria-labelledby="live-title">
      <Reveal>
        <p className="eyebrow">Live on NEAR testnet</p>
        <h2 id="live-title" className="section-title">Check it yourself.</h2>
      </Reveal>
      <ul className="live-list glass">
        {LINKS.map((l) => (
          <li key={l.label}>
            <a href={l.href} target="_blank" rel="noreferrer">
              <span className="live-label">{l.label}</span>
              <span className="live-value">{l.value}</span>
              <span className="live-arrow" aria-hidden="true">↗</span>
            </a>
          </li>
        ))}
      </ul>
      <div className="live-cta">
        <a className="btn is-primary" href="/stats">Open the dashboard</a>
        <a className="btn" href={LIVE.repo} target="_blank" rel="noreferrer">Read the README</a>
      </div>
    </section>
  )
}

export default function Landing() {
  useEffect(() => {
    const before = document.title
    document.title = 'x207 · Mutual-credit settlement for x402 agents on NEAR'
    document.documentElement.classList.add('is-landing')
    return () => {
      document.title = before
      document.documentElement.classList.remove('is-landing')
    }
  }, [])
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <div className="lp" id="top">
          <a className="skip" href="#how">Skip to the content</a>
          <Nav />
          <main>
            <Hero />
            <Story />
            <Epoch8 />
            <Barter />
            <Limits />
            <Builders />
            <Live />
          </main>
          <footer className="footer">
            <p>
              <b>x207</b> · mutual-credit settlement for x402 agent payments on NEAR. Testnet only, with a mock USDT.
            </p>
            <p>
              <a href={LIVE.github} target="_blank" rel="noreferrer">GitHub</a> · <a href={LIVE.claims} target="_blank" rel="noreferrer">Claims</a> · <a href="/stats">Dashboard</a>
            </p>
          </footer>
        </div>
      </MotionConfig>
    </LazyMotion>
  )
}
