import { useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from 'react'
import { LIVE } from '../facts'
import { Logo } from '../Logo'

type Item = { href: string; title: string; note: string; icon?: ReactNode }

const MENUS: { label: string; items: Item[] }[] = [
  {
    label: 'Protocol',
    items: [
      { href: '#how', title: 'How it works', note: 'One epoch, from vouchers to one net amount' },
      { href: '#barter', title: 'Barter', note: 'Pay with anything that has value' },
      { href: '#faq', title: 'Limits', note: 'What x207 is not, stated up front' },
    ],
  },
  {
    label: 'Developers',
    items: [
      { href: LIVE.docs, title: 'Docs', note: 'How x207 works, step by step' },
      { href: '#build', title: 'Quickstart', note: 'MCP server, read API or a local sandbox' },
      { href: LIVE.apiEpochs, title: 'Read API', note: 'The epochs of agents-main, as JSON' },
      { href: LIVE.x402Proposal, title: 'x402 proposal', note: 'The batch-settlement binding' },
      { href: LIVE.claims, title: 'CLAIMS.md', note: 'Every claim next to its evidence' },
    ],
  },
]

/** The live circle: the crowd of agents from the hero title, four faces with four moods. */
const CrowdIcon = (
  <span className="crowd menu-crowd" aria-hidden="true">
    {[0, 1, 2, 3].map((n) => (
      <i key={n} style={{ ['--n' as string]: n }}>
        <b />
      </i>
    ))}
  </span>
)

/** An epoch replayed: the fifteen agents as dots on a ring, a play mark in the middle. */
const EpochIcon = (
  <svg className="menu-epoch" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
    {Array.from({ length: 15 }, (_, i) => {
      const a = (i / 15) * Math.PI * 2 - Math.PI / 2
      return <circle key={i} cx={20 + 15 * Math.cos(a)} cy={20 + 15 * Math.sin(a)} r={i % 5 === 0 ? 2.4 : 1.7} />
    })}
    <path d="M17 14.5v11a.8.8 0 0 0 1.2.7l8.6-5.5a.8.8 0 0 0 0-1.4l-8.6-5.5a.8.8 0 0 0-1.2.7Z" />
  </svg>
)

const DASH: Item[] = [
  { href: LIVE.dashboard, title: 'Live circle', note: `agents-main on ${LIVE.contract}`, icon: CrowdIcon },
  { href: LIVE.epoch8Stats, title: 'Epoch 8 replay', note: 'The clearing results of epoch 8', icon: EpochIcon },
]

const Chevron = () => (
  <svg className="chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const hoverable = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches

/** A disclosure that opens on hover (with a fine pointer) and on click, closes on Escape, on a click outside, on scroll and when focus leaves it. */
function useDisclosure() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const timer = useRef(0)
  useEffect(() => {
    if (!open) return
    const out = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      btn.current?.focus()
    }
    const shut = () => setOpen(false)
    document.addEventListener('pointerdown', out)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', shut, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', out)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', shut)
    }
  }, [open])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const hover = (on: boolean) => {
    if (!hoverable()) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(on), on ? 0 : 140)
  }
  const wrap = {
    ref: root,
    'data-open': open || undefined,
    onPointerEnter: () => hover(true),
    onPointerLeave: () => hover(false),
    onBlur: (e: FocusEvent) => {
      if (!root.current?.contains(e.relatedTarget as Node)) setOpen(false)
    },
  }
  return { open, setOpen, wrap, btn }
}

function Panel({ id, items, open }: { id: string; items: Item[]; open: boolean }) {
  return (
    <div className="menu" id={id} data-open={open || undefined}>
      <ul>
        {items.map((it) => (
          <li key={it.title}>
            <a href={it.href} className={it.icon ? 'has-ic' : undefined}>
              {it.icon && <span className="menu-ic">{it.icon}</span>}
              <b>{it.title}</b>
              <span>{it.note}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Menu({ label, items }: { label: string; items: Item[] }) {
  const { open, setOpen, wrap, btn } = useDisclosure()
  const id = useId()
  return (
    <div className="dd" {...wrap}>
      <button ref={btn} type="button" className="nav-link" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {label}
        <Chevron />
      </button>
      <Panel id={id} items={items} open={open} />
    </div>
  )
}

/** The white split pill: the left half opens the dashboard, the chevron lists where else to go in it. */
function DashSplit() {
  const { open, setOpen, wrap, btn } = useDisclosure()
  const id = useId()
  return (
    <div className="dd split aurora" {...wrap}>
      <a className="pill white" href={LIVE.dashboard}>
        Open dashboard
        <svg className="plane" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M14.6 1.4 1.8 6.6c-.6.2-.6 1.1 0 1.3l4.7 1.6 1.6 4.7c.2.6 1.1.6 1.3 0L14.6 1.4Z" fill="currentColor" />
          <path d="M6.5 9.5 10 6" stroke="#dfe6ff" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </a>
      <button ref={btn} type="button" className="pill white caret" aria-label="More dashboard links" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <Chevron />
      </button>
      <Panel id={id} items={DASH} open={open} />
    </div>
  )
}

function Sheet({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className="sheet" id="nav-sheet" data-open={open || undefined}>
      {children}
    </div>
  )
}

/** The fixed top bar, after x.ai: logo, menus that open on hover, a dark pill and a white split pill. It gains a blurred backdrop once the page scrolls. */
export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [sheet, setSheet] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header className="nav" data-scrolled={scrolled || sheet || undefined}>
      <div className="col nav-row">
        <a className="wordmark" href="#top" aria-label="x207, back to top">
          <Logo className="brand-logo" title="x207" />
        </a>
        <nav aria-label="Site" className="nav-links">
          {MENUS.map((m) => (
            <Menu key={m.label} {...m} />
          ))}
          <a className="nav-link" href="#proof">Proof</a>
          <a className="nav-link" href="#numbers">Epoch 8</a>
          <a className="nav-link" href={LIVE.docs}>Docs</a>
        </nav>
        <div className="nav-end">
          <a className="pill dark" href={LIVE.repo}>
            <svg className="gh" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            GitHub
          </a>
          <DashSplit />
          <button type="button" className="burger" aria-label="Menu" aria-expanded={sheet} aria-controls="nav-sheet" onClick={() => setSheet(!sheet)}>
            <i />
            <i />
          </button>
        </div>
      </div>
      <Sheet open={sheet}>
        <nav aria-label="Site, small screens" onClick={(e) => (e.target as Element).closest('a') && setSheet(false)}>
          {[...MENUS, { label: 'Dashboard', items: DASH }].map((m) => (
            <div key={m.label}>
              <p>{m.label}</p>
              {m.items.map((it) => (
                <a key={it.title} href={it.href}>{it.title}</a>
              ))}
            </div>
          ))}
          <div>
            <p>More</p>
            <a href="#proof">Proof</a>
            <a href={LIVE.docs}>Docs</a>
            <a href={LIVE.repo}>GitHub</a>
          </div>
        </nav>
      </Sheet>
    </header>
  )
}
