import { useInView } from 'motion/react'
import { useRef, useState } from 'react'
import { BARTER, BARTER_TOTAL, LIVE } from './facts'
import { Reveal } from './motion'

// FE-044: the barter catalog as 94 dots, one per entry, coloured by how far it has been proven. Pointing at a row of the legend lights its dots.
const DOTS = BARTER.flatMap((row) => Array.from({ length: row.count }, () => row.key))
const REFUSED = BARTER.find((row) => row.key === 'refused')?.count ?? 0

export function Barter() {
  const [active, setActive] = useState<string | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const seen = useInView(grid, { once: true, margin: '0px 0px -15% 0px' })

  return (
    <section id="barter" className="section barter" aria-labelledby="barter-title">
      <Reveal>
        <p className="eyebrow">Barter</p>
        <h2 id="barter-title" className="section-title">Pay in what you have, not only in USDT.</h2>
        <p className="section-lead">
          A member can settle with an asset instead of cash. The catalog has {BARTER_TOTAL} entries: {BARTER_TOTAL - REFUSED} kinds that can be offered and {REFUSED} that are refused on purpose. Each
          dot is one entry, coloured by the strongest evidence it has.
        </p>
      </Reveal>

      <div className="barter-body">
        <div ref={grid} className={seen ? 'dots is-in' : 'dots'} data-active={active ?? undefined} role="img" aria-label={`${BARTER_TOTAL} catalog entries by evidence`}>
          {DOTS.map((key, i) => (
            <span key={i} className={`dot is-${key}${active === key ? ' is-lit' : ''}`} style={{ transitionDelay: seen ? `${i * 9}ms` : undefined }} />
          ))}
        </div>
        <ul className="legend">
          {BARTER.map((row) => (
            <li key={row.key}>
              <button
                type="button"
                className={active === row.key ? 'legend-row is-lit' : 'legend-row'}
                aria-pressed={active === row.key}
                onMouseEnter={() => setActive(row.key)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(row.key)}
                onBlur={() => setActive(null)}
                onClick={() => setActive((now) => (now === row.key ? null : row.key))}
              >
                <span className={`swatch is-${row.key}`} aria-hidden="true" />
                <span className="legend-count">{row.count}</span>
                <span className="legend-text">
                  {row.label}
                  <small>{row.note}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Reveal className="spotlight glass">
        <p className="eyebrow">Ran on contract 0.0.18</p>
        <h3>Sell an account through the locker.</h3>
        <p>
          A NEAR account can be the asset. Kind #11 sold a named account: the account was locked, and <code>complete_account_escrow</code> delivered its key to the buyer. Kind #14 locked a member
          account with its stake and obligations. Both ran on <code>{LIVE.contract}</code>.
        </p>
        <a href={LIVE.barterEvidence} target="_blank" rel="noreferrer">Read the evidence for every kind</a>
      </Reveal>
    </section>
  )
}
