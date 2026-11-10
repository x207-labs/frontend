import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { FEEDBACK_EVENT } from '../account/feedbackEvent'
import { CIRCLE } from '../config'
import { GROUPS, pages, type PageGroup } from '../routes'
import { NavIcon } from './icons'

const groupId = (group: string) => `nav-${group.replace(/\s+/g, '-')}`

// FE-054: three forms of one navigation, chosen by CSS from the window width (DS-MOB: 840 and 1200 px).
// 1200 px and up: the sidebar with its group labels. 840 to 1199 px: the same sidebar as an icon rail (the labels stay in the page for screen readers).
// Under 840 px: the tab bar, one tab per group plus "More", which opens every page.
export function Sidebar() {
  const { search } = useLocation()
  return (
    <aside className="rail">
      <p className="brand">
        x207 <span>{CIRCLE}</span>
      </p>
      <nav aria-label="Pages">
        {GROUPS.map((group) => (
          <div key={group} role="group" aria-labelledby={groupId(group)}>
            <p className="nav-group" id={groupId(group)}>
              {group}
            </p>
            {pages
              .filter((p) => p.group === group)
              .map(({ path, title }) => (
                <NavLink key={path} to={{ pathname: path, search }} title={title}>
                  <NavIcon name={path} />
                  <span className="nav-label">{title}</span>
                </NavLink>
              ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}

type Tab = { label: string; group: PageGroup; icon: string }
const TABS: Tab[] = [
  // FE-092: the tab stands for the whole Overview group (Home, results, report, graph, risk), so it carries the group's name
  { label: 'Overview', group: 'Overview', icon: '/app' },
  { label: 'Account', group: 'My account', icon: 'account' },
  { label: 'Market', group: 'Marketplace', icon: '/marketplace' },
  { label: 'Govern', group: 'Governance', icon: '/governance' },
]

export function TabBar() {
  const { pathname, search } = useLocation()
  // The sheet is open for the page it was opened on, so a page change closes it.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const more = openOn === pathname
  const opener = useRef<HTMLButtonElement>(null)
  const current = pages.find((p) => p.path === pathname)?.group
  return (
    <>
      <nav className="tabbar" aria-label="Main">
        {TABS.map(({ label, group, icon }) => {
          const first = pages.find((p) => p.group === group)!
          return (
            <Link key={group} to={{ pathname: first.path, search }} className="tab" aria-current={current === group ? 'page' : undefined}>
              <NavIcon name={icon} />
              <span>{label}</span>
            </Link>
          )
        })}
        <button type="button" className="tab" ref={opener} aria-haspopup="dialog" aria-expanded={more} onClick={() => setOpenOn(pathname)}>
          <NavIcon name="more" />
          <span>More</span>
        </button>
      </nav>
      {more && <MoreSheet onClose={() => { setOpenOn(null); opener.current?.focus() }} />}
    </>
  )
}

function MoreSheet({ onClose }: { onClose: () => void }) {
  const { search } = useLocation()
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
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
        {/* FE-092: on a phone the feedback button does not float over the page; it opens from here */}
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
