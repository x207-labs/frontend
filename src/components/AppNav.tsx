import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { FEEDBACK_EVENT } from '../account/feedbackEvent'
import { CIRCLE } from '../config'
import { Logo, LogoMark } from '../landing/Logo'
import { AGENTS_PATH, agentPath, GROUPS, pages, type PageRoute } from '../routes'
import { useWallet } from '../wallet/WalletContext'
import { shortName, useAgents } from './agents'
import { PALETTE_EVENT } from './CommandPalette'
import { NavIcon } from './icons'
import { Mascot } from './Mascot'
import { startTour } from '../tour/state'

const groupId = (group: string) => `nav-${group.replace(/\s+/g, '-')}`
/** How many agents the Members group shows besides you; the rest are one click away on the agents page. */
export const TOP_AGENTS = 8

// v6 (2026-11-12), after the Grok Bot app: one list in the sidebar, in groups. Circle: the pages about the whole circle, each with a plain line under its name.
// Members: the agents of the circle as mascots, you first, each with one line on where it stands. My account. At the foot: the marketplace, every page, and you.
// From 840 to 1199 px the same list is an icon rail; under 840 px it is a full-screen list that the menu button of the top bar opens, like a list in iOS.
function PageRow({ path, title, hint }: Pick<PageRoute, 'path' | 'title' | 'hint'>) {
  const { search } = useLocation()
  return (
    <NavLink to={{ pathname: path, search }} title={title}>
      <NavIcon name={path} />
      <span className="nav-label">
        <span className="nav-title">{title}</span>
        {hint && <span className="nav-hint" aria-hidden="true">{hint}</span>}
      </span>
    </NavLink>
  )
}

function Members() {
  const { search } = useLocation()
  const { account } = useWallet()
  const { agents, loading, error } = useAgents(account)
  const shown = agents.slice(0, (agents[0]?.account === account ? 1 : 0) + TOP_AGENTS)
  return (
    <div role="group" aria-labelledby={groupId('Members')}>
      <p className="nav-group" id={groupId('Members')}>
        Members
      </p>
      {loading && <p className="nav-note">Reading members…</p>}
      {error && <p className="nav-note">Members not available</p>}
      {shown.map((a) => (
        <NavLink key={a.account} className="agent-row" to={{ pathname: agentPath(a.account), search }} title={a.account}>
          <Mascot id={a.account} size={30} mood={a.mood} />
          <span className="nav-label">
            <span className="nav-title">
              {a.name}
              {a.account === account && <span className="you-mark"> · you</span>}
            </span>
            <span className="nav-hint" data-tone={a.tone}>{a.line}</span>
          </span>
        </NavLink>
      ))}
      {agents.length > shown.length && (
        <NavLink className="see-all-row" end to={{ pathname: AGENTS_PATH, search }}>
          <NavIcon name="more" />
          <span className="nav-label">See all {agents.length}</span>
        </NavLink>
      )}
    </div>
  )
}

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const { search } = useLocation()
  const { account } = useWallet()
  const [all, setAll] = useState(false)
  const allButton = useRef<HTMLButtonElement>(null)
  return (
    <aside className="rail" id="sidebar" data-open={open || undefined}>
      {/* v4: the logo of the landing. The wordmark from 1200 px; on the icon rail only the mark (the three agents), so it stays legible. */}
      <p className="brand">
        {/* v6.4: the logo leads back to the landing page (no query: "/" with ?circle= would open the dashboard) */}
        <Link className="brand-link" to="/" aria-label="x207, landing page">
          <Logo className="brand-logo" title="x207" />
          <LogoMark className="brand-mark" />
        </Link>
        <span>{CIRCLE}</span>
        {/* on a phone the list covers the page; Done gives it back, as in iOS */}
        {open && onClose && (
          <button type="button" className="list-done" onClick={onClose}>
            Done
          </button>
        )}
      </p>
      {/* after Grok Bot: a search row on top of the sidebar; it opens the same page search as Cmd-K */}
      <button type="button" className="rail-search" aria-haspopup="dialog" onClick={() => window.dispatchEvent(new Event(PALETTE_EVENT))}>
        <NavIcon name="search" size={16} />
        <span className="nav-label">Search</span>
      </button>
      <nav aria-label="Pages">
        <div role="group" aria-labelledby={groupId(GROUPS[0])}>
          <p className="nav-group" id={groupId(GROUPS[0])}>
            Circle
          </p>
          {pages.filter((p) => p.group === 'Overview').map((p) => <PageRow key={p.path} {...p} />)}
        </div>
        <Members />
        <div role="group" aria-labelledby={groupId(GROUPS[1])}>
          <p className="nav-group" id={groupId(GROUPS[1])}>
            {GROUPS[1]}
          </p>
          {pages.filter((p) => p.group === 'My account').map((p) => <PageRow key={p.path} {...p} />)}
        </div>
      </nav>
      <div className="rail-foot">
        <PageRow path="/marketplace" title="Marketplace" />
        <button type="button" className="rail-row" ref={allButton} aria-haspopup="dialog" aria-expanded={all} onClick={() => setAll(true)}>
          <NavIcon name="grid" />
          <span className="nav-label">All pages</span>
        </button>
        {/* FE-121: the guided tour of the dashboard */}
        <button type="button" className="rail-row" aria-haspopup="dialog" onClick={() => startTour()}>
          <NavIcon name="tour" />
          <span className="nav-label">Take the tour</span>
        </button>
        {account && (
          <Link className="rail-me" to={{ pathname: agentPath(account), search }} title={account}>
            <Mascot id={account} size={26} />
            <span className="nav-label">{shortName(account)}</span>
          </Link>
        )}
      </div>
      {/* in the body, so no filter or transform of the sidebar can trap the fixed sheet */}
      {all && createPortal(<AllPages onClose={() => { setAll(false); allButton.current?.focus() }} />, document.body)}
    </aside>
  )
}

/** Every page in one sheet, by group, and the feedback form (FE-092: on a phone the feedback button does not float over the page). */
export function AllPages({ onClose }: { onClose: () => void }) {
  const { search, pathname } = useLocation()
  const close = useRef<HTMLButtonElement>(null)
  const at = useRef(pathname)
  const done = useRef(onClose)
  done.current = onClose
  useEffect(() => {
    close.current?.focus()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && done.current()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])
  // a page change (a link of the sheet) closes it
  useEffect(() => {
    if (pathname !== at.current) done.current()
  }, [pathname])
  return (
    // v6.3: a pop-up in the middle of the screen, as the plugin list of Grok Bot: the pages as a grid by group
    <div className="sheet-backdrop" data-center="" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="All pages">
        <div className="sheet-head">
          <h2>All pages</h2>
          <button type="button" className="quiet" ref={close} onClick={onClose}>
            Close
          </button>
        </div>
        <nav aria-label="All pages">
          {GROUPS.map((group) => (
            <div key={group} role="group" aria-label={group}>
              <p className="nav-group">{group}</p>
              {pages
                .filter((p) => p.group === group)
                .map(({ path, title }) => (
                  <NavLink key={path} to={{ pathname: path, search }}>
                    <NavIcon name={path} />
                    <span>{title}</span>
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
        <button
          type="button"
          className="quiet sheet-feedback"
          onClick={() => {
            onClose()
            window.dispatchEvent(new Event(FEEDBACK_EVENT))
          }}
        >
          Send feedback
        </button>
      </div>
    </div>
  )
}
