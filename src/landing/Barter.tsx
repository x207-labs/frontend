import { useInView } from 'motion/react'
import { useRef, useState } from 'react'
import { BARTER, BARTER_TOTAL, LIVE } from './facts'
import { Reveal } from './motion'

// FE-044, FE-048: the barter catalog as 94 dots, one per entry, coloured by how far it has been proven. Pointing at a row of the legend lights its dots; the
// note of a row is its tooltip.
const DOTS = BARTER.flatMap((row) => Array.from({ length: row.count }, () => row.key))
const REFUSED = BARTER.find((row) => row.key === 'refused')?.count ?? 0

export function Barter() {
  const [active, setActive] = useState<string | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const seen = useInView(grid, { once: true, margin: '0px 0px -15% 0px' })

  return (
    <section id="barter" className="section barter" aria-labelledby="barter-title">
      <Reveal>
        <h2 id="barter-title" className="section-title">
          {BARTER_TOTAL - REFUSED} ways to pay. <span className="is-quiet">{REFUSED} refused on purpose.</span>
        </h2>
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
                title={row.note}
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
                <span className="legend-text">{row.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Reveal className="spotlight">
        <p>
          <b>A whole NEAR account can pay.</b> Kinds #11 and #14 were sold through the locker on <code>{LIVE.contract}</code>.{' '}
          <a href={LIVE.barterEvidence} target="_blank" rel="noreferrer">Evidence for every kind</a>
        </p>
      </Reveal>
    </section>
  )
}
