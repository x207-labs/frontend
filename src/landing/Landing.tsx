import { LazyMotion, MotionConfig, domAnimation } from 'motion/react'
import { useEffect } from 'react'
import { Barter } from './Barter'
import { Builders } from './Builders'
import { LIVE } from './facts'
import { Footer } from './Footer'
import { Icon, type IconName } from './icons'
import { Limits } from './Limits'
import { Nav } from './Nav'
import { Reveal } from './motion'
import { Theatre } from './Theatre'
import './landing.css'

// FE-044: the landing page of x207. It has no wallet and no read-API query: it loads on its own, and the dashboard stays at /stats.
// FE-048: the first screen and the story of epoch 8 are one scroll theatre with a hologram brain, and the copy is cut to a line per idea.
// FE-051: the sections after the theatre carry the object of each line, and the footer is its own component (Footer.tsx).

const LINKS: { label: string; value: string; href: string; icon: IconName }[] = [
  { label: 'Contract', value: LIVE.contract, href: LIVE.contractUrl, icon: 'seal' },
  { label: 'Read API', value: 'v018.x207.boxd.sh', href: LIVE.apiEpochs, icon: 'plug' },
  { label: 'MCP server', value: 'mcp.x207.boxd.sh', href: LIVE.mcp, icon: 'connector' },
  { label: 'Source', value: 'github.com/x207-labs', href: LIVE.github, icon: 'branch' },
  { label: 'Every claim, with its proof', value: 'CLAIMS.md', href: LIVE.claims, icon: 'claims' },
]

function Live() {
  return (
    <section id="live" className="section live" aria-labelledby="live-title">
      <p className="section-kicker">
        Fig. 08 <span>Verify</span>
      </p>
      <h2 id="live-title" className="section-title">Check it yourself.</h2>
      <ul className="live-list">
        {LINKS.map((l, i) => (
          <Reveal key={l.label} as="li" delay={i * 0.04}>
            <a href={l.href} target="_blank" rel="noreferrer">
              <span className="live-icon">
                <Icon name={l.icon} />
              </span>
              <span className="live-label">{l.label}</span>
              <span className="live-value">{l.value}</span>
              <Icon name="arrowUpRight" className="live-arrow" />
            </a>
          </Reveal>
        ))}
      </ul>
      <div className="live-cta">
        <a className="btn is-primary" href={LIVE.dashboard}>Open the dashboard</a>
        <a className="btn" href={LIVE.repo} target="_blank" rel="noreferrer">Read the README</a>
      </div>
    </section>
  )
}

export default function Landing() {
  useEffect(() => {
    const before = document.title
    document.title = 'x207 · Agents pay in anything, x207 settles the net'
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
            <Theatre />
            <Barter />
            <Limits />
            <Builders />
            <Live />
          </main>
          <Footer />
        </div>
      </MotionConfig>
    </LazyMotion>
  )
}
