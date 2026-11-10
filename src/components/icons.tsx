import type { ReactNode } from 'react'
import { agentGlyph, PROVIDER_GLYPHS } from './glyphs'

// FE-054: one hairline icon per page, drawn on a 24px grid with the current text colour, so the icon rail and the tab bar need no icon font and no brand marks.
// The key is the route path; "more" and the group tabs reuse these.
const PATHS: Record<string, ReactNode> = {
  '/app': <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />,
  '/stats': <path d="M5 20V10M12 20V4M19 20v-7" />,
  '/reports': <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" />,
  '/charts': (
    <>
      <circle cx="6" cy="7" r="2" />
      <circle cx="18" cy="7" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M8 7h8M7 9l4 7M17 9l-4 7" />
    </>
  ),
  '/risk': <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6zM12 8v5M12 16v.5" />,
  '/onboarding': (
    <>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20c0-3.5 3-6 6.5-6M18 8v6M15 11h6" />
    </>
  ),
  '/settlement': (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  '/marketplace': <path d="M4 9l1.5-5h13L20 9zM5 9v11h14V9M10 20v-6h4v6" />,
  '/invoices': <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  '/orders': <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" />,
  '/licenses': (
    <>
      <circle cx="8.5" cy="12" r="4" />
      <path d="M12.5 12H21M18 12v3" />
    </>
  ),
  '/codes': <path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16" />,
  '/transfers': <path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4" />,
  '/rent': (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  '/access': (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  '/governance': <path d="M3 9l9-5 9 5M5 9v9M10 9v9M14 9v9M19 9v9M3 20h18" />,
  '/settings': (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
  '/help': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 16.8v.2" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5" />
    </>
  ),
  more: (
    <>
      <circle cx="5.5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="18.5" cy="12" r="1" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
    </>
  ),
  out: <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" />,
}

export type IconName = keyof typeof PATHS

/** A member's work as an icon (a chip for gpu, a globe for scraper); null when the account name says nothing about it, so the caller keeps initials. */
export function AgentIcon({ account, size = 14 }: { account: string; size?: number }) {
  const d = agentGlyph(account)
  if (!d) return null
  return (
    <svg className="agent-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  )
}

/** The mark of a service that access is rented on (GitHub, Discord, SSH, S3, AWS). */
export function ProviderIcon({ provider, size = 20 }: { provider: string; size?: number }) {
  const g = PROVIDER_GLYPHS[provider] ?? PROVIDER_GLYPHS.mock
  return (
    <svg className="provider-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...(g.filled ? { fill: 'currentColor' } : { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const })}>
      <path d={g.d} />
    </svg>
  )
}

export function NavIcon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg className="nav-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name] ?? PATHS.more}
    </svg>
  )
}
