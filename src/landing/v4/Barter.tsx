import { useEffect, useState } from 'react'
import { LIVE } from '../facts'
import { BARTER_FIG } from './epoch'
import { usePrefersReducedMotion } from './hooks'

const KINDS = ['API access', 'Datasets', 'GPU hours', 'Content licenses', 'One-time codes', 'Rent and access grants', 'Service orders', 'NEAR accounts']

/** The blue floor: anything with value can pay. The counts under the kinds come from facts.ts BARTER (a test keeps them equal to docs/barter-evidence.md). */
export function Barter() {
  const reduced = usePrefersReducedMotion()
  const [on, setOn] = useState(0)
  useEffect(() => {
    if (reduced) return
    const id = window.setInterval(() => setOn((k) => (k + 1) % KINDS.length), 1600)
    return () => window.clearInterval(id)
  }, [reduced])

  return (
    <section className="floor" id="barter" aria-labelledby="barter-h">
      <div className="col barter">
        <div>
          <p className="agent barter-kicker">barter › each leg is a voucher</p>
          <h2 id="barter-h">Anything with value can pay.</h2>
          <p>
            A dataset for GPU hours, an API key for a license. Each leg is priced in credit and signed as a voucher, so a loop of trades cancels exactly like a loop of debt, and nobody has to pay cash for it.
          </p>
          <ul className="kinds">
            {KINDS.map((k, i) => (
              <li key={k} className={i === on ? 'on' : undefined}>{k}</li>
            ))}
          </ul>
          <div className="evidence">
            <div><b>{BARTER_FIG.offered}</b><span>kinds can be offered</span></div>
            <div><b>{BARTER_FIG.testnet}</b><span>have run on testnet</span></div>
            <div><b>{BARTER_FIG.sandbox}</b><span>more in near-sandbox</span></div>
          </div>
          <p className="barter-note">
            The rest are mocked, unit-tested or registered only. Kind by kind: <a href={LIVE.barterEvidence}>barter-evidence.md</a>.
          </p>
        </div>
        <svg className="barter-fig" viewBox="0 0 420 380" role="img" aria-label="Three agents trade in a loop: a dataset, GPU hours and an API key. The loop cancels and no cash moves.">
          <defs>
            <radialGradient id="barter-orb" cx="35%" cy="30%" r="75%">
              <stop offset="0" stopColor="#fff" />
              <stop offset="1" stopColor="#c9d2ff" />
            </radialGradient>
            <marker id="barter-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0L10 5L0 10z" fill="#c8f53c" />
            </marker>
          </defs>
          <circle cx="210" cy="200" r="128" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="2" strokeDasharray="3 7" />
          <path d="M232 84 Q330 110 318 236" fill="none" stroke="#c8f53c" strokeWidth="5" strokeLinecap="round" markerEnd="url(#barter-arrow)" />
          <path d="M290 290 Q210 350 128 292" fill="none" stroke="#c8f53c" strokeWidth="5" strokeLinecap="round" markerEnd="url(#barter-arrow)" />
          <path d="M98 236 Q90 110 186 84" fill="none" stroke="#c8f53c" strokeWidth="5" strokeLinecap="round" markerEnd="url(#barter-arrow)" />
          <g fontSize="14" fontWeight="600" fill="#fff" textAnchor="middle">
            <text x="352" y="150">dataset</text>
            <text x="210" y="352">GPU hours</text>
            <text x="62" y="150">API key</text>
          </g>
          <g>
            <ellipse cx="212" cy="96" rx="30" ry="8" fill="rgba(6,9,48,.4)" />
            <circle cx="210" cy="64" r="34" fill="url(#barter-orb)" />
            <ellipse cx="200" cy="62" rx="3.6" ry="6" fill="#0e1330" />
            <ellipse cx="220" cy="62" rx="3.6" ry="6" fill="#0e1330" />
            <ellipse cx="322" cy="300" rx="30" ry="8" fill="rgba(6,9,48,.4)" />
            <circle cx="320" cy="268" r="34" fill="url(#barter-orb)" />
            <ellipse cx="310" cy="266" rx="3.6" ry="6" fill="#0e1330" />
            <ellipse cx="330" cy="266" rx="3.6" ry="6" fill="#0e1330" />
            <ellipse cx="102" cy="300" rx="30" ry="8" fill="rgba(6,9,48,.4)" />
            <circle cx="100" cy="268" r="34" fill="url(#barter-orb)" />
            <ellipse cx="90" cy="266" rx="3.6" ry="6" fill="#0e1330" />
            <ellipse cx="110" cy="266" rx="3.6" ry="6" fill="#0e1330" />
          </g>
          <g fontSize="12" fill="#d9ffe9" textAnchor="middle">
            <text x="210" y="196">loop of trades</text>
            <text x="210" y="216" fill="#c8f53c">cancels · 0 cash</text>
          </g>
        </svg>
      </div>
    </section>
  )
}
