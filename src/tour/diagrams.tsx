// FE-121: the small animated diagrams of the tour panel. Each one is drawn from recorded testnet numbers (sample.ts) or says it is an illustration.
// `still` (reduced motion) shows the last frame at once; every diagram also has a text equivalent, so nothing is said only in a picture.

import { useEffect, useState, type ReactNode } from 'react'
import { RING } from './sample'

/** Steps through `frames` frames, one every `ms`, then holds the last; with `still`, the last frame from the start. */
function useFrames(frames: number, ms: number, still: boolean): number {
  const [f, setF] = useState(still ? frames - 1 : 0)
  useEffect(() => {
    if (still) {
      setF(frames - 1)
      return
    }
    setF(0)
    let i = 0
    const t = window.setInterval(() => {
      i += 1
      setF(Math.min(i, frames - 1))
      if (i >= frames - 1) window.clearInterval(t)
    }, ms)
    return () => window.clearInterval(t)
  }, [frames, ms, still])
  return f
}

function Figure({ label, caption, legend, children, still }: { label: string; caption?: ReactNode; legend?: ReactNode; children: ReactNode; still: boolean }) {
  return (
    <figure className="tour-fig" data-still={still ? '' : undefined}>
      <div role="img" aria-label={label}>{children}</div>
      {legend}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

/** Step 1: the three reasons barter failed, and what answers each one here. */
export function Triad({ still }: { still: boolean }) {
  const rows: [string, string, string][] = [
    ['Matching', 'Two agents rarely want exactly what the other has.', 'Debts that form a ring cancel at the end of each epoch.'],
    ['Pricing', 'No shared price for a GPU hour or a tool seat.', 'An appraisal on NEAR AI Cloud (TEE) suggests a value in credit.'],
    ['Timing', 'Both sides must trade at the same moment.', 'Pay in credit now; only the net is settled, once per epoch.'],
  ]
  return (
    <ul className="tour-triad" data-still={still ? '' : undefined}>
      {rows.map(([name, problem, fix], i) => (
        <li key={name} style={{ ['--i' as string]: i }}>
          <strong>{name}</strong>
          <span className="tour-problem">{problem}</span>
          <span className="tour-fix">{fix}</span>
        </li>
      ))}
    </ul>
  )
}

/** Step 3: what the proof of an appraisal checks, and who checks each part. */
export function ProofChain({ still }: { still: boolean }) {
  const f = useFrames(4, 520, still)
  const rows = [
    ['Signature of the TEE', 'checked by x207, locally'],
    ['Intel TDX quote', 'checked by Phala'],
    ['GPU evidence', 'checked by NVIDIA NRAS'],
  ]
  return (
    <Figure still={still} label="What the proof checks: the signature by x207 itself, the Intel TDX quote via Phala, the GPU evidence via NVIDIA NRAS." caption="Advice only. The parties still agree on the price, and the circle contract does not read the appraisal.">
      <ol className="tour-chain">
        {rows.map(([what, who], i) => (
          <li key={what} data-on={f > i ? '' : undefined}>
            <span className="tour-tick" aria-hidden="true">{f > i ? '✓' : i + 1}</span>
            <span><strong>{what}</strong> {who}</span>
          </li>
        ))}
      </ol>
    </Figure>
  )
}

/** Step 4: a voucher is a signed, cumulative IOU; each new one replaces the last. Illustration. */
export function Voucher({ still }: { still: boolean }) {
  const f = useFrames(3, 900, still)
  const amounts = [10, 20, 32]
  return (
    <Figure still={still} label="Illustration of a voucher from alice to bob in epoch 184: each new voucher carries the running total and a higher sequence number; the last one, 32 credit at sequence 3, is the one that counts." caption="Illustration. Signing is the agent's job; this tour signs and sends nothing.">
      <dl className="tour-voucher">
        <dt>payer</dt><dd>alice</dd>
        <dt>payee</dt><dd>bob</dd>
        <dt>epoch</dt><dd>{RING.epoch}</dd>
        <dt>cumulativeAmount</dt><dd key={f} className="tour-bump">{amounts[f]} credit</dd>
        <dt>seq</dt><dd key={`s${f}`} className="tour-bump">{f + 1}</dd>
        <dt>signature</dt><dd>ed25519 (NEP-413 style)</dd>
      </dl>
    </Figure>
  )
}

/** Step 5: the credit limit comes from the stake; a voucher past the headroom is refused. Illustration. */
export function Credit({ still }: { still: boolean }) {
  const f = useFrames(3, 900, still)
  // stake 200, base_limit_ratio 80% => limit 160; 100 outstanding => 60 headroom; a voucher of 75 does not fit
  const pct = (n: number) => `${(n / 200) * 100}%`
  return (
    <Figure
      still={still}
      label="Illustration: a stake of 200 gives a limit of 160 at 80 percent. With 100 outstanding, 60 of headroom is left, so a new voucher of 75 is refused with ERR_INSUFFICIENT_CREDIT."
      caption={<>Illustration: stake 200, limit 80% of stake. Headroom = limit − outstanding − accepted but not yet registered.</>}
    >
      <div className="tour-credit">
        <div className="tour-credit-bar">
          <span className="tour-credit-limit" style={{ width: pct(160) }}>limit 160</span>
          <span className="tour-credit-used" style={{ width: pct(100) }}>100 used</span>
          {f >= 1 && <span className="tour-credit-try" data-refused={f >= 2 ? '' : undefined} style={{ left: pct(100), width: pct(75) }}>+75</span>}
        </div>
        <p className="tour-credit-out" data-show={f >= 2 ? '' : undefined}>
          <code>ERR_INSUFFICIENT_CREDIT</code> headroom 60 &lt; 75
        </p>
      </div>
    </Figure>
  )
}

const NODES: Record<string, { x: number; y: number }> = { alice: { x: 150, y: 26 }, bob: { x: 262, y: 150 }, dan2: { x: 38, y: 150 } }

/** What each leg of the ring owes before clearing and what is left of it after; the left-overs are what the net of the next step is made of. */
export const RING_LEFT = RING.legs.map((leg) => ({ ...leg, left: leg.amount - RING.cancelledPerLeg }))
const RING_LEFT_TOTAL = RING.gross - RING.cleared

/** The words under each leg number, frame by frame: what was owed, what cancels, what is left after clearing. */
export const RING_FRAME_UNITS = ['owed', 'cancels', 'left'] as const

/** Step 7: the ring of epoch 184; 24 cancels on every leg, the rest stays to settle. */
export function Ring({ still }: { still: boolean }) {
  const f = useFrames(3, 1100, still)
  const owes = RING.legs.map((l) => `${l.from} owes ${l.to} ${l.amount}`).join(', ')
  const left = RING_LEFT.map((l) => `${l.from} to ${l.to} ${l.left}`).join(', ')
  return (
    <Figure
      still={still}
      label={`Epoch ${RING.epoch}, before clearing: ${owes}. Clearing cancels ${RING.cancelledPerLeg} on each leg: ${RING.cleared} of ${RING.gross} credit, ${RING.clearedPct}. Left after clearing: ${left}; ${RING_LEFT_TOTAL} in all.`}
      legend={
        <table className="tour-ring-table">
          <caption className="tour-sr">Each debt of epoch {RING.epoch} before and after clearing</caption>
          <thead>
            <tr>
              <th scope="col">Debt</th>
              <th scope="col">Owed before</th>
              <th scope="col">Cancelled</th>
              <th scope="col" className="tour-ring-left">Left after clearing</th>
            </tr>
          </thead>
          <tbody>
            {RING_LEFT.map((l) => (
              <tr key={l.from}>
                <th scope="row">
                  {l.from} <span aria-hidden="true">→</span>
                  <span className="tour-sr">owes</span> {l.to}
                </th>
                <td>{l.amount}</td>
                <td>−{RING.cancelledPerLeg}</td>
                <td className="tour-ring-left" data-on={f >= 2 ? '' : undefined}>{l.left}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{RING.gross}</td>
              <td>−{RING.cleared}</td>
              <td className="tour-ring-left" data-on={f >= 2 ? '' : undefined}>{RING_LEFT_TOTAL}</td>
            </tr>
          </tfoot>
        </table>
      }
      caption={<>Epoch {RING.epoch}, testnet: gross {RING.gross}, cleared {RING.cleared} ({RING.clearedPct}). The {RING_LEFT_TOTAL} left is settled as one net amount per member.</>}
    >
      <svg className="tour-ring-svg" viewBox="0 0 300 190" aria-hidden="true" focusable="false">
        <defs>
          <marker id="tour-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="currentColor" />
          </marker>
        </defs>
        {RING.legs.map((leg) => {
          const a = NODES[leg.from]
          const b = NODES[leg.to]
          const mx = (a.x + b.x) / 2
          const my = (a.y + b.y) / 2
          // pull the label out of the triangle, away from its centre
          const cx = 150
          const cy = 108
          const lx = mx + (mx - cx) * 0.5
          const ly = my + (my - cy) * 0.5
          const left = leg.amount - RING.cancelledPerLeg
          return (
            <g key={leg.from} className="tour-leg" data-cleared={f >= 1 ? '' : undefined} data-frame={RING_FRAME_UNITS[f]}>
              <line x1={a.x + (b.x - a.x) * 0.16} y1={a.y + (b.y - a.y) * 0.16} x2={a.x + (b.x - a.x) * 0.82} y2={a.y + (b.y - a.y) * 0.82} markerEnd="url(#tour-head)" />
              <text x={lx} y={ly} textAnchor="middle">
                {f === 0 ? leg.amount : f === 1 ? `${leg.amount} − ${RING.cancelledPerLeg}` : left}
                <tspan className="tour-leg-unit" x={lx} dy="12">
                  {RING_FRAME_UNITS[f]}
                </tspan>
              </text>
            </g>
          )
        })}
        {Object.entries(NODES).map(([name, p]) => (
          <g key={name} className="tour-node">
            <circle cx={p.x} cy={p.y} r="20" />
            <text x={p.x} y={p.y + 4} textAnchor="middle">{name}</text>
          </g>
        ))}
      </svg>
    </Figure>
  )
}

/** Step 7: after clearing, each member settles one net amount. */
export function Net({ still }: { still: boolean }) {
  const f = useFrames(2, 700, still)
  const max = 8
  return (
    <Figure
      still={still}
      label={`Net of epoch ${RING.epoch}: alice pays 8 USDT, bob receives 7, dan2 receives 1. ${RING.moved} USDT moved for ${RING.gross} credit of trades, ${RING.movedPct}.`}
      caption={<>{RING.moved} mock USDT moved for {RING.gross} credit of trades ({RING.movedPct}). 1 credit settles as 1 USDT.</>}
    >
      <ul className="tour-net">
        {RING.net.map((n) => (
          <li key={n.member} data-side={n.amount < 0 ? 'pay' : 'get'}>
            <span className="tour-net-name">{n.member}</span>
            <span className="tour-net-track">
              <span className="tour-net-bar" style={{ width: f >= 1 ? `${(Math.abs(n.amount) / max) * 50}%` : '0%' }} />
            </span>
            <span className="tour-net-amount">{n.amount < 0 ? `pays ${-n.amount}` : `gets ${n.amount}`}</span>
          </li>
        ))}
      </ul>
    </Figure>
  )
}

/** Step 9: what the DAO can and cannot do to the circle contract. */
export function Dao({ still }: { still: boolean }) {
  return (
    <Figure still={still} label="The Sputnik DAO owns the circle contract. It can change parameters within coded ranges, admit members, register asset classes and upgrade through a timelock. It cannot withdraw the pool.">
      <div className="tour-dao">
        <ul aria-label="The DAO can">
          <li><code>set_params</code> within coded ranges</li>
          <li><code>admit_member</code></li>
          <li>register asset classes</li>
          <li>upgrade, behind a timelock</li>
        </ul>
        <p className="tour-dao-no">It cannot withdraw the pool.</p>
      </div>
    </Figure>
  )
}
