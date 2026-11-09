import { useMemo, useState } from 'react'
import { ApiError } from '../api/client'
import { useObligations } from '../api/queries'
import type { ObligationEdge, Obligations } from '../api/types'
import { NoEpoch } from '../components/NoEpoch'
import { QueryState } from '../components/QueryState'
import { useEpochSelection, useSelectedEpoch } from '../epoch'
import { decomposeCycles } from '../lib/cycles'
import { EDGES_PRUNED_NOTE, formatCredit, formatPercent, shortAccount } from '../lib/format'

// FE-070: one large map of the debts instead of three small ones. Each member is a coloured node (the colour follows the member, in the fixed order of
// the dataviz reference palette, dark steps, validated against the page surface); each debt is a curved arrow whose thickness is its amount. "Before"
// and "After clearing" are one map with a switch, so the same arrows visibly shrink when the loops cancel. The numbers stay one click away as a table.
const W = 640
const H = 420
const NODE_R = 24
const PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']

type Point = { x: number; y: number }
type Mode = 'live' | 'before' | 'after'
const keyOf = (e: { debtor: string; creditor: string }) => `${e.debtor}>${e.creditor}`
const units = (raw: string | null | undefined): number => Number(BigInt(raw ?? '0'))

function positions(nodes: string[]): Map<string, Point> {
  const rx = nodes.length <= 2 ? 200 : 230
  const ry = nodes.length <= 2 ? 0 : 140
  return new Map(
    nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1) + (nodes.length <= 2 ? Math.PI : -Math.PI / 2)
      return [node, { x: W / 2 + rx * Math.cos(angle), y: H / 2 + ry * Math.sin(angle) }]
    }),
  )
}

/** A curved arrow from a to b that stops at the edge of both nodes; two debts in opposite directions bend apart instead of overlapping. */
function curve(a: Point, b: Point): { d: string; mid: Point } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const c = { x: (a.x + b.x) / 2 - dy * 0.2, y: (a.y + b.y) / 2 + dx * 0.2 }
  const toward = (from: Point, to: Point, by: number): Point => {
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1
    return { x: from.x + ((to.x - from.x) / len) * by, y: from.y + ((to.y - from.y) / len) * by }
  }
  const s = toward(a, c, NODE_R + 4)
  const e = toward(b, c, NODE_R + 9)
  return { d: `M${s.x} ${s.y} Q${c.x} ${c.y} ${e.x} ${e.y}`, mid: { x: 0.25 * s.x + 0.5 * c.x + 0.25 * e.x, y: 0.25 * s.y + 0.5 * c.y + 0.25 * e.y } }
}

const initials = (account: string) => shortAccount(account).replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase()

function FlowGraph({ title, edges, nodes, mode, focus }: { title: string; edges: ObligationEdge[]; nodes: string[]; mode: Mode; focus: Set<string> | null }) {
  const at = useMemo(() => positions(nodes), [nodes])
  const color = (n: string) => PALETTE[nodes.indexOf(n) % PALETTE.length]
  const [tip, setTip] = useState<{ text: string; at: Point } | null>(null)
  const [hot, setHot] = useState<string | null>(null)
  const max = Math.max(1, ...edges.map((e) => units(e.amount)))
  const width = (v: number) => 2 + (7 * v) / max
  const touches = (e: ObligationEdge) => hot !== null && (e.debtor === hot || e.creditor === hot)
  return (
    <figure className="flow">
      <figcaption className="flow-title">{title}</figcaption>
      <div className="flow-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, ${edges.length} edges`}>
          <defs>
            {PALETTE.map((c, i) => (
              <marker key={c} id={`arrow-${mode}-${i}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill={c} />
              </marker>
            ))}
          </defs>
          {edges.map((e) => {
            const a = at.get(e.debtor)!
            const b = at.get(e.creditor)!
            const { d, mid } = curve(a, b)
            const gone = mode === 'after' && e.remaining === '0'
            const value = mode === 'after' ? units(e.remaining) : units(e.amount)
            const faded = (hot !== null && !touches(e)) || (focus !== null && !focus.has(keyOf(e)))
            const cls = ['edge', gone && 'edge-dim', faded && 'edge-faded', focus?.has(keyOf(e)) && 'edge-cycle'].filter(Boolean).join(' ')
            const text =
              mode === 'after'
                ? `${shortAccount(e.debtor)} → ${shortAccount(e.creditor)}: ${formatCredit(e.amount)} owed, ${formatCredit(e.cleared)} cleared, ${formatCredit(e.remaining)} left`
                : `${shortAccount(e.debtor)} owes ${shortAccount(e.creditor)} ${formatCredit(e.amount)} credit`
            return (
              <g key={keyOf(e)} style={{ color: color(e.debtor) }}>
                {mode === 'after' && <path className="edge-ghost" d={d} strokeWidth={width(units(e.amount))} aria-hidden="true" />}
                <path
                  data-testid={`edge-${mode}-${shortAccount(e.debtor)}-${shortAccount(e.creditor)}`}
                  className={cls}
                  d={d}
                  strokeWidth={gone ? 1.5 : width(value)}
                  markerEnd={gone ? undefined : `url(#arrow-${mode}-${nodes.indexOf(e.debtor) % PALETTE.length})`}
                />
                {!gone && <path className="edge-flow" d={d} aria-hidden="true" />}
                <path className="edge-hit" d={d} onMouseEnter={() => setTip({ text, at: mid })} onMouseLeave={() => setTip(null)} />
              </g>
            )
          })}
          {nodes.map((n) => {
            const p = at.get(n)!
            return (
              <g
                key={n}
                className={hot !== null && hot !== n && !edges.some((e) => (e.debtor === hot && e.creditor === n) || (e.creditor === hot && e.debtor === n)) ? 'node-g is-faded' : 'node-g'}
                style={{ color: color(n) }}
                onMouseEnter={() => setHot(n)}
                onMouseLeave={() => setHot(null)}
              >
                <circle className="node-halo" cx={p.x} cy={p.y} r={NODE_R + 8} />
                <circle className="node" cx={p.x} cy={p.y} r={NODE_R} />
                <text className="node-initials" x={p.x} y={p.y + 5} textAnchor="middle" aria-hidden="true">
                  {initials(n)}
                </text>
                <text className="tick" x={p.x} y={p.y + NODE_R + 20} textAnchor="middle">
                  {shortAccount(n)}
                </text>
              </g>
            )
          })}
        </svg>
        {tip && (
          <div className="tooltip" role="tooltip" style={{ left: `${(tip.at.x / W) * 100}%`, top: `${(tip.at.y / H) * 100}%` }}>
            {tip.text}
          </div>
        )}
      </div>
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
          <tr key={keyOf(e)}>
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

function Stage({ live, cleared }: { live: Obligations; cleared: Obligations | null }) {
  const [view, setView] = useState<'before' | 'after'>('after')
  const [focus, setFocus] = useState<Set<string> | null>(null)
  const nodes = useMemo(
    () => [...new Set([...live.edges, ...(cleared?.edges ?? [])].flatMap((e) => [e.debtor, e.creditor]))].sort(),
    [live, cleared],
  )
  const totalCleared = (cleared?.edges ?? []).reduce((sum, e) => sum + BigInt(e.cleared ?? '0'), 0n)
  const total = BigInt(live.totalObligation)
  const share = total > 0n ? Number((totalCleared * 10000n) / total) / 10000 : 0
  const cycles = useMemo(
    () => (cleared ? decomposeCycles(cleared.edges.map((e) => ({ debtor: e.debtor, creditor: e.creditor, cleared: BigInt(e.cleared ?? '0') }))) : []),
    [cleared],
  )
  const mode: Mode = cleared ? view : 'live'
  const shown = mode === 'after' ? cleared!.edges : live.edges
  const title = mode === 'after' ? 'After clearing' : mode === 'before' ? 'Before clearing' : 'Current epoch'
  return (
    <section className="flow-stage" aria-label="Debts between members">
      <div className="flow-head">
        <p className="flow-lede">
          {live.edgeCount} obligations worth {formatCredit(live.totalObligation)} credit.
        </p>
        {cleared && (
          <p className="flow-pill">
            Cleared value: <strong>{formatCredit(totalCleared.toString())}</strong> credit · {formatPercent(share)} of the debts
          </p>
        )}
        {cleared && (
          <div className="segmented" role="group" aria-label="Which debts to show">
            {(['before', 'after'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
                {v === 'before' ? 'Before clearing' : 'After clearing'}
              </button>
            ))}
          </div>
        )}
      </div>
      <FlowGraph title={title} edges={shown} nodes={nodes} mode={mode} focus={focus} />
      {cycles.length > 0 && (
        <section className="cycles" aria-label="Cleared cycles">
          <h3 className="section-eyebrow">Loops that cancelled</h3>
          <ul>
            {cycles.map((c, i) => {
              const keys = new Set(c.path.slice(1).map((to, j) => `${c.path[j]}>${to}`))
              return (
                <li key={i}>
                  <button
                    type="button"
                    onMouseEnter={() => setFocus(keys)}
                    onMouseLeave={() => setFocus(null)}
                    onFocus={() => setFocus(keys)}
                    onBlur={() => setFocus(null)}
                  >
                    {c.path.map(shortAccount).join(' → ')}: {formatCredit(c.amount.toString())} per edge
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <details className="more">
        <summary>Show as a table</summary>
        <EdgeTable edges={cleared ? cleared.edges : live.edges} staged={cleared !== null} />
      </details>
    </section>
  )
}

export function ObligationGraph() {
  const epoch = useSelectedEpoch()
  const pruned = useEpochSelection().selected?.edgesUnavailable === true
  const live = useObligations(epoch, 'live')
  const cleared = useObligations(epoch, 'cleared')
  if (epoch === null) return <NoEpoch />
  const clearedData = cleared.data && cleared.data.edges.length > 0 ? cleared.data : null
  return (
    <>
      {pruned && <p className="state" role="note">{EDGES_PRUNED_NOTE}</p>}
      <QueryState
        query={live}
        loadingLabel="Loading obligations"
        isEmpty={(d) => d.edges.length === 0}
        empty={pruned ? 'The edges of this epoch were pruned on-chain and the indexer has none for it, so there is no graph to draw.' : 'No obligations registered in this epoch yet.'}
      >
        {(data) => <Stage live={data} cleared={clearedData} />}
      </QueryState>
      {cleared.error instanceof ApiError && ERROR_TEXT[cleared.error.code] ? (
        <p className="state" role="status">{ERROR_TEXT[cleared.error.code]}</p>
      ) : (
        <QueryState
          query={cleared}
          loadingLabel="Loading clearing result"
          isEmpty={(d) => d.edges.length === 0}
          empty={pruned ? 'The cleared edges of this epoch were pruned on-chain and the indexer has none for it, so there is no graph to draw.' : 'Clearing has not been applied to this epoch yet.'}
        >
          {() => null}
        </QueryState>
      )}
    </>
  )
}
