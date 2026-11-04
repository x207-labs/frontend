import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { CIRCLE } from '../config'
import { EpochProvider, useEpochSelection } from '../epoch'
import { GROUPS, pages } from '../routes'
import { EpochPicker } from './EpochPicker'
import { PhaseStrip } from './PhaseStrip'
import { WalletButton } from './WalletButton'

function Header() {
  const { pathname } = useLocation()
  const { selected } = useEpochSelection()
  const page = pages.find((p) => p.path === pathname)
  return (
    <header className="page-head">
      <div className="page-title">
        <h1>{page?.title ?? 'Page not found'}</h1>
        <div className="page-tools">
          <EpochPicker />
          <WalletButton />
        </div>
      </div>
      {page?.perEpoch && selected && <PhaseStrip phase={selected.phase} />}
    </header>
  )
}

export function Layout() {
  const { search, pathname } = useLocation()
  const main = useRef<HTMLElement>(null)
  const first = useRef(true)
  const title = pages.find((p) => p.path === pathname)?.title
  // FE-031: each page has its own title, and a change of page moves the focus to the content, so a keyboard or screen reader user does not stay in the navigation
  useEffect(() => {
    document.title = title ? `${title} · x207` : 'x207'
    if (first.current) first.current = false
    else main.current?.focus()
  }, [pathname, title])
  return (
    <EpochProvider>
      <a className="skip-link" href="#content" onClick={(e) => { e.preventDefault(); main.current?.focus() }}>Skip to content</a>
      <div className="shell">
        <aside className="rail">
          <p className="brand">
            x207 <span>{CIRCLE}</span>
          </p>
          <nav aria-label="Pages">
            {GROUPS.map((group) => (
              <div key={group} role="group" aria-labelledby={`nav-${group.replace(/\s+/g, '-')}`}>
                <p className="nav-group" id={`nav-${group.replace(/\s+/g, '-')}`}>
                  {group}
                </p>
                {pages
                  .filter((p) => p.group === group)
                  .map(({ path, title }) => (
                    <NavLink key={path} to={{ pathname: path, search }}>
                      {title}
                    </NavLink>
                  ))}
              </div>
            ))}
          </nav>
        </aside>
        <main id="content" ref={main} tabIndex={-1}>
          <Header />
          <Outlet />
        </main>
      </div>
    </EpochProvider>
  )
}
