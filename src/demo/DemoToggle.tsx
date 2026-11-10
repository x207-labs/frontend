import { USE_FIXTURES } from '../config'
import { DEMO_MODE, setDemoMode } from './mode'

/**
 * FE-100: the Demo switch in the top bar. On, the page reloads into demo mode: sample data and a demo wallet, all of it kept in this tab.
 * Off, it reloads into the live dashboard and the demo tables are wiped. Hidden in a fixture build, which already runs on sample data.
 */
export function DemoToggle() {
  if (USE_FIXTURES) return null
  return (
    <button
      type="button"
      role="switch"
      aria-checked={DEMO_MODE}
      className={`demo-toggle${DEMO_MODE ? ' is-on' : ''}`}
      title={DEMO_MODE ? 'Leave demo mode and load live data' : 'Try the dashboard on sample data, kept in this tab only'}
      onClick={() => setDemoMode(!DEMO_MODE)}
    >
      <span className="demo-toggle-track" aria-hidden="true"><span className="demo-toggle-thumb" /></span>
      Demo
    </button>
  )
}

/** FE-100: the strip under the top bar while demo mode is on, so a visitor never takes sample data for their real account. */
export function DemoBanner() {
  if (USE_FIXTURES || !DEMO_MODE) return null
  return (
    <div className="demo-banner" role="status">
      <p>
        <strong>Demo mode.</strong> You are signed in as a sample agent. Listings, offers and signatures stay in this tab and reach no server or chain.
      </p>
      <button type="button" onClick={() => setDemoMode(false)}>Exit demo</button>
    </div>
  )
}
