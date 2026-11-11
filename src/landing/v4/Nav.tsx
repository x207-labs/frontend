import { LIVE } from '../facts'
import { Logo } from '../Logo'

/** The floating glass pill. During the laptop section the page sets `data-next` on <html> and the pill slides away (landing.css). */
export function Nav() {
  return (
    <header className="nav">
      <div className="col">
        <a className="wordmark" href="#top" aria-label="x207, back to top">
          <Logo className="brand-logo" title="x207" />
        </a>
        <nav aria-label="Site">
          <a href="#story">How it works</a>
          <a href="#barter">Barter</a>
          <a href="#proof">Proof</a>
          <a href="#limits">Limits</a>
          <a href="#build">Build</a>
          <a href={LIVE.repo}>GitHub</a>
        </nav>
        <a className="btn white" href={LIVE.dashboard}>Open dashboard</a>
      </div>
    </header>
  )
}
