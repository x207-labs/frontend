import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { LIVE } from '../facts'
import type { LaptopScene } from './engine/laptop'
import { X207, type Outcome } from './engine/x207.js'
import { hasWebGL, usePrefersReducedMotion } from './hooks'

// The final orbs: one per agent of epoch 8, tinted by how it settled.
const TINT: Record<Outcome, string> = { paid: '#c9d2ff', claimed: '#c8f53c', claimable: '#a6dcff', defaulted: '#ff5a45', flat: '#ffffff' }

const span = (x: number, a: number, b: number) => Math.min(1, Math.max(0, (x - a) / (b - a)))
const io3 = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const STILL = 0.19 // the laptop open and still: the progress used under reduced motion

type Mode = 'live' | 'still' | 'static'

/**
 * The last section: a laptop opens, turns to face you and zooms until its screen fills the window, and then the page moves on to the dashboard.
 *  - live: the section is pinned for 3.4 screens; the scroll progress drives one three.js scene (engine/laptop.ts) on a transparent canvas, and the live dashboard
 *    (an iframe) is mapped onto its screen. Raw progress is negative while the section scrolls in, so the lid starts opening on the way.
 *  - still: reduced motion with WebGL. The laptop stands open and still; nothing is pinned and nothing moves the visitor on.
 *  - static: no WebGL (or the scene failed). Only the copy and the link remain.
 * The hand-off to the dashboard fires once, only after the visitor was above 80% on this visit, so Back never throws them forward again.
 */
export function NextDash() {
  const reduced = usePrefersReducedMotion()
  const [failed, setFailed] = useState(false)
  const mode: Mode = !hasWebGL() || failed ? 'static' : reduced ? 'still' : 'live'
  const sec = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const copy = useRef<HTMLDivElement>(null)
  const cue = useRef<HTMLSpanElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const scr = useRef<HTMLDivElement>(null)
  const dash = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const s = sec.current
    const st = stage.current
    const cp = copy.current
    const cv = canvas.current
    const sc = scr.current
    const da = dash.current
    if (mode === 'static' || !s || !st || !cp || !cv || !sc || !da) return
    const live = mode === 'live'
    const html = document.documentElement
    let laptop: LaptopScene | null = null
    let loading = false
    let disposed = false
    let raf = 0
    let onScreen = false
    let armed = false
    let gone = false
    const tilt: [number, number] = [0, 0]
    const tiltTo: [number, number] = [0, 0]

    const ensure = () => {
      if (laptop || loading || disposed) return
      loading = true
      // three.js loads as its own chunk, only when the visitor gets near this section.
      void import('./engine/laptop')
        .then(({ LaptopScene }) => {
          if (disposed) return
          laptop = new LaptopScene(cv, sc, da, LIVE.dashboard, 'gray')
          paint()
        })
        .catch(() => {
          if (!disposed) setFailed(true)
        })
    }

    function paint() {
      if (disposed) return
      const W = st!.clientWidth
      const H = st!.clientHeight
      if (!W || !H) return
      const rect = s!.getBoundingClientRect()
      const travel = rect.height - H
      const pr = live ? (travel > 0 ? -rect.top / travel : 0) : STILL
      const p = Math.min(1, Math.max(0, pr))
      if (pr > -1.2) ensure() // also from scrolling, in case the observer is late (a hidden tab)
      html.toggleAttribute('data-next', live && p > 0.02 && rect.top <= 0)
      const grow = live ? io3(span(pr, 0.2, 0.84)) : 0
      tilt[0] += (tiltTo[0] - tilt[0]) * 0.12
      tilt[1] += (tiltTo[1] - tilt[1]) * 0.12
      const fade = String(1 - span(grow, 0, 0.22))
      cp!.style.opacity = fade
      cp!.style.transform = `translateY(${(-50 * grow).toFixed(1)}px)`
      if (cue.current) cue.current.style.opacity = fade
      if (laptop) {
        const portrait = W < H
        // the free area under the copy: the laptop is laid out inside it
        laptop.set(pr, live ? tilt : [0, 0], { top: cp!.offsetTop + cp!.offsetHeight + (portrait ? 34 : 26), bottom: H - 18, maxW: portrait ? W * 0.94 : Math.min(900, W * 0.64) }, W, H)
      }
      if (!live) return
      if (p < 0.8) armed = true
      if (armed && !gone && p >= 0.985) {
        gone = true
        location.assign(LIVE.dashboard)
      }
    }

    const loop = () => {
      raf = 0
      if (!onScreen || disposed) return
      paint()
      raf = requestAnimationFrame(loop)
    }
    const near = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) ensure()
    }, { rootMargin: '150% 0px' })
    near.observe(s)
    const visible = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting
      if (onScreen && live && !raf) raf = requestAnimationFrame(loop)
    })
    visible.observe(s)

    const onMove = (e: PointerEvent) => {
      tiltTo[0] = (e.clientX / window.innerWidth) * 2 - 1
      tiltTo[1] = (e.clientY / window.innerHeight) * 2 - 1
    }
    let pending = false
    const onScroll = () => {
      if (pending) return
      pending = true
      requestAnimationFrame(() => {
        pending = false
        paint()
      })
    }
    const onResize = () => paint()
    if (live) {
      s.addEventListener('pointermove', onMove)
      window.addEventListener('scroll', onScroll, { passive: true })
    }
    window.addEventListener('resize', onResize)
    paint()

    return () => {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      near.disconnect()
      visible.disconnect()
      s.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      html.removeAttribute('data-next')
      laptop?.dispose()
      da.removeAttribute('src')
      da.style.opacity = '0'
    }
  }, [mode])

  return (
    <section className={`next-dash is-${mode}`} id="next" aria-labelledby="next-h" ref={sec}>
      <div className="next-stage" ref={stage}>
        <div className="next-copy" ref={copy}>
          <div className="orbs" aria-hidden="true">
            {X207.outcome.map((o, i) => (
              <span key={i} className="orb" style={{ '--c': TINT[o], '--d': `${(i * 0.37) % 6}s` } as CSSProperties} />
            ))}
          </div>
          <h2 id="next-h">Step inside <span>the live circle.</span></h2>
          <p>The dashboard the agents use, reading the circle contract on NEAR testnet.</p>
          <a className="btn glow" href={LIVE.dashboard}>
            Open the dashboard <span className="arr" aria-hidden="true">↗</span>
          </a>
        </div>
        {mode !== 'static' && (
          <>
            <canvas className="laptop-gl" ref={canvas} aria-hidden="true" />
            <div className="laptop-scr" ref={scr}>
              <iframe className="laptop-dash" ref={dash} title="The x207 dashboard on the laptop screen" aria-hidden="true" tabIndex={-1} />
            </div>
          </>
        )}
        {mode === 'live' && (
          <span className="cue" ref={cue} aria-hidden="true">
            Keep scrolling<i />
          </span>
        )}
      </div>
    </section>
  )
}
