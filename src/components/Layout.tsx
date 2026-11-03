import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { CIRCLE } from '../config'
import { EpochProvider, useEpochSelection } from '../epoch'
import { pages } from '../routes'
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
        <h1>{page?.title}</h1>
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
      <a className="skip-link" href="#isi" onClick={(e) => { e.preventDefault(); main.current?.focus() }}>Lewati ke isi halaman</a>
      <div className="shell">
        <aside className="rail">
          <p className="brand">
            x207 <span>{CIRCLE}</span>
          </p>
          <nav aria-label="Halaman">
            {pages.map(({ path, title }) => (
              <NavLink key={path} to={{ pathname: path, search }}>
                {title}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main id="isi" ref={main} tabIndex={-1}>
          <Header />
          <Outlet />
        </main>
      </div>
    </EpochProvider>
  )
}
