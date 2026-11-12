import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { EPOCH8 } from '../facts'
import { FIG, LOOPS } from '../v4/epoch'
import { mountStory3D } from '../v4/engine/scene3d.js'
import { canDraw2D } from '../v4/HeroRing'
import usdtLogo from '../assets/usdt.png'

gsap.registerPlugin(ScrollTrigger, SplitText)

const ICON = {
  owed: 'M2.5 3.5h5.5v6.5H2.5zM4 2h5.5v6.5',
  cancel: 'M9.6 4.2A4 4 0 1 0 10 7M9.8 1.8v2.6H7.2',
}

function TallyIcon({ kind }: { kind: keyof typeof ICON }) {
  return (
    <span className="tally-ic" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12">
        <path d={ICON[kind]} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

const STEPS = ['Open', 'Clearing', 'Commit', 'Payment', 'Finalized']

const CHAPTERS = [
  { k: '01 · open', h: 'Agents pay with vouchers.', p: <>{EPOCH8.vouchers} vouchers add up to {FIG.gross} owed. Nothing moves on chain yet.</> },
  { k: '02 · clearing', h: 'Loops cancel.', p: <>An open solver cancels debts that run in a circle. The contract checks every result.</> },
  { k: '03 · commit', h: 'One amount per agent.', p: <>Fifteen agents, fourteen net amounts. One is flat.</> },
  { k: '04 · payment', h: 'Debtors pay in once.', p: <>Five pay. The sixth misses, so {FIG.defaultDue} comes out of its stake.</> },
  { k: '05 · finalized', h: 'Creditors are paid.', p: <>Every agent gets its own code: 200, 202 or 409. That is the 207.</> },
]

/** Scroll is the timeline, full screen: the epoch in 3D fills the screen and the words of each step sit over it on the left. The page pins the stage for five screens.
 * The scene engine (engine/scene3d.js) draws the canvas, fills the `data-k` readouts, toggles `.chapter.is-on` and wires the `data-chapter` buttons.
 * GSAP adds the rest on a wide screen: the stage opens from a rounded card to the full screen as it comes in, and each step's words rise into place. */
export function Story() {
  const story = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = story.current
    const canvas = root?.querySelector('canvas')
    if (!root || !canvas || !canDraw2D(canvas)) return
    const scene = mountStory3D(root, { flat: true })
    return () => scene.destroy()
  }, [])

  useEffect(() => {
    const root = story.current
    const stage = root?.querySelector<HTMLElement>('.stage')
    if (!root || !stage) return
    const mm = gsap.matchMedia()
    mm.add('(min-width: 961px) and (prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(
        stage,
        { clipPath: 'inset(7% 6% 7% 6% round 32px)' },
        { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none', scrollTrigger: { trigger: root, start: 'top bottom', end: 'top top', scrub: true } },
      )
      const splits = [...root.querySelectorAll<HTMLElement>('.chapter')].map((c) => SplitText.create(c.querySelectorAll('h2, .chapter-p'), { type: 'lines,words', mask: 'lines' }))
      let shown = -1
      ScrollTrigger.create({
        trigger: root,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          const k = Math.min(STEPS.length - 1, Math.floor(self.progress * STEPS.length + 1e-6))
          if (k === shown) return
          shown = k
          gsap.fromTo(splits[k].words, { yPercent: 115 }, { yPercent: 0, duration: 0.8, ease: 'expo.out', stagger: 0.022, overwrite: true })
        },
      })
      return () => splits.forEach((s) => s.revert())
    })
    return () => mm.revert()
  }, [])

  return (
    <div className="story" id="how" ref={story} data-story3d>
      <section className="stage" data-scene3d aria-label="One epoch of the x207 circle, played by scrolling">
        <div className="stage-ring">
          <canvas aria-hidden="true" />
          <p className="sr">Fifteen agents on a ring in 3D. Vouchers arch between them, loops cancel, and each agent settles one net amount with the circle contract in the middle. Drag to turn the circle.</p>
          <div className="scene-tip" hidden />
        </div>
        <div className="stage-say">
          <div className="chapters-text">
            {CHAPTERS.map((c, i) => (
              <div key={c.k} className={i ? 'chapter' : 'chapter is-on'}>
                <h2>{c.h}</h2>
                <p className="chapter-p">{c.p}</p>
              </div>
            ))}
          </div>
          <div className="chapters" role="group" aria-label="Jump to a step">
            {STEPS.map((s) => (
              <button key={s} type="button" data-chapter>{s}</button>
            ))}
          </div>
          <span className="sr" data-k="phase" />
          <span className="sr" data-k="caption" aria-live="polite" />
        </div>
        <dl className="tally">
          <div className="t-owed">
            <dt><TallyIcon kind="owed" />Owed between agents</dt>
            <dd><span className="mono" data-k="owed">0.00</span><small data-k="sub-owed">0 of {EPOCH8.vouchers} vouchers</small></dd>
          </div>
          <div className="t-cancel">
            <dt><TallyIcon kind="cancel" />Cancelled in loops</dt>
            <dd><span className="mono" data-k="cancelled">0.00</span><small data-k="sub-cancelled">0 of {LOOPS} loops</small></dd>
          </div>
          <div className="t-moved">
            <dt><span className="tally-ic tally-usdt" aria-hidden="true"><img src={usdtLogo} alt="" width="14" height="14" /></span>Moved as USDT</dt>
            <dd><span className="mono" data-k="moved">0.00</span><small data-k="sub-moved">nothing yet</small></dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
