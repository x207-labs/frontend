import { animate, createDrawable, stagger } from 'animejs'
import { useInView } from 'motion/react'
import { useEffect, useRef } from 'react'
import { DEFAULTER, EDGES, EPOCH8, LIVE, NET } from './facts'
import { Icon } from './icons'
import { Logo } from './Logo'

// FE-051: the footer. The brand, the live status and three columns of links; under them the circle of epoch 8 rises as line art (the same members and
// vouchers as the theatre, facts.ts), drawn once when it comes into view; then the bottom bar.

const C = 200
const R = 168
const slot = (m: number) => (m * 4) % NET.length
const at = (m: number, r = R) => {
  const a = (slot(m) / NET.length) * Math.PI * 2 - Math.PI / 2
  return [C + Math.cos(a) * r, C + Math.sin(a) * r] as const
}
const ARCS = EDGES.map(([from, to]) => {
  const [ax, ay] = at(from)
  const [bx, by] = at(to)
  const cx = C + (ax + bx - 2 * C) * 0.16
  const cy = C + (ay + by - 2 * C) * 0.16
  return `M${ax.toFixed(1)} ${ay.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`
})

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { text: 'How it works', href: '#epoch' },
      { text: 'Barter catalog', href: '#barter' },
      { text: 'What it is not', href: '#limits' },
      { text: 'Build', href: '#build' },
      { text: 'Dashboard', href: LIVE.dashboard },
    ],
  },
  {
    title: 'Developers',
    links: [
      { text: 'Read API', href: LIVE.apiEpochs, out: true },
      { text: 'MCP server', href: LIVE.mcp, out: true },
      { text: 'Source', href: LIVE.github, out: true },
      { text: 'README', href: LIVE.repo, out: true },
    ],
  },
  {
    title: 'Proof',
    links: [
      { text: 'Every claim', href: LIVE.claims, out: true },
      { text: 'Barter evidence', href: LIVE.barterEvidence, out: true },
      { text: 'Epoch 8 run', href: LIVE.epoch8Run, out: true },
      { text: 'Finalize transaction', href: LIVE.finalizeTx, out: true },
      { text: 'x402 proposal', href: LIVE.x402Proposal, out: true },
    ],
  },
]

function RingArt() {
  const ref = useRef<SVGSVGElement>(null)
  const seen = useInView(ref, { once: true, margin: '0px 0px -10% 0px' })
  useEffect(() => {
    if (!seen || !ref.current || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    try {
      const lines = createDrawable(ref.current.querySelectorAll('path, circle:not(.footer-ring-orbit)'))
      const play = animate(lines, { draw: ['0 0', '0 1'], duration: 1400, delay: stagger(28), ease: 'inOutQuad' })
      return () => {
        play.revert()
      }
    } catch {
      // Without SVG geometry (old engines, tests) the art stays drawn.
    }
  }, [seen])
  return (
    <svg ref={ref} className="footer-ring" viewBox="0 0 400 400" aria-hidden="true">
      <circle cx={C} cy={C} r={R} className="footer-ring-orbit" />
      {ARCS.map((d, i) => (
        <path key={i} d={d} />
      ))}
      {NET.map((n, m) => {
        const [x, y] = at(m)
        return <circle key={m} cx={x} cy={y} r={m === DEFAULTER ? 7 : 5} className={n > 0 ? 'is-pay' : n < 0 ? 'is-get' : 'is-zero'} />
      })}
    </svg>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        <div className="footer-brand">
          <Logo className="footer-logo" title="x207" />
          <p>Mutual-credit settlement for x402 agent payments on NEAR. Agents pay in vouchers or in kind; once an epoch, only the net moves.</p>
          <p className="footer-status">
            <span className="status-dot" aria-hidden="true" />
            Live on NEAR testnet: <a href={LIVE.contractUrl} target="_blank" rel="noreferrer"><code>{LIVE.contract}</code></a>, contract v{LIVE.version}
          </p>
        </div>
        <nav className="footer-cols" aria-label="Footer">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3>{col.title}</h3>
              <ul>
                {col.links.map((l) => (
                  <li key={l.text}>
                    <a href={l.href} {...('out' in l ? { target: '_blank', rel: 'noreferrer' } : {})}>
                      {l.text}
                      {'out' in l && <Icon name="arrowUpRight" className="footer-out" />}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="footer-horizon">
        <RingArt />
      </div>
      <div className="footer-bottom">
        <p>Testnet only, with a mock USDT. Figures from {EPOCH8.tag}.</p>
        <a className="to-top" href="#top">
          <Icon name="arrowUp" />
          Back to top
        </a>
      </div>
    </footer>
  )
}
