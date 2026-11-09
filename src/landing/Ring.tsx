import { m, useTransform, type MotionValue } from 'motion/react'
import { useId } from 'react'
import { DEFAULTER, EDGES, NET } from './facts'
import { STAGES } from './tokens'

// FE-044: the circle of epoch 8 as one picture. The 15 members sit on a ring, the 24 obligations are drawn between them as they were registered, and at the end only the net
// positions move, to and from the contract in the middle. One progress value (0..1) drives every part, so the hero can play it and the story can scrub it with the scroll.
//   0.00-0.14 members appear  ·  0.20-0.44 vouchers drawn  ·  0.50-0.64 gross fades, net labels  ·  0.74-0.92 net arrows

const R = 300
const CORE = 54
const N = NET.length
// Members are placed 4 slots apart (4 and 15 share no factor), so trading neighbours sit across the ring and the vouchers cross it instead of hugging the edge.
const slot = (member: number) => (member * 4) % N
const angle = (member: number) => (slot(member) / N) * Math.PI * 2 - Math.PI / 2
const at = (member: number, radius = R) => [Math.cos(angle(member)) * radius, Math.sin(angle(member)) * radius] as const
const f = (n: number) => n.toFixed(1)

function Voucher({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const [from, to, amount] = EDGES[index]
  const [x1, y1] = at(from)
  const [x2, y2] = at(to)
  const [a, b] = STAGES.vouchers
  const start = a + ((b - a - 0.08) * index) / EDGES.length
  const length = useTransform(progress, [start, start + 0.08], [0, 1])
  const opacity = useTransform(progress, [STAGES.net[0], STAGES.net[1]], [1, 0.12])
  const d = `M${f(x1)} ${f(y1)} Q${f((x1 + x2) * 0.32)} ${f((y1 + y2) * 0.32)} ${f(x2)} ${f(y2)}`
  return <m.path className="ring-voucher" d={d} strokeWidth={0.8 + amount * 0.55} style={{ pathLength: length, opacity }} />
}

function Member({ member, progress }: { member: number; progress: MotionValue<number> }) {
  const [x, y] = at(member)
  const [lx, ly] = at(member, R + 44)
  const [a, b] = STAGES.members
  const start = a + ((b - a - 0.04) * slot(member)) / N
  const scale = useTransform(progress, [start, start + 0.05], [0, 1])
  const label = useTransform(progress, [STAGES.net[0] + 0.04, STAGES.net[1]], [0, 1])
  const net = NET[member]
  const role = net > 0 ? 'debtor' : net < 0 ? 'creditor' : 'even'
  const text = net > 0 ? `pays ${net.toFixed(2)}` : net < 0 ? `gets ${(-net).toFixed(2)}` : 'nets 0'
  return (
    <g className={`ring-member is-${role}${member === DEFAULTER ? ' is-default' : ''}`}>
      <m.g style={{ x, y, scale }}>
        <circle className="ring-stake" r={24} />
        <circle className="ring-node" r={13} />
      </m.g>
      <m.text className="ring-label" x={f(lx)} y={f(ly)} style={{ opacity: label }} textAnchor={lx > 20 ? 'start' : lx < -20 ? 'end' : 'middle'} dominantBaseline="middle">
        <tspan className="ring-id">m{String(member).padStart(2, '0')}</tspan>
        <tspan dx="6">{text}</tspan>
      </m.text>
    </g>
  )
}

function Settlement({ member, order, progress, ids }: { member: number; order: number; progress: MotionValue<number>; ids: string }) {
  const net = NET[member]
  const [a, b] = STAGES.settle
  const start = a + ((b - a - 0.06) * order) / 14
  const length = useTransform(progress, [start, start + 0.06], [0, 1])
  const [ox, oy] = at(member, R - 30)
  const [ix, iy] = at(member, CORE + 12)
  // A debtor pays into the contract, the contract pays a creditor: the arrow points the way the USDT moves.
  const d = net > 0 ? `M${f(ox)} ${f(oy)} L${f(ix)} ${f(iy)}` : `M${f(ix)} ${f(iy)} L${f(ox)} ${f(oy)}`
  return <m.path className={`ring-net ${net > 0 ? 'is-in' : 'is-out'}`} d={d} strokeWidth={1.4 + Math.abs(net) * 1.6} markerEnd={`url(#${ids}-${net > 0 ? 'in' : 'out'})`} style={{ pathLength: length, opacity: length }} />
}

const movers = NET.map((net, member) => ({ net, member })).filter((x) => x.net !== 0)

export function Ring({ progress, label }: { progress: MotionValue<number>; label: string }) {
  const core = useTransform(progress, [0, 0.08], [0.6, 1])
  // Two rings share the page (hero and story): the ids of the gradient and the markers must be unique.
  const ids = `r${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <svg className="ring" viewBox="-430 -430 860 860" role="img" aria-label={label}>
      <defs>
        <radialGradient id={`${ids}-glow`}>
          <stop offset="0" stopColor="var(--lp-accent)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--lp-accent)" stopOpacity="0" />
        </radialGradient>
        <marker id={`${ids}-in`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="ring-head is-in" />
        </marker>
        <marker id={`${ids}-out`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="ring-head is-out" />
        </marker>
      </defs>
      <circle r={R + 90} fill={`url(#${ids}-glow)`} />
      <circle className="ring-orbit" r={R} />
      <circle className="ring-orbit is-inner" r={R * 0.62} />
      <g className="ring-vouchers">
        {EDGES.map((_, i) => <Voucher key={i} index={i} progress={progress} />)}
      </g>
      <g className="ring-nets">
        {movers.map(({ member }, order) => <Settlement key={member} member={member} order={order} progress={progress} ids={ids} />)}
      </g>
      {NET.map((_, member) => <Member key={member} member={member} progress={progress} />)}
      <m.g className="ring-core" style={{ scale: core }}>
        <circle r={CORE} />
        <text y="-4" textAnchor="middle" dominantBaseline="middle">x207</text>
        <text className="ring-core-sub" y="20" textAnchor="middle" dominantBaseline="middle">circle contract</text>
      </m.g>
    </svg>
  )
}
