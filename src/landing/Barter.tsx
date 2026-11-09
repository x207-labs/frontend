import { useInView } from 'motion/react'
import { useRef, useState } from 'react'
import { BARTER, BARTER_TOTAL, KIND_CLASSES, LIVE } from './facts'
import { Icon } from './icons'
import { kindIcon } from './kindIcon'

// FE-044, FE-048, FE-051: the barter catalog. One strip of 94 bars, one per kind, ordered by how far it has been proven; under it the tiers; then the
// shelf: every kind of docs/barter-evidence.md by class, each with its object and its code. Pointing at a tier lights its bars and its kinds.
const REFUSED = BARTER.find((row) => row.key === 'refused')?.count ?? 0
const BARS = BARTER.flatMap((row) => Array.from({ length: row.count }, () => row.key))
const LABEL = Object.fromEntries(BARTER.map((row) => [row.key, row.label])) as Record<string, string>

function Shelf({ active, reverse, cls }: { active: string | null; reverse: boolean; cls: (typeof KIND_CLASSES)[number] }) {
  const items = (copy: boolean) => (
    <ul className={copy ? 'kinds is-copy' : 'kinds'} aria-hidden={copy || undefined} aria-label={copy ? undefined : `Class ${cls.key}: ${cls.name}`}>
      {cls.kinds.map(([id, code, status]) => (
        <li key={id} className={`kind is-${status}${active === status ? ' is-lit' : ''}`} title={`#${id} ${code}: ${LABEL[status]}`}>
          <Icon name={status === 'refused' ? 'ban' : kindIcon(code)} />
          <code>{code}</code>
          <span className="kind-tick" aria-hidden="true" />
          <span className="sr-only">{LABEL[status]}</span>
        </li>
      ))}
    </ul>
  )
  return (
    <div className="shelf-row">
      <div className="shelf-head">
        <span className="shelf-key">{cls.key}</span>
        <span className="shelf-name">{cls.name}</span>
        <span className="shelf-count">{cls.kinds.length}</span>
      </div>
      <div className="shelf-window">
        <div className={reverse ? 'shelf-track is-reverse' : 'shelf-track'} style={{ '--run': `${cls.kinds.length * 3.2 + 18}s` } as never}>
          {items(false)}
          {items(true)}
        </div>
      </div>
    </div>
  )
}

export function Barter() {
  const [active, setActive] = useState<string | null>(null)
  const strip = useRef<HTMLDivElement>(null)
  const shelf = useRef<HTMLDivElement>(null)
  const seen = useInView(strip, { once: true, margin: '0px 0px -15% 0px' })
  const shelfSeen = useInView(shelf, { once: true, margin: '0px 0px -10% 0px' })

  return (
    <section id="barter" className="section barter" data-active={active ?? undefined} aria-labelledby="barter-title">
      <p className="section-kicker">
        Fig. 05 <span>Catalog</span>
      </p>
      <h2 id="barter-title" className="section-title">
        {BARTER_TOTAL - REFUSED} ways to pay. <span className="is-quiet">{REFUSED} refused on purpose.</span>
      </h2>

      <div ref={strip} className={seen ? 'strip is-in' : 'strip'} role="img" aria-label={`${BARTER_TOTAL} catalog entries by evidence`}>
        {BARS.map((key, i) => (
          <span key={i} className={`bar is-${key}${active === key ? ' is-lit' : ''}`} style={{ transitionDelay: seen ? `${i * 7}ms` : undefined }} />
        ))}
      </div>
      <ul className="tiers">
        {BARTER.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              title={row.note}
              className={active === row.key ? 'tier is-lit' : 'tier'}
              aria-pressed={active === row.key}
              onMouseEnter={() => setActive(row.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(row.key)}
              onBlur={() => setActive(null)}
              onClick={() => setActive((now) => (now === row.key ? null : row.key))}
            >
              <span className={`tier-swatch is-${row.key}`} aria-hidden="true" />
              <span className="tier-count">{row.count}</span>
              <span className="tier-text">{row.label}</span>
            </button>
          </li>
        ))}
      </ul>

      <div ref={shelf} className={shelfSeen ? 'shelf is-in' : 'shelf'}>
        {KIND_CLASSES.map((cls, i) => (
          <Shelf key={cls.key} cls={cls} active={active} reverse={i % 2 === 1} />
        ))}
      </div>

      <p className="spotlight">
        <Icon name="account" />
        <span>
          <b>A whole NEAR account can pay.</b> Kinds #11 and #14 were sold through the locker on <code>{LIVE.contract}</code>.{' '}
          <a href={LIVE.barterEvidence} target="_blank" rel="noreferrer">Evidence for every kind</a>
        </span>
      </p>
    </section>
  )
}
