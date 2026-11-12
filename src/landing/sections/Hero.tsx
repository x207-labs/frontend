import { useEffect, useRef } from 'react'
import { LIVE } from '../facts'
import { X207 } from '../v4/engine/x207.js'
import { usePrefersReducedMotion } from '../v4/hooks'
import nearLogo from '../assets/near.jpg' // the NEAR Protocol logo, as CoinGecko serves it (coins/images/10365)
import { mountDotField } from './dotField'
import { Cta } from './Mac'

/** The first screen, after DeepBook: a full-screen backdrop (a turning sphere of agents that clear small loops between them), and the claim at the bottom. */
export function Hero() {
  const reduced = usePrefersReducedMotion()
  const field = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = field.current
    return cv ? (mountDotField(cv, reduced) ?? undefined) : undefined
  }, [reduced])

  return (
    <section className="hero" id="hero" aria-labelledby="hero-h">
      <div className="hero-bg" aria-hidden="true">
        <canvas className="hero-field" ref={field} aria-hidden="true" />
      </div>
      <a className="badge" href={LIVE.contractUrl}>
        <span>
          <b>Contract {LIVE.version} is live on NEAR testnet.</b> <span className="badge-more">See it on NearBlocks</span>
        </span>
        <span className="badge-go" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M3.5 8.5 8.5 3.5M4.5 3.5h4v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </a>
      <div className="col hero-copy">
        <h1 id="hero-h">
          Many{' '}
          <span className="crowd" aria-hidden="true">
            {[0, 1, 2, 3].map((n) => (
              <i key={n} style={{ ['--n' as string]: n }}>
                <b />
              </i>
            ))}
          </span>{' '}
          agent payments. <br />
          One net settlement.
        </h1>
        <p className="lede">
          x402 lets agents pay. x207 lets many agents settle at once: signed vouchers in, one net amount out per agent, cleared by a{' '}
          <span className="near">
            <img src={nearLogo} alt="" width="18" height="18" />
            NEAR
          </span>{' '}
          contract every epoch.
        </p>
        <Cta go={{ href: LIVE.dashboard, label: 'Open the dashboard' }} watch={{ href: '#how', label: `Watch epoch ${X207.epoch}` }} />
        <p className="sr">Behind the title, a sphere of agents turns. Now and then a few of them pay each other in a loop, and the loop is cancelled.</p>
      </div>
    </section>
  )
}
