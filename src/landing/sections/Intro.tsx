import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { EPOCH8, NET } from '../facts'
import { STATUS, X207, labelOf } from '../v4/engine/x207.js'
import { FIG, LOOPS, MOOD, TONE } from '../v4/epoch'
import usdtLogo from '../assets/usdt.png' // the Tether (USDT) logo, as CoinGecko serves it (coins/images/325)
import { Face } from './Mac'

gsap.registerPlugin(ScrollTrigger)

/** The idea in one heading and one line, then the fifteen agents of epoch 8 as a deck of cards. On a wide screen the page pins the section: the deck sits in the
 * middle and, as you scroll, fans out to both sides like a hand of cards (GSAP ScrollTrigger). Elsewhere the cards are a row that scrolls sideways and snaps. */
export function Intro() {
  const sec = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const s = sec.current
    const st = stage.current
    const tr = track.current
    if (!s || !st || !tr) return
    const mm = gsap.matchMedia()
    mm.add('(min-width: 961px) and (prefers-reduced-motion: no-preference)', () => {
      s.dataset.fx = ''
      const cards = gsap.utils.toArray<HTMLElement>('.acard', tr)
      const mid = (cards.length - 1) / 2
      // the fan: centred, each card spread out to the left or the right of the middle one, tilted and dropped a little along an arc
      const gap = () => Math.min(84, (st.clientWidth - 440) / (cards.length - 1))
      const tl = gsap.timeline({
        scrollTrigger: { trigger: st, start: 'top top', end: '+=120%', pin: true, scrub: 0.8, invalidateOnRefresh: true },
      })
      // fromTo, not from: React runs this effect twice in development, and a from() would read the spread fan as its start
      tl.fromTo(
        cards,
        { x: 0, y: (i: number) => ((i % 3) - 1) * 6, rotation: (i: number) => ((i * 37) % 13) - 6 },
        {
          x: (i: number) => (i - mid) * gap(),
          y: (i: number) => (i - mid) ** 2 * 1.3,
          rotation: (i: number) => (i - mid) * 2.2,
          duration: 1,
          ease: 'power3.inOut',
          stagger: { each: 0.03, from: 'center' },
        },
      ).to({}, { duration: 0.3 }) // hold the fan a moment before the page moves on
      return () => {
        delete s.dataset.fx
      }
    })
    return () => mm.revert()
  }, [])

  return (
    <section className="intro" id="intro" ref={sec} aria-labelledby="intro-h">
      <div className="intro-stage" ref={stage}>
        <div className="col xhead">
          <h2 id="intro-h" className="reveal-words">Agents pay one by one. x207 settles them together.</h2>
          <p className="sub">Agents pay each other with signed vouchers. Once an epoch, each one settles a single net amount.</p>
        </div>
        <ul className="deck" ref={track} aria-label={`The ${EPOCH8.members} agents of epoch ${X207.epoch} and their result codes`}>
          {X207.outcome.map((o, i) => {
            const net = NET[i]
            return (
              <li key={i} className="acard" style={{ ['--tone' as string]: TONE[o] }}>
                <span className="mono acard-id">{labelOf(i)}</span>
                <div className="acard-face">
                  <Face tone={TONE[o]} size={104} mood={MOOD[o]} mono />
                </div>
                <div className="acard-foot">
                  <span className="acard-code mono">
                    {STATUS[o][1]} <span>{STATUS[o][2]}</span>
                  </span>
                  <span className="acard-net mono">{net === 0 ? '0.00' : `${net > 0 ? '−' : '+'}${Math.abs(net).toFixed(2)}`}</span>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

// the waterfall of epoch 8, in credit: what was owed, what the loops cancelled, what pairs netted, what moved (all from facts.ts)
const STEPS = [
  { key: 'owed', label: 'Owed', figure: FIG.gross, low: 0, high: EPOCH8.gross },
  { key: 'loops', label: 'Loops', figure: `−${FIG.cleared}`, low: EPOCH8.gross - EPOCH8.cleared, high: EPOCH8.gross },
  { key: 'pairs', label: 'Pairs', figure: `−${FIG.pairs}`, low: EPOCH8.moved, high: EPOCH8.netted },
  { key: 'moved', label: 'Moved', figure: FIG.moved, low: 0, high: EPOCH8.moved },
]
const pc = (v: number) => `${((v / EPOCH8.gross) * 100).toFixed(2)}%`

/** Epoch 8 in two numbers, after x.ai's cards: one heading, one line, and two cards, each a short title, one sentence and one picture. */
export function Numbers() {
  return (
    <section className="section" id="numbers" aria-labelledby="st-h">
      <div className="col">
        <div className="xhead">
          <h2 id="st-h" className="reveal-words">{FIG.gross} owed. {FIG.moved} moved.</h2>
          <p className="sub">The rest cancelled out before it ever touched the chain.</p>
        </div>
        <div className="xgrid">
          <article className="xcard reveal">
            <h3>Loops cancel first</h3>
            <p>The solver cancelled {FIG.cleared} in {LOOPS} loops, and pairs netted {FIG.pairs} more.</p>
            <figure className="xfig">
              <div className="fall" role="img" aria-label={`Of ${FIG.gross} owed: ${FIG.moved} moved, ${FIG.cleared} cancelled in solver loops, ${FIG.pairs} netted between pairs.`}>
                {STEPS.map((st) => (
                  <div key={st.key} className={`fall-col fall-${st.key}`}>
                    <div className="fall-track">
                      <i style={{ bottom: pc(st.low), height: pc(st.high - st.low) }} />
                      <span className="fall-fig mono" style={{ bottom: `calc(${pc(st.high)} + 6px)` }}>
                        {st.figure}
                      </span>
                    </div>
                    <span className="fall-label">{st.label}</span>
                  </div>
                ))}
              </div>
            </figure>
          </article>
          <article className="xcard reveal">
            <h3>Only the net moves</h3>
            <p>{EPOCH8.movements} transfers settled the epoch: {FIG.movedShare} of what was owed.</p>
            <figure className="xfig xfig-center">
              <p className="hero-fig mono">
                {FIG.moved}
                <small className="usdt">
                  <img src={usdtLogo} alt="" width="22" height="22" />
                  USDT
                </small>
              </p>
            </figure>
          </article>
        </div>
      </div>
    </section>
  )
}
