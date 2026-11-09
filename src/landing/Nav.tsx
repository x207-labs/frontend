import { m, useMotionValueEvent, useScroll } from 'motion/react'
import { useState } from 'react'
import { LIVE } from './facts'
import { Icon, type IconName } from './icons'
import { Logo } from './Logo'
import { SPRING } from './tokens'

// FE-051: each link carries the object of its section.
const LINKS: { href: string; text: string; icon: IconName }[] = [
  { href: '#epoch', text: 'How it works', icon: 'ring' },
  { href: '#barter', text: 'Barter', icon: 'swap' },
  { href: '#limits', text: 'Limits', icon: 'gauge' },
  { href: '#build', text: 'Build', icon: 'code' },
]

// FE-044: a floating glass pill; once the page moves it tightens and the glass thickens.
export function Nav() {
  const { scrollY } = useScroll()
  const [tight, setTight] = useState(false)
  useMotionValueEvent(scrollY, 'change', (y) => setTight(y > 24))
  return (
    <header className="nav-wrap">
      <m.nav className={tight ? 'nav glass is-tight' : 'nav glass'} aria-label="Landing" initial={{ y: -24 }} animate={{ y: 0 }} transition={SPRING}>
        <a className="brand" href="#top" aria-label="x207, back to top">
          <Logo className="brand-logo" title="x207" />
        </a>
        <ul className="nav-links">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href}>
                <Icon name={l.icon} />
                {l.text}
              </a>
            </li>
          ))}
        </ul>
        <a className="nav-git" href={LIVE.github} target="_blank" rel="noreferrer">
          <Icon name="branch" />
          GitHub
        </a>
        <a className="btn is-primary is-small" href={LIVE.dashboard}>Open dashboard</a>
      </m.nav>
    </header>
  )
}
