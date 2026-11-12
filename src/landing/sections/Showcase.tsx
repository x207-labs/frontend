import { useEffect, useRef, useState, type RefObject } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { EPOCH8, LIVE, NET } from '../facts'
import { findCycles } from '../v4/engine/scene.js'
import { STATUS, X207, fmt, labelOf } from '../v4/engine/x207.js'
import { FIG, LOOPS, MOOD, SCALE, TONE } from '../v4/epoch'
import { usePrefersReducedMotion } from '../v4/hooks'
import { canDraw2D, HeroRing } from '../v4/HeroRing'
import { Face, LoopPath, Mac } from './Mac'

gsap.registerPlugin(ScrollTrigger)

/** Runs the epoch 8 ring on the canvas inside `stage`, writing the loop it cancels into `cap` and telling `onLoop` which one it is. */
function useRing(stage: RefObject<HTMLDivElement | null>, cap: RefObject<HTMLParagraphElement | null>, reduced: boolean, onLoop: (k: number) => void) {
  useEffect(() => {
    const el = stage.current
    const caption = cap.current
    const canvas = el?.querySelector('canvas')
    if (!el || !caption || !canvas || !canDraw2D(canvas)) return
    let ring: HeroRing | null = null
    let stopped = false
    const wake = () => ring?.wake()
    // Wait for the fonts, so the canvas text is drawn in the final face.
    void (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
      if (stopped) return
      ring = new HeroRing(el, caption, reduced, onLoop)
      ring.start()
      document.addEventListener('visibilitychange', wake)
    })
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', wake)
      ring?.destroy()
    }
  }, [stage, cap, reduced, onLoop])
}

const CYCLES = findCycles(X207.edges)
const SPARK_MAX = Math.max(...X207.edges.map((e) => e[2]))
const RING = 2 * Math.PI * 14

const Play = () => (
  <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M3 1.8v6.4a.6.6 0 0 0 .9.5l5-3.2a.6.6 0 0 0 0-1L3.9 1.3a.6.6 0 0 0-.9.5Z" fill="currentColor" />
  </svg>
)

/** Right under the hero: the macOS window that replays epoch 8. On a wide screen the page pins it and, as you scroll, it grows from a card to the full screen (GSAP ScrollTrigger). */
export function Showcase() {
  const reduced = usePrefersReducedMotion()
  const sec = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const win = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const cap = useRef<HTMLParagraphElement>(null)
  const [loop, setLoop] = useState(0)
  useRing(ring, cap, reduced, setLoop)

  useEffect(() => {
    const s = sec.current
    const st = stage.current
    const w = win.current
    if (!s || !st || !w) return
    const mm = gsap.matchMedia()
    mm.add('(min-width: 961px) and (prefers-reduced-motion: no-preference)', () => {
      s.dataset.fx = ''
      // the card the window starts as: the page column wide, a little shorter than the screen
      const cardW = () => Math.min(1120, st.clientWidth - 32)
      const cardH = () => Math.min(640, st.clientHeight - 140)
      // the full screen ends under the fixed bar (64px), so the title bar stays in sight
      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        scrollTrigger: { trigger: st, start: 'top top', end: '+=140%', pin: true, scrub: 0.8, invalidateOnRefresh: true },
      })
      tl.fromTo(w, { width: cardW, height: cardH, borderRadius: 18 }, { width: () => st.clientWidth, height: () => st.clientHeight - 64, borderRadius: 0, duration: 1 })
        .to({}, { duration: 0.35 }) // hold the full screen a moment before the page moves on
      return () => {
        delete s.dataset.fx
      }
    })
    return () => mm.revert()
  }, [])

  return (
    <section className="showcase" id="showcase" ref={sec} aria-label={`Epoch ${X207.epoch}, replayed from chain data`}>
      <div className="show-stage" ref={stage}>
        <div className="show-win-wrap col">
          <div ref={win} className="show-win">
            <Mac
              title={
                <>
                  <b>{X207.circle}</b> · epoch {X207.epoch} · <span className="mono">{EPOCH8.contract}</span>
                </>
              }
              action={
                <a className="win-replay" href={LIVE.epoch8Stats}>
                  <span aria-hidden="true">
                    <Play />
                  </span>
                  Replay
                </a>
              }
            >
              <div className="win-body">
                <aside className="win-side" aria-label={`The ${EPOCH8.members} members of epoch ${X207.epoch}`}>
                  <p className="side-h">
                    Members <span className="side-count">{EPOCH8.members}</span>
                  </p>
                  <ul>
                    {X207.outcome.map((o, i) => (
                      <li key={i}>
                        <Face tone={TONE[o]} size={22} mood={MOOD[o]} />
                        <span className="mono side-name">{labelOf(i)}</span>
                        <span className="side-code mono" style={{ ['--tone' as string]: TONE[o] }}>{STATUS[o][1]}</span>
                        <span className="mono side-net">{Math.abs(NET[i]).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                </aside>
                <div className="win-main">
                  <dl className="win-stats">
                    <div className="kpi">
                      <dt>
                        <span className="kpi-ic" aria-hidden="true">
                          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 3.5h5.5v6.5H2.5zM4 2h5.5v6.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
                        </span>
                        Owed
                      </dt>
                      <dd className="mono">{FIG.gross}</dd>
                      <dd className="kpi-sub">{EPOCH8.vouchers} vouchers · credit</dd>
                      <dd className="kpi-viz" aria-hidden="true">
                        <svg width="76" height="30" viewBox="0 0 76 30">
                          {X207.edges.map((e, i) => {
                            const h = 3 + (e[2] / SPARK_MAX) * 27
                            return <rect key={i} x={i * 3.2} y={30 - h} width="2" height={h} rx="1" />
                          })}
                        </svg>
                      </dd>
                    </div>
                    <div className="kpi">
                      <dt>
                        <span className="kpi-ic" aria-hidden="true">
                          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M9.6 4.2A4 4 0 1 0 10 7M9.8 1.8v2.6H7.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </span>
                        Cancelled in loops
                      </dt>
                      <dd className="mono">{FIG.clearedShare}</dd>
                      <dd className="kpi-sub">
                        {FIG.cleared} in {LOOPS} loops
                      </dd>
                      <dd className="kpi-viz" aria-hidden="true">
                        <svg width="34" height="34" viewBox="0 0 34 34">
                          <circle cx="17" cy="17" r="14" className="kpi-track" />
                          <circle cx="17" cy="17" r="14" className="kpi-arc" strokeDasharray={`${RING * (EPOCH8.clearedShare / 100)} ${RING}`} transform="rotate(-90 17 17)" />
                        </svg>
                      </dd>
                    </div>
                    <div className="kpi">
                      <dt>
                        <span className="kpi-ic" aria-hidden="true">
                          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6h8M7 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </span>
                        Moved
                      </dt>
                      <dd className="mono">{FIG.moved}</dd>
                      <dd className="kpi-sub">{FIG.movedShare} of owed · USDT</dd>
                      <dd className="kpi-viz" aria-hidden="true">
                        <span className="kpi-split">
                          <i style={{ width: SCALE.moved }} />
                          <i style={{ width: SCALE.loops }} />
                          <i style={{ width: SCALE.pairs }} />
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <div className="ringstage" ref={ring}>
                    <canvas aria-hidden="true" />
                    <p className="sr">Fifteen agents of epoch {X207.epoch} sit on a ring. Lines show who owes whom. One loop of debt at a time lights up and is cancelled.</p>
                    <p className="sr" ref={cap} aria-live="off" />
                  </div>
                  <section className="feed" aria-label={`Activity: the ${LOOPS} loops the solver cancelled in epoch ${X207.epoch}`}>
                    <header className="feed-h">
                      <span>Activity</span>
                      <span className="win-loops">{LOOPS} loops</span>
                    </header>
                    <ol>
                      {CYCLES.map((c, i) => (
                        <li key={i} data-on={i === loop || undefined}>
                          <span className="feed-faces" aria-hidden="true">
                            {c.members.slice(0, 4).map((m) => (
                              <Face key={m} tone={TONE[X207.outcome[m]]} size={22} mood={i === loop ? 'happy' : MOOD[X207.outcome[m]]} />
                            ))}
                            {c.members.length > 4 && <span className="feed-more">+{c.members.length - 4}</span>}
                          </span>
                          <span className="feed-text">
                            <b>
                              Loop {i + 1} · {c.members.length} agents
                            </b>
                            <LoopPath members={c.members} label={labelOf} />
                          </span>
                          <span className="feed-amt">−{fmt(c.amount)}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="feed-foot">contract › net positions unchanged ✓</p>
                  </section>
                </div>
              </div>
            </Mac>
          </div>
        </div>
      </div>
    </section>
  )
}
