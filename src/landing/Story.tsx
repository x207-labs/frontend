import { m, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useRef, useState } from 'react'
import { EDGES, EPOCH8, NET } from './facts'
import { Ring } from './Ring'
import { STAGES } from './tokens'

// FE-044: one epoch, told by the scroll. The section is four screens tall; its sticky stage holds the same ring as the hero, and the scroll position is the ring's progress.
// Under reduced motion the ring does not scrub: it jumps to the finished picture of the step being read.

const STEPS = [
  {
    kicker: '01 · Stake',
    title: 'Every member stakes first.',
    body: 'An agent joins a circle with a stake. Its credit limit grows from its own settlement history, inside one bound, so whatever it signs for is backed before it is accepted.',
    code: 'limit ≤ stake',
  },
  {
    kicker: '02 · Pay with vouchers',
    title: 'Payments are signed, not sent.',
    body: `Inside an epoch each x402 payment is a signed, cumulative voucher. The request is served at once and no token moves yet. Epoch 8 of the testnet circle x207-v013 registered ${EPOCH8.vouchers} vouchers worth ${EPOCH8.gross} in credit.`,
    code: 'register_cumulative',
  },
  {
    kicker: '03 · Net and clear',
    title: 'The circle is netted once.',
    body: `At the close every member is left with one net position. The solver cancels debts that run in a loop: ${EPOCH8.cleared} of credit (${EPOCH8.clearedShare}%) in epoch 8, and no net position changed.`,
    code: 'close_epoch → submit_clearing → commit_epoch',
  },
  {
    kicker: '04 · Settle',
    title: 'Only the net moves.',
    body: `Debtors pay their net in and creditors claim theirs out: ${EPOCH8.moved} USDT over ${EPOCH8.movements} net positions, ${EPOCH8.movedShare}% of the gross. In epoch 8 ${EPOCH8.paid} debtors paid; one missed its ${EPOCH8.defaultDue} due and finalize_epoch covered it from its stake.`,
    code: 'finalize_epoch',
  },
] as const

// Where the ring stands while each step is read, and where it rests when motion is reduced.
const STEP_START = [0, 0.18, 0.47, 0.7]
const STEP_REST = [STAGES.members[1], STAGES.vouchers[1], STAGES.net[1], 1]
const stepAt = (p: number) => STEP_START.reduce((found, start, i) => (p >= start ? i : found), 0)

// The counters follow the drawing exactly: a voucher counts once its line is half drawn, an arrow once it is half drawn.
const voucherStart = (i: number) => STAGES.vouchers[0] + ((STAGES.vouchers[1] - STAGES.vouchers[0] - 0.08) * i) / EDGES.length
const movers = NET.map((net, member) => ({ net, member })).filter((x) => x.net !== 0)
const moverStart = (i: number) => STAGES.settle[0] + ((STAGES.settle[1] - STAGES.settle[0] - 0.06) * i) / movers.length
const vouchersAt = (p: number) => EDGES.filter((_, i) => p >= voucherStart(i) + 0.04).length
const grossAt = (p: number) => EDGES.reduce((sum, [, , credit], i) => (p >= voucherStart(i) + 0.04 ? sum + credit : sum), 0)
const movedAt = (p: number) => movers.reduce((sum, { net }, i) => (net > 0 && p >= moverStart(i) + 0.03 ? sum + net : sum), 0)
const movesAt = (p: number) => movers.filter((_, i) => p >= moverStart(i) + 0.03).length

export function Story() {
  const ref = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const scrub = useTransform(scrollYProgress, [0.02, 0.94], [0, 1])
  const ring = useTransform(() => (reduced ? STEP_REST[stepAt(scrub.get())] : scrub.get()))
  const [step, setStep] = useState(0)
  useMotionValueEvent(scrub, 'change', (p) => setStep(stepAt(p)))

  const vouchers = useTransform(ring, (p) => String(vouchersAt(p)))
  const gross = useTransform(ring, (p) => grossAt(p).toFixed(2))
  const moved = useTransform(ring, (p) => movedAt(p).toFixed(2))
  const moves = useTransform(ring, (p) => String(movesAt(p)))
  const bar = useTransform(scrollYProgress, [0, 1], [0, 1])

  return (
    <section ref={ref} id="how" className="story" aria-labelledby="story-title">
      <div className="story-stage">
        <div className="story-copy">
          <p className="eyebrow">How one epoch works</p>
          <h2 id="story-title" className="story-title">Many lines become a few arrows.</h2>
          <ol className="story-steps">
            {STEPS.map((s, i) => (
              <li key={s.kicker} className={i === step ? 'story-step is-active' : 'story-step'} aria-current={i === step ? 'step' : undefined}>
                <p className="story-kicker">{s.kicker}</p>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <code className="story-code">{s.code}</code>
              </li>
            ))}
          </ol>
          <div className="story-track" aria-hidden="true">
            <m.span style={{ scaleX: bar }} />
          </div>
        </div>
        <div className="story-visual">
          <Ring progress={ring} label={`Testnet epoch 8 on ${EPOCH8.contract}, step ${step + 1} of 4: ${STEPS[step].title}`} />
          <dl className="story-readout glass">
            <div><dt>Vouchers</dt><dd><m.span>{vouchers}</m.span><small>/ {EPOCH8.vouchers}</small></dd></div>
            <div><dt>Credit</dt><dd><m.span>{gross}</m.span></dd></div>
            <div><dt>Movements</dt><dd><m.span>{moves}</m.span><small>/ {EPOCH8.movements}</small></dd></div>
            <div className="is-accent"><dt>USDT moved</dt><dd><m.span>{moved}</m.span></dd></div>
          </dl>
          <p className="story-source">{EPOCH8.tag}, mock USDT</p>
        </div>
      </div>
    </section>
  )
}
