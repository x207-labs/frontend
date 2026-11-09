import { m, useMotionValueEvent, useScroll } from 'motion/react'
import { useState } from 'react'
import { LIVE } from './facts'
import { SPRING } from './tokens'

const LINKS = [
  { href: '#how', text: 'How it works' },
  { href: '#epoch-8', text: 'Epoch 8' },
  { href: '#barter', text: 'Barter' },
  { href: '#limits', text: 'Limits' },
  { href: '#build', text: 'Build' },
]

// FE-044: a floating glass pill; once the page moves it tightens and the glass thickens.
export function Nav() {
  const { scrollY } = useScroll()
  const [tight, setTight] = useState(false)
  useMotionValueEvent(scrollY, 'change', (y) => setTight(y > 24))
  return (
    <header className="nav-wrap">
      <m.nav className={tight ? 'nav glass is-tight' : 'nav glass'} aria-label="Landing" initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING}>
        <a className="brand" href="#top" aria-label="x207, back to top">
          <span className="brand-mark" aria-hidden="true" />
          x207
        </a>
        <ul className="nav-links">
          {LINKS.map((l) => (
            <li key={l.href}><a href={l.href}>{l.text}</a></li>
          ))}
        </ul>
        <a className="nav-git" href={LIVE.github} target="_blank" rel="noreferrer">GitHub</a>
        <a className="btn is-primary is-small" href="/stats">Open dashboard</a>
      </m.nav>
    </header>
  )
}
