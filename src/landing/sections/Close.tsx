import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { EPOCH8, LIVE } from '../facts'
import { Logo, LogoMark } from '../Logo'
import { X207 } from '../v4/engine/x207.js'
import { MOOD, TONE } from '../v4/epoch'
import { Cta, Face, Horizon } from './Mac'

gsap.registerPlugin(ScrollTrigger)

/** What x207 is not, stated before anyone asks. On a wide screen the scroll walks through the limits one at a time. The gas figures are the measured ones of epoch 8 (facts.ts). */
export function Faq() {
  const items = [
    {
      title: 'Not credit without cash',
      body: <>An agent stakes 125% of the debt it can run up when it joins. The limit can grow with its history, never above its stake.</>,
    },
    {
      title: 'Not a gas saving on NEAR',
      body: <>Epoch 8 burnt {EPOCH8.gasEpoch} Tgas where {EPOCH8.vouchers} plain transfers burn {EPOCH8.gasTransfers}. It pays off when a pair trades about 3 to 4 times an epoch.</>,
    },
    {
      title: 'Not for a star',
      body: <>If everyone only pays one hub there is nothing to net. Use x402 <code>exact</code> for that.</>,
    },
    {
      title: 'Not on mainnet',
      body: <>NEAR testnet with mock USDT. No mainnet transaction has been sent.</>,
    },
    {
      title: 'Not audited',
      body: <>The contracts are tested, not externally audited. Known issues are listed in <a href={LIVE.security}>security.md</a>.</>,
    },
  ]
  const [on, setOn] = useState(0)
  const grid = useRef<HTMLDivElement>(null)

  // wide screens with motion: the section is pinned under the bar and the scroll walks through the limits one by one; each one lights up and
  // opens while the one before it closes. Elsewhere a tap opens a limit.
  useEffect(() => {
    const g = grid.current
    if (!g) return
    const mm = gsap.matchMedia()
    mm.add('(min-width: 961px) and (prefers-reduced-motion: no-preference)', () => {
      const st = ScrollTrigger.create({
        trigger: g,
        start: 'top 64px',
        end: `+=${items.length * 55}%`,
        pin: true,
        onUpdate: (self) => setOn(Math.min(items.length - 1, Math.floor(self.progress * items.length + 1e-6))),
      })
      return () => st.kill()
    })
    return () => mm.revert()
  }, [items.length])

  return (
    <section className="rows-sec" id="faq" aria-labelledby="faq-h">
      <div className="rows-grid faq-grid" ref={grid}>
        <div className="rows-left">
          <div className="faq-head">
            <LogoMark className="faq-logo" />
            <h2 id="faq-h" className="reveal-words">What x207 is not.</h2>
            <p className="sub">Stated before you ask: the edges of a hackathon prototype on NEAR testnet.</p>
          </div>
          <p className="faq-count mono" aria-hidden="true">
            <b>{String(on + 1).padStart(2, '0')}</b> / {String(items.length).padStart(2, '0')}
          </p>
        </div>
        <div className="rows-right qa">
          {items.map((it, i) => (
            <details key={it.title} open={i === on}>
              <summary
                className="row"
                onClick={(e) => {
                  e.preventDefault()
                  setOn(i === on ? -1 : i)
                }}
              >
                <span className="row-n mono" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="row-t">{it.title}</h3>
                <span className="plus" aria-hidden="true" />
              </summary>
              <p>{it.body}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/** The last call, after x.ai's "Meet your first Bot", and the footer. */
export function Close() {
  return (
    <>
      <section className="closing-sec" id="next" aria-labelledby="next-h">
        <div className="closing-stage">
          <Horizon className="closing-arc" />
          <div className="closing-copy">
            <div className="closing-pill" aria-hidden="true">
              <span>
                {X207.outcome.slice(0, 7).map((o, i) => (
                  <Face key={i} tone={TONE[o]} size={44} mood={MOOD[o]} mono round />
                ))}
              </span>
            </div>
            <h2 id="next-h" className="reveal-words">Step inside the live circle.</h2>
            <p>The dashboard reads the same contract: clearing results, the 207 report per member, and the marketplace.</p>
            <Cta go={{ href: LIVE.dashboard, label: 'Open the dashboard' }} watch={{ href: LIVE.epoch8Stats, label: 'Replay epoch 8' }} />
          </div>
        </div>
      </section>
      <footer className="foot">
        <div className="col">
          <div className="foot-cols">
            <Logo className="brand-logo" title="x207" />
            <nav aria-label="Protocol">
              <p>Protocol</p>
              <a href="#how">How it works</a>
              <a href="#barter">Barter</a>
              <a href="#faq">Limits</a>
            </nav>
            <nav aria-label="Developers">
              <p>Developers</p>
              <a href="#build">Quickstart</a>
              <a href={LIVE.apiEpochs}>Read API</a>
              <a href={LIVE.mcpHealth}>MCP server</a>
              <a href={LIVE.x402Proposal}>x402 proposal</a>
            </nav>
            <nav aria-label="Evidence">
              <p>Evidence</p>
              <a href={LIVE.claims}>CLAIMS.md</a>
              <a href={LIVE.barterEvidence}>barter-evidence.md</a>
              <a href={LIVE.security}>security.md</a>
              <a href={LIVE.finalizeTx}>Finalize transaction</a>
            </nav>
          </div>
          <p className="foot-mark" aria-hidden="true">x207</p>
          <div className="foot-base">
            <span>x207 · hackathon prototype · NEAR testnet, mock USDT</span>
            <a href={LIVE.repo}>GitHub</a>
          </div>
        </div>
      </footer>
    </>
  )
}
