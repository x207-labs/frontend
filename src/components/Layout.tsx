import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { CIRCLE } from '../config'
import { EpochProvider, useEpochSelection } from '../epoch'
import { pages } from '../routes'
import { Sidebar, TabBar } from './AppNav'
import { CirclePicker } from './CirclePicker'
import { DetailSlot, DetailSlotProvider } from './detail'
import { EpochPicker } from './EpochPicker'
import { LateEpochNotice } from './LateEpochNotice'
import { PhaseStrip } from './PhaseStrip'
import { AccountMenu } from './AccountMenu'
import { CommandPalette } from './CommandPalette'

function Header() {
  const { pathname } = useLocation()
  const { selected } = useEpochSelection()
  const page = pages.find((p) => p.path === pathname)
  return (
    <header className="page-head">
      <div className="page-title">
        <h1>{page?.title ?? 'Page not found'}</h1>
        <div className="page-tools">
          <CirclePicker />
          {/* FE-063: only a page that reads one epoch gets the picker. On the others it chose the newest cleared epoch (41) while Home spoke of the live one (42). */}
          {page?.perEpoch && <EpochPicker />}
        </div>
      </div>
      {page?.perEpoch && <LateEpochNotice />}
      {page?.perEpoch && selected && <PhaseStrip phase={selected.phase} />}
    </header>
  )
}

export function Layout() {
  const { pathname } = useLocation()
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
      <DetailSlotProvider>
        <div className="shell">
          <Sidebar />
          <div className="stage">
            <div className="topbar">
              <p className="brand-compact">
                x207 <span>{CIRCLE}</span>
              </p>
              <div className="topbar-tools">
                <CommandPalette />
                <AccountMenu />
              </div>
            </div>
            <main id="content" ref={main} tabIndex={-1}>
              <Header />
              {/* FE-067: a new key per page, so each page eases in (the CSS animates the blocks of .route one after the other) */}
              <div className="route" key={pathname}>
                <Outlet />
              </div>
            </main>
            <DetailSlot />
          </div>
          <TabBar />
        </div>
      </DetailSlotProvider>
    </EpochProvider>
  )
}
