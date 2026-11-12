import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { EpochProvider, useEpochSelection } from '../epoch'
import { Logo } from '../landing/Logo'
import { AGENTS_PATH, pages } from '../routes'
import { Sidebar } from './AppNav'
import { NavIcon } from './icons'
import { CirclePicker } from './CirclePicker'
import { DetailSlot, DetailSlotProvider } from './detail'
import { EpochPicker } from './EpochPicker'
import { LateEpochNotice } from './LateEpochNotice'
import { NetworkChip } from './NetworkChip'
import { PhaseStrip } from './PhaseStrip'
import { AccountMenu } from './AccountMenu'
import { CommandPalette } from './CommandPalette'
import { DemoBanner, DemoToggle } from '../demo/DemoToggle'
import { SelectMenu } from './SelectMenu'

// v4: every page opens the same way: the title in display type, the tools beside it, then one sentence in the agent's voice. Home is the statement page: a mono
// eyebrow (circle, the latest epoch with vouchers, its phase) above the title, and the sentence with the real numbers of that epoch where the others have their intro.
function Header() {
  const { pathname } = useLocation()
  const { selected } = useEpochSelection()
  const page = pages.find((p) => p.path === pathname)
  const home = pathname === '/app'
  // v6: an agent page carries its own head (the mascot and the name), as a bot does in Grok Bot
  if (pathname === AGENTS_PATH || pathname.startsWith(`${AGENTS_PATH}/`)) return null
  return (
    <header className="page-head" data-page={home ? 'home' : undefined}>
      <div className="page-title">
        <h1>{page?.title ?? 'Page not found'}</h1>
        <div className="page-tools">
          <CirclePicker />
          {/* FE-063: only a page that reads one epoch gets the picker. On the others it chose the newest cleared epoch (41) while Home spoke of the live one (42). */}
          {page?.perEpoch && <EpochPicker />}
        </div>
      </div>
      {/* FE-069: one plain sentence on what the page is for, so a first-time visitor knows why they are here */}
      {page && !home && <p className="page-intro">{page.intro}</p>}
      {page?.perEpoch && <LateEpochNotice />}
      {page?.perEpoch && selected && <PhaseStrip phase={selected.phase} />}
    </header>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  const main = useRef<HTMLElement>(null)
  const first = useRef(true)
  const agent = pathname.startsWith(`${AGENTS_PATH}/`) ? decodeURIComponent(pathname.slice(AGENTS_PATH.length + 1)) : null
  const title = pages.find((p) => p.path === pathname)?.title ?? (agent ?? (pathname === AGENTS_PATH ? 'Members' : undefined))
  // v6: under 840 px the sidebar is a full-screen list, opened by the menu button of the top bar and closed by any page change (iOS: a list, then the page)
  const [list, setList] = useState<string | null>(null)
  const listOpen = list === pathname
  const group = pages.find((p) => p.path === pathname)?.group // FE-074: the CSS centres the content of the Marketplace pages
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
          <Sidebar open={listOpen} onClose={() => setList(null)} />
          <div className="stage">
            <div className="topbar">
              <div className="topbar-id">
                <button type="button" className="list-toggle" aria-controls="sidebar" aria-expanded={listOpen} aria-label={listOpen ? 'Close the list' : 'Open the list'} onClick={() => setList(listOpen ? null : pathname)}>
                  <NavIcon name={listOpen ? 'close' : 'menu'} size={18} />
                </button>
                {/* under 840 px the sidebar is gone and the logo moves here */}
                <p className="brand-compact">
                  <Logo className="brand-logo" title="x207" />
                </p>
                <NetworkChip />
              </div>
              <div className="topbar-tools">
                <CommandPalette />
                <DemoToggle />
                <AccountMenu />
              </div>
            </div>
            <main id="content" ref={main} tabIndex={-1} data-group={group}>
              <DemoBanner />
              <Header />
              {/* FE-067: a new key per page, so each page eases in (the CSS animates the blocks of .route one after the other) */}
              <div className="route" key={pathname}>
                <Outlet />
              </div>
            </main>
            <DetailSlot />
          </div>
        </div>
        <SelectMenu />
      </DetailSlotProvider>
    </EpochProvider>
  )
}
