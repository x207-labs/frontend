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
  const { search } = useLocation()
  return (
    <EpochProvider>
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
        <main>
          <Header />
          <Outlet />
        </main>
      </div>
    </EpochProvider>
  )
}
