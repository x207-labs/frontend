import { animate, m, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
import { useEffect, useRef, type PointerEvent } from 'react'
import { EPOCH8, LIVE } from './facts'
import { EASE_OUT, SPRING } from './tokens'
import { Ring } from './Ring'

const HERO_STAGE = 0.46 // members and vouchers drawn, before netting

const LINES = [
  { text: 'x402 lets agents pay.', accent: false },
  { text: 'x207 lets many agents', accent: true },
  { text: 'settle at once.', accent: true },
]

export function Hero() {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLElement>(null)
  const intro = useMotionValue(reduced ? HERO_STAGE : 0)
  useEffect(() => {
    if (reduced) {
      intro.set(HERO_STAGE)
      return
    }
    const play = animate(intro, HERO_STAGE, { duration: 2.8, delay: 0.3, ease: EASE_OUT })
    return () => play.stop()
  }, [intro, reduced])

  // Depth: three layers (glow, ring, glass chips) follow the pointer at different strengths, and the ring stands up as the page scrolls away.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const sx = useSpring(px, { stiffness: 90, damping: 18 })
  const sy = useSpring(py, { stiffness: 90, damping: 18 })
  const tiltX = useTransform(() => (reduced ? 0 : 52 - scrollYProgress.get() * 46 - sy.get() * 6))
  const tiltY = useTransform(() => (reduced ? 0 : sx.get() * 8))
  const ringY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 140])
  const nearX = useTransform(sx, (v) => v * -26)
  const nearY = useTransform(sy, (v) => v * -18)
  const farX = useTransform(sx, (v) => v * 12)
  const farY = useTransform(sy, (v) => v * 10)
  const copyY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : -90])
  const copyFade = useTransform(scrollYProgress, [0, 0.75], [1, 0])

  const onMove = (event: PointerEvent<HTMLElement>) => {
    if (reduced || event.pointerType !== 'mouse') return
    const box = event.currentTarget.getBoundingClientRect()
    px.set(((event.clientX - box.left) / box.width - 0.5) * 2)
    py.set(((event.clientY - box.top) / box.height - 0.5) * 2)
  }

  return (
    <section ref={ref} className="hero" onPointerMove={onMove} onPointerLeave={() => { px.set(0); py.set(0) }} aria-labelledby="hero-title">
      <m.div className="hero-copy" style={{ y: copyY, opacity: copyFade }}>
        <m.p className="eyebrow chip" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.05 }}>
          <span className="pulse" aria-hidden="true" /> Live on NEAR testnet · <code>{LIVE.contract}</code>
        </m.p>
        <h1 id="hero-title" className="hero-title">
          {LINES.map((line, i) => (
            <m.span
              key={line.text}
              className={line.accent ? 'line is-accent' : 'line'}
              initial={{ y: '0.45em', filter: 'blur(14px)' }}
              animate={{ y: 0, filter: 'blur(0px)' }}
              transition={{ ...SPRING, delay: 0.12 + i * 0.08, filter: { duration: 0.9, delay: 0.12 + i * 0.08, ease: EASE_OUT } }}
            >
              {`${line.text} `}
            </m.span>
          ))}
        </h1>
        <m.p className="hero-lead" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.42 }}>
          A mutual-credit settlement layer for x402 agent payments on NEAR. Agents in a circle pay each other with signed vouchers; at the end of each epoch the contract nets
          every position in one step, and only the net moves.
        </m.p>
        <m.div className="hero-actions" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.52 }}>
          <a className="btn is-primary" href="#how">See one epoch</a>
          <a className="btn" href="/stats">Open the dashboard</a>
        </m.div>
      </m.div>

      <div className="hero-visual">
        <m.div className="hero-glow" style={{ x: farX, y: farY }} aria-hidden="true" />
        <m.div className="hero-stage" style={{ y: ringY }}>
          <m.div className="hero-tilt" style={{ rotateX: tiltX, rotateY: tiltY }}>
            <div className={reduced ? 'hero-spin' : 'hero-spin is-spinning'}>
              <Ring progress={intro} label={`The circle of epoch 8: ${EPOCH8.members} members and the ${EPOCH8.vouchers} vouchers they registered`} />
            </div>
          </m.div>
        </m.div>
        <m.div className="hero-chips" style={{ x: nearX, y: nearY }} aria-hidden="true">
          <m.span className="glass-chip is-a" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...SPRING, delay: 1.1 }}>
            <b>{EPOCH8.vouchers}</b> vouchers
          </m.span>
          <m.span className="glass-chip is-b" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...SPRING, delay: 1.3 }}>
            <b>{EPOCH8.gross}</b> credit <span className="arrow">→</span> <b className="is-accent">{EPOCH8.moved}</b> USDT
          </m.span>
          <m.span className="glass-chip is-c" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...SPRING, delay: 1.5 }}>
            contract <b>{LIVE.version}</b>
          </m.span>
        </m.div>
      </div>

      <a className="scroll-cue" href="#how" aria-label="Scroll to the epoch story">
        <span />
      </a>
    </section>
  )
}
