// FE-070: the idea of x207 in one moving picture. Three members owe each other in a loop; the loop cancels and two small payments are left.
// Before: A owes B 10, B owes C 8, C owes A 7. Clearing cancels 7 round the loop, so A pays B 3, B pays C 1, and C pays nothing.
// The animation is CSS only and stops on the "after" picture when the reader prefers reduced motion.
import { Mascot } from './Mascot'

const NODES = [
  { id: 'A', x: 160, y: 40, color: '#3987e5' },
  { id: 'B', x: 272, y: 178, color: '#d95926' },
  { id: 'C', x: 48, y: 178, color: '#199e70' },
] as const

const R = 22

type Edge = { from: number; to: number; before: number; after: number }
const EDGES: Edge[] = [
  { from: 0, to: 1, before: 10, after: 3 },
  { from: 1, to: 2, before: 8, after: 1 },
  { from: 2, to: 0, before: 7, after: 0 },
]

// A slightly curved path from the edge of one node to the edge of the next.
function arc(a: (typeof NODES)[number], b: (typeof NODES)[number]) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const sx = a.x + ux * (R + 4)
  const sy = a.y + uy * (R + 4)
  const ex = b.x - ux * (R + 10)
  const ey = b.y - uy * (R + 10)
  const cx = (sx + ex) / 2 - uy * 18
  const cy = (sy + ey) / 2 + ux * 18
  return { d: `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`, lx: (sx + ex) / 2 - uy * 30, ly: (sy + ey) / 2 + ux * 30 }
}

export function LoopMotif({ className = '' }: { className?: string }) {
  return (
    <figure className={`loop-motif ${className}`.trim()}>
      <svg viewBox="0 0 320 230" role="img" aria-label="Three debts in a loop: 10, 8 and 7 credit. The loop cancels, so only 3 and 1 credit are paid.">
        <defs>
          {NODES.map((n, i) => (
            <marker key={n.id} id={`loop-arrow-${i}`} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={n.color} />
            </marker>
          ))}
        </defs>
        {EDGES.map((e, i) => {
          const a = NODES[e.from]
          const p = arc(a, NODES[e.to])
          return (
            <g key={i} style={{ color: a.color }} className={e.after === 0 ? 'loop-edge is-gone' : 'loop-edge'}>
              <path className="loop-before" d={p.d} strokeWidth={e.before * 0.7} markerEnd={`url(#loop-arrow-${e.from})`} />
              {e.after > 0 && <path className="loop-after" d={p.d} strokeWidth={Math.max(2, e.after * 0.9)} markerEnd={`url(#loop-arrow-${e.from})`} />}
              <path className="loop-pulse" d={p.d} />
              <text className="loop-num loop-num-before" x={p.lx} y={p.ly} textAnchor="middle">{e.before}</text>
              <text className="loop-num loop-num-after" x={p.lx} y={p.ly} textAnchor="middle">{e.after === 0 ? '0' : e.after}</text>
            </g>
          )
        })}
        {NODES.map((n) => (
          // v6: the three members are mascots; the ones left paying look surprised, the one that pays nothing smiles
          <g key={n.id} transform={`translate(${n.x - R - 4} ${n.y - R - 4})`}>
            <Mascot id={`loop-${n.id}`} size={(R + 4) * 2} mood={n.id === 'C' ? 'happy' : 'smile'} />
          </g>
        ))}
      </svg>
      <figcaption aria-hidden="true">
        <span className="loop-cap-before"><strong>25</strong> credit owed</span>
        <span className="loop-cap-after"><strong>4</strong> credit paid</span>
      </figcaption>
    </figure>
  )
}
