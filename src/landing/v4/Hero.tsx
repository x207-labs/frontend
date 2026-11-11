import { useEffect, useRef, useState } from 'react'
import { EPOCH8, LIVE } from '../facts'
import { FIG, LOOPS } from './epoch'
import { X207 } from './engine/x207.js'
import { canDraw2D, HeroRing } from './HeroRing'
import { usePrefersReducedMotion } from './hooks'

const WORDS = ['API keys', 'datasets', 'GPU hours', 'licenses', 'one-time codes', 'rent']

/** The barter kind that rotates in the lede. Its width is fixed in CSS (min-width: 15ch), so the line never jumps. */
function ChipWord({ reduced }: { reduced: boolean }) {
  const [i, setI] = useState(0)
  const [out, setOut] = useState(false)
  useEffect(() => {
    if (reduced) return
    let swap = 0
    const tick = window.setInterval(() => {
      setOut(true)
      swap = window.setTimeout(() => {
        setI((n) => (n + 1) % WORDS.length)
        setOut(false)
      }, 250)
    }, 2400)
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(swap)
    }
  }, [reduced])
  return (
    <span className="chip">
      <span className={out ? 'out' : undefined}>{WORDS[i]}</span>
    </span>
  )
}

// The four small charts of the glass cards, drawn from the same epoch 8 data as the ring.
function MembersViz() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      {X207.outcome.map((o, i) => {
        const a = (i / 15) * 6.2832 - 1.5708
        return <circle key={i} cx={22 + 17 * Math.cos(a)} cy={22 + 17 * Math.sin(a)} r={2.6} opacity={0.9} style={{ fill: o === 'defaulted' ? 'var(--ds-default)' : 'var(--ds-settled)' }} />
      })}
    </svg>
  )
}

function VouchersViz() {
  const mx = Math.max(...X207.edges.map((e) => e[2]))
  return (
    <svg width="64" height="36" viewBox="0 0 64 36" aria-hidden="true">
      {X207.edges.map((e, i) => {
        const h = 4 + (e[2] / mx) * 30
        return <rect key={i} x={i * 2.66} y={36 - h} width={1.7} height={h} rx={0.8} opacity={0.85} style={{ fill: 'var(--ds-soft)' }} />
      })}
    </svg>
  )
}

function RatioViz() {
  const C = 2 * Math.PI * 17
  const f = EPOCH8.cleared / EPOCH8.gross
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx={22} cy={22} r={17} fill="none" stroke="rgba(190,205,235,.18)" strokeWidth={4} />
      <circle cx={22} cy={22} r={17} fill="none" strokeWidth={4} strokeLinecap="round" strokeDasharray={`${C * f} ${C}`} transform="rotate(-90 22 22)" style={{ stroke: 'var(--ds-settled)' }} />
    </svg>
  )
}

function NetViz() {
  return (
    <svg width="64" height="36" viewBox="0 0 64 36" aria-hidden="true">
      <rect x={0} y={14} width={64} height={8} rx={4} fill="rgba(190,205,235,.16)" />
      <rect x={0} y={14} width={64 * (EPOCH8.moved / EPOCH8.gross)} height={8} rx={4} style={{ fill: 'var(--ds-soft)' }} />
    </svg>
  )
}

/** The first screen: the claim, one real loop at a time on the ring of epoch 8, and four glass cards with the real figures. */
export function Hero() {
  const reduced = usePrefersReducedMotion()
  const stage = useRef<HTMLDivElement>(null)
  const cap = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = stage.current
    const caption = cap.current
    const canvas = el?.querySelector('canvas')
    if (!el || !caption || !canvas || !canDraw2D(canvas)) return
    let ring: HeroRing | null = null
    let stopped = false
    const wake = () => ring?.wake()
    // Wait for the fonts, so the canvas text and the card layout the ring measures are the final ones.
    void (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
      if (stopped) return
      ring = new HeroRing(el, caption, reduced)
      ring.start()
      document.addEventListener('visibilitychange', wake)
    })
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', wake)
      ring?.destroy()
    }
  }, [reduced])

  return (
    <section className="hero" aria-labelledby="hero-h">
      <div className="col hero-copy">
        <p className="eyebrow agent">
          <i aria-hidden="true" />x402 · NEAR testnet · epoch {X207.epoch} replayed from chain data
        </p>
        <h1 id="hero-h">
          Many agent payments. <span>One net settlement.</span>
        </h1>
        <p className="lede">
          x402 agents pay each other with signed vouchers, or in <ChipWord reduced={reduced} />. Once an epoch a NEAR contract cancels the loops, and each agent settles one net amount.
        </p>
        <div className="cta">
          <a className="btn glow" href="#story">
            Watch epoch {X207.epoch} <span className="arr" aria-hidden="true">↓</span>
          </a>
          <a className="btn" href={LIVE.dashboard}>
            Open the dashboard <span className="arr" aria-hidden="true">↗</span>
          </a>
        </div>
      </div>

      <div className="col ringstage" ref={stage}>
        <canvas aria-hidden="true" />
        <p className="sr">
          Fifteen agents of epoch {X207.epoch} sit on a ring. Lines show who owes whom. One loop of debt at a time lights up and is cancelled.
        </p>
        <article className="kpi k1" data-anchor="left">
          <header><b aria-hidden="true">{EPOCH8.members}</b>Members</header>
          <div className="v">{EPOCH8.members}<small>agents</small></div>
          <p>in one circle, each with a stake</p>
          <MembersViz />
        </article>
        <article className="kpi k2" data-anchor="left">
          <header><b aria-hidden="true">{EPOCH8.vouchers}</b>Vouchers signed</header>
          <div className="v num">{FIG.gross}<small>credit owed</small></div>
          <p>{EPOCH8.vouchers} cumulative vouchers, no transfer yet</p>
          <VouchersViz />
        </article>
        <article className="kpi k3" data-anchor="right">
          <header><b aria-hidden="true">{LOOPS}</b>Cancelled in loops</header>
          <div className="v num">{FIG.clearedShare}</div>
          <p><span className="num">{FIG.cleared}</span> credit that never moves</p>
          <RatioViz />
        </article>
        <article className="kpi k4" data-anchor="right">
          <header><b aria-hidden="true">{EPOCH8.movements}</b>Net settled</header>
          <div className="v num">{FIG.moved}<small>mock USDT</small></div>
          <p>in {EPOCH8.movements} transfers, {FIG.movedShare} of what was owed</p>
          <NetViz />
        </article>
        <p className="livecap agent" ref={cap} aria-live="off">
          <span className="k">solver ›</span> finding loops…
        </p>
      </div>
    </section>
  )
}
