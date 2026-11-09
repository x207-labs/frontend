// FE-044: the x207 logo of the umbrella repository (brand/x207-logo-light.svg and -dark.svg), inline so it follows the page's light and dark colors.
// The brand note: ink #2C2C2A and teal #0F6E56 on light, ink #F1EFE8 and teal #5DCAA5 on dark; the wordmark is never shown below 24px high.
export function Logo({ className, title = 'x207' }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 362 100" role="img" aria-label={title}>
      <circle cx="50" cy="50" r="36" fill="none" className="logo-ink-line" strokeWidth="9" strokeDasharray="50.27 25.13" transform="rotate(50 50 50)" />
      <g className="logo-ink">
        <circle cx="50" cy="14" r="9" />
        <circle cx="81.2" cy="68" r="9" />
        <circle cx="18.8" cy="68" r="9" />
      </g>
      <path d="M40 40 60 60M60 40 40 60" fill="none" className="logo-teal-line" strokeWidth="9" strokeLinecap="round" />
      <g transform="translate(112 0)">
        <path d="M8 26 19 37M56 26 45 37M8 74 19 63M56 74 45 63" fill="none" className="logo-ink-line" strokeWidth="11" strokeLinecap="round" />
        <circle cx="32" cy="50" r="7.5" fill="none" className="logo-teal-line" strokeWidth="5" />
        <g transform="translate(10 0)">
          <path d="M64 38C64 27 73 22 84 22 96 22 104 30 104 40 104 50 96 56 88 62L64 78H106M186 22H230L202 78" fill="none" className="logo-ink-line" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M160.09 69.1A22 28 0 0 1 127.91 69.1M122.96 58.19A22 28 0 0 1 139.05 22.72M148.95 22.72A22 28 0 0 1 165.04 58.19" fill="none" className="logo-teal-line" strokeWidth="11" />
        </g>
      </g>
    </svg>
  )
}
