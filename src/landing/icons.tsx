import type { ReactNode } from 'react'

// FE-051: the object icons of the landing page. Drawn for x207 (24 px grid, one 1.5 px hairline, round ends), no icon font and no brand marks.
// Every shape carries pathLength="1", so CSS can draw it in with one dash (.icon-draw in landing.css) when its section comes into view.

const P = { pathLength: 1 } as const

const SHAPES = {
  ring: (
    <>
      <circle cx="12" cy="12" r="7.5" {...P} />
      <circle cx="12" cy="4.5" r="1.6" {...P} />
      <circle cx="18.5" cy="15.75" r="1.6" {...P} />
      <circle cx="5.5" cy="15.75" r="1.6" {...P} />
      <path d="M12 9.5v5M9.5 12h5" {...P} />
    </>
  ),
  swap: <path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" {...P} />,
  gauge: (
    <>
      <path d="M4 17a8 8 0 1 1 16 0" {...P} />
      <path d="M12 17l4.5-5" {...P} />
      <path d="M3 20h18" {...P} />
    </>
  ),
  code: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14" {...P} />,
  branch: (
    <>
      <circle cx="6" cy="5" r="2" {...P} />
      <circle cx="6" cy="19" r="2" {...P} />
      <circle cx="18" cy="7" r="2" {...P} />
      <path d="M6 7v10M18 9c0 4.5-12 3-12 8" {...P} />
    </>
  ),
  chip: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" {...P} />
      <rect x="9.5" y="9.5" width="5" height="5" rx="0.5" {...P} />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" {...P} />
    </>
  ),
  dataset: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" {...P} />
      <path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" {...P} />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="12" r="4" {...P} />
      <path d="M11.5 12H21M18 12v3M21 12v2" {...P} />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8.5" r="3.5" {...P} />
      <path d="M4.5 20c1-4 4-6 7.5-6s6.5 2 7.5 6" {...P} />
    </>
  ),
  frame: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" {...P} />
      <circle cx="16" cy="9" r="1.6" {...P} />
      <path d="M3 17l5-5 4 4 3-3 6 6" {...P} />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8" {...P} />
      <circle cx="12" cy="12" r="4.5" {...P} />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" {...P} />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5" {...P} />
    </>
  ),
  server: (
    <>
      <rect x="4" y="4" width="16" height="6.5" rx="1.5" {...P} />
      <rect x="4" y="13.5" width="16" height="6.5" rx="1.5" {...P} />
      <path d="M7.5 7.25h2M7.5 16.75h2" {...P} />
    </>
  ),
  weights: (
    <>
      <circle cx="5" cy="6" r="1.8" {...P} />
      <circle cx="5" cy="18" r="1.8" {...P} />
      <circle cx="12" cy="12" r="1.8" {...P} />
      <circle cx="19" cy="6" r="1.8" {...P} />
      <circle cx="19" cy="18" r="1.8" {...P} />
      <path d="M6.6 7l3.8 4M6.6 17l3.8-4M13.6 11l3.8-4M13.6 13l3.8 4M6.8 6h10.4" {...P} />
    </>
  ),
  doc: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h4" {...P} />,
  cog: (
    <>
      <circle cx="12" cy="12" r="3" {...P} />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" {...P} />
    </>
  ),
  megaphone: <path d="M4 10v4h3l7 4V6l-7 4H4zM17.5 9a4 4 0 0 1 0 6M8 14l1 5" {...P} />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" {...P} />
      <path d="M12 8v4l3 2" {...P} />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" {...P} />
      <path d="M11 18h2" {...P} />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="8" {...P} />
      <path d="M6.4 6.4l11.2 11.2" {...P} />
    </>
  ),
  plug: <path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5" {...P} />,
  connector: (
    <>
      <circle cx="6" cy="12" r="2.5" {...P} />
      <circle cx="18" cy="6" r="2.5" {...P} />
      <circle cx="18" cy="18" r="2.5" {...P} />
      <path d="M8.3 11l7.4-4M8.3 13l7.4 4" {...P} />
    </>
  ),
  seal: (
    <>
      <path d="M13 21H6V3h8l4 4v4M14 3v4h4M9 11h5M9 15h2" {...P} />
      <circle cx="17" cy="16" r="3" {...P} />
      <path d="M15.6 18.6L15 22l2-1 2 1-.6-3.4" {...P} />
    </>
  ),
  claims: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 14l2 2 4-4.5" {...P} />,
  flask: <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.6 15h8.8" {...P} />,
  hub: (
    <>
      <circle cx="12" cy="12" r="2.2" {...P} />
      <circle cx="4.5" cy="4.5" r="1.6" {...P} />
      <circle cx="19.5" cy="4.5" r="1.6" {...P} />
      <circle cx="4.5" cy="19.5" r="1.6" {...P} />
      <circle cx="19.5" cy="19.5" r="1.6" {...P} />
      <path d="M5.7 5.7l4.7 4.7M18.3 5.7l-4.7 4.7M5.7 18.3l4.7-4.7M18.3 18.3l-4.7-4.7" {...P} />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" {...P} />
      <path d="M7 10l3 2-3 2M12.5 15H17" {...P} />
    </>
  ),
  agent: (
    <>
      <rect x="5" y="8" width="14" height="11" rx="3" {...P} />
      <circle cx="12" cy="4.5" r="1.2" {...P} />
      <path d="M12 5.7V8M9.5 13v1M14.5 13v1M3 13v2M21 13v2" {...P} />
    </>
  ),
  chart: <path d="M4 20V11M10 20V5M16 20v-6M3 20h18" {...P} />,
  arrowUpRight: <path d="M7 17L17 7M9 7h8v8" {...P} />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" {...P} />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" {...P} />
      <path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5" {...P} />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7" {...P} />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof SHAPES

/** One object icon. Decorative unless a label is given. */
export function Icon({ name, className, label }: { name: IconName; className?: string; label?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {SHAPES[name]}
    </svg>
  )
}

