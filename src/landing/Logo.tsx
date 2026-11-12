// The x207 logo: three agents with different silhouettes and faces (public/logo/logo-x207.webp, white on black) and the wordmark beside it.
export const LOGO_SRC = '/logo/logo-x207.webp'

export function Logo({ className, title = 'x207' }: { className?: string; title?: string }) {
  return (
    <span className={`logo ${className ?? ''}`} role="img" aria-label={title}>
      <img src={LOGO_SRC} alt="" width="512" height="512" />
      <span aria-hidden="true">x207</span>
    </span>
  )
}

/** Only the agents, for the icon rail and other tight spots. */
export function LogoMark({ className }: { className?: string }) {
  return <img className={className} src={LOGO_SRC} alt="" width="512" height="512" aria-hidden="true" />
}
