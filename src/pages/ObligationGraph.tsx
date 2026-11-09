import { useMemo } from 'react'
import { ApiError } from '../api/client'
import { useObligations } from '../api/queries'
import type { ObligationEdge, Obligations } from '../api/types'
import { NoEpoch } from '../components/NoEpoch'
import { QueryState } from '../components/QueryState'
import { useEpochSelection, useSelectedEpoch } from '../epoch'
import { decomposeCycles } from '../lib/cycles'
import { EDGES_PRUNED_NOTE, formatCredit, shortAccount } from '../lib/format'

const SIZE = 280
const CENTER = SIZE / 2
const RADIUS = 100

function positions(nodes: string[]): Map<string, { x: number; y: number }> {
  return new Map(
    nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1) - Math.PI / 2
      return [node, { x: CENTER + RADIUS * Math.cos(angle), y: CENTER + RADIUS * Math.sin(angle) }]
    }),
  )
}

type Mode = 'live' | 'before' | 'after'

function Graph({ title, edges, nodes, mode }: { title: string; edges: ObligationEdge[]; nodes: string[]; mode: Mode }) {
  const at = positions(nodes)
  return (
    <figure className="graph">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${title}, ${edges.length} edges`}>
        <defs>
          <marker id={`arrow-${mode}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {edges.map((e) => {
          const a = at.get(e.debtor)!
          const b = at.get(e.creditor)!
          const gone = mode === 'after' && e.remaining === '0'
          return (
            <line
              key={`${e.debtor}>${e.creditor}`}
              data-testid={`edge-${mode}-${shortAccount(e.debtor)}-${shortAccount(e.creditor)}`}
              className={gone ? 'edge edge-dim' : 'edge'}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              markerEnd={`url(#arrow-${mode})`}
            />
          )
        })}
        {nodes.map((n) => {
          const p = at.get(n)!
          return (
            <g key={n}>
              <circle className="node" cx={p.x} cy={p.y} r={5} />
              <text className="tick" x={p.x} y={p.y - 10} textAnchor="middle">
                {shortAccount(n)}
              </text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

function EdgeTable({ edges, staged }: { edges: ObligationEdge[]; staged: boolean }) {
  return (
    <div className="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Debtor</th>
          <th>Creditor</th>
          <th>Amount</th>
          {staged && <th>Cleared</th>}
          {staged && <th>Remaining</th>}
        </tr>
      </thead>
      <tbody>
        {edges.map((e) => (
          <tr key={`${e.debtor}>${e.creditor}`}>
            <td>{shortAccount(e.debtor)}</td>
            <td>{shortAccount(e.creditor)}</td>
            <td>{formatCredit(e.amount)}</td>
            {staged && <td>{formatCredit(e.cleared)}</td>}
            {staged && <td>{formatCredit(e.remaining)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
}

const ERROR_TEXT: Record<string, string> = {
  epoch_not_closed: 'This epoch is not closed yet, so there is no clearing.',
  epoch_not_found: 'Epoch not found.',
}

function Cleared({ live, cleared }: { live: Obligations; cleared: Obligations }) {
  const nodes = useMemo(
    () => [...new Set([...live.edges, ...cleared.edges].flatMap((e) => [e.debtor, e.creditor]))].sort(),
    [live, cleared],
  )
  const totalCleared = cleared.edges.reduce((sum, e) => sum + BigInt(e.cleared ?? '0'), 0n)
  const cycles = useMemo(
    () => decomposeCycles(cleared.edges.map((e) => ({ debtor: e.debtor, creditor: e.creditor, cleared: BigInt(e.cleared ?? '0') }))),
    [cleared],
  )
  return (
    <>
      <p>
        Cleared value: <strong>{formatCredit(totalCleared.toString())}</strong> credit.
      </p>
      <div className="graph-pair">
        <Graph title="Before clearing" edges={live.edges} nodes={nodes} mode="before" />
        <Graph title="After clearing" edges={cleared.edges} nodes={nodes} mode="after" />
      </div>
      {cycles.length > 0 && (
        <section aria-label="Cleared cycles">
          <h3>Cleared cycles</h3>
          <ul>
            {cycles.map((c, i) => (
              <li key={i}>
                {c.path.map(shortAccount).join(' → ')}: {formatCredit(c.amount.toString())} per edge
              </li>
            ))}
          </ul>
        </section>
      )}
      <EdgeTable edges={cleared.edges} staged />
    </>
  )
}

export function ObligationGraph() {
  const epoch = useSelectedEpoch()
  const pruned = useEpochSelection().selected?.edgesUnavailable === true
  const live = useObligations(epoch, 'live')
  const cleared = useObligations(epoch, 'cleared')
  if (epoch === null) return <NoEpoch />
  return (
    <>
      {pruned && <p className="state" role="note">{EDGES_PRUNED_NOTE}</p>}
      <QueryState
        query={live}
        loadingLabel="Loading obligations"
        isEmpty={(d) => d.edges.length === 0}
        empty={pruned ? 'The edges of this epoch were pruned on-chain and the indexer has none for it, so there is no graph to draw.' : 'No obligations registered in this epoch yet.'}
      >
        {(data) => (
          <>
            <p>
              {data.edgeCount} obligations worth {formatCredit(data.totalObligation)} credit.
            </p>
            <Graph
              title="Current epoch"
              edges={data.edges}
              nodes={[...new Set(data.edges.flatMap((e) => [e.debtor, e.creditor]))].sort()}
              mode="live"
            />
            <EdgeTable edges={data.edges} staged={false} />
          </>
        )}
      </QueryState>
      <h2>Before and after clearing</h2>
      {cleared.error instanceof ApiError && ERROR_TEXT[cleared.error.code] ? (
        <p className="state" role="status">{ERROR_TEXT[cleared.error.code]}</p>
      ) : (
        <QueryState
          query={cleared}
          loadingLabel="Loading clearing result"
          isEmpty={(d) => d.edges.length === 0}
          empty={pruned ? 'The cleared edges of this epoch were pruned on-chain and the indexer has none for it, so there is no graph to draw.' : 'Clearing has not been applied to this epoch yet.'}
        >
          {(data) => (live.data ? <Cleared live={live.data} cleared={data} /> : null)}
        </QueryState>
      )}
    </>
  )
}
