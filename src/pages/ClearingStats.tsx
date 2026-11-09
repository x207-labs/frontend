import { useState } from 'react'
import { useAllMetrics } from '../api/queries'
import type { EpochMetrics } from '../api/types'
import { ErrorNotice, Loading } from '../components/QueryState'
import { Scatter } from '../components/Scatter'
import { useEpochSelection } from '../epoch'
import { EDGES_PRUNED_NOTE, formatCredit, formatNumber, formatPercent } from '../lib/format'

/** How many of the newest epochs the density charts show (FE-046: a circle with hundreds of epochs must not read them all). */
const CHART_EPOCHS = 20
/** FE-047: how many metrics the charts ask for at once (the read API is rate limited per caller). */
const CHART_WAVE = 5

const utc = (iso: string): string => iso.replace('T', ' ').replace(/:\d\d(\.\d+)?Z$/, ' UTC')

/** An epoch that was committed with vouchers and no clearing applied: a ratio of 0 and no transfers there mean "nothing was cleared", not a result of the clearing. */
export function noClearing(m: EpochMetrics): boolean {
  return m.voucherCount > 0 && BigInt(m.cleared ?? '0') === 0n && (m.residualTransfers ?? 0) === 0 && (m.phase === 'commit' || m.phase === 'payment_window' || m.phase === 'finalized')
}

const ratioText = (m: EpochMetrics): string => (noClearing(m) ? '—' : formatNumber(m.clearedRatio))

/** What an epoch without a clearing result is, said as it is: finished with nothing in it, stuck past its deadline, or still running. */
export function noResultText(m: EpochMetrics, deadline: string | null, now = Date.now(), cutoffAt: string | null = null): string {
  const vouchers = formatNumber(m.voucherCount, 0)
  if (m.phase === 'finalized') return m.voucherCount === 0 ? `Epoch ${m.epoch} finalized with no vouchers, so nothing was cleared.` : `${vouchers} vouchers registered in epoch ${m.epoch}; clearing was not run.`
  if (m.phase === 'cutoff' && cutoffAt !== null && Date.parse(cutoffAt) < now) return `Epoch ${m.epoch} passed its cutoff at ${utc(cutoffAt)} and has not been closed yet, so there is no clearing result.`
  const late = deadline !== null && Date.parse(deadline) < now
  if (late) return `Epoch ${m.epoch} did not finish: it is still in phase ${m.phase} and its deadline of ${utc(deadline!)} has passed, so there is no clearing result.`
  return `Epoch ${m.epoch} is in progress (phase ${m.phase}): ${vouchers} vouchers registered, clearing not run yet.`
}

/** A row of the per-epoch table for an epoch that has not produced a clearing result: the phase it is in, instead of five cells of "not available". `null` for an epoch with figures. */
export function pendingText(m: EpochMetrics): string | null {
  if (!['open', 'cutoff', 'clearing', 'commit'].includes(m.phase) || m.clearedRatio !== null) return null
  return `In ${m.phase}, no clearing result yet${m.voucherCount === 0 ? ' (no vouchers)' : ''}`
}

/** `1 voucher becomes 2 settlement transfers`, `24 vouchers become 14 settlement transfers`. */
export function transfersText(vouchers: number, transfers: number): string {
  return `${formatNumber(vouchers, 0)} ${vouchers === 1 ? 'voucher becomes' : 'vouchers become'} ${formatNumber(transfers, 0)} settlement ${transfers === 1 ? 'transfer' : 'transfers'}, one for each member with a net position.`
}

/** FE-039 (docs/capital-efficiency.md): what the clearing saved, from the metrics of the epoch only. `null` when the epoch has no clearing result, so the page shows a dash like the other figures. */
export function efficiency(m: EpochMetrics): { avoided: number; avoidedShare: number; cashNeeded: string; cashShare: number } | null {
  if (noClearing(m) || m.voucherCount === 0 || m.residualTransfers === null || m.netDebt === null) return null
  const total = BigInt(m.totalVoucherValue)
  if (total === 0n) return null
  const avoided = m.voucherCount - m.residualTransfers
  if (avoided < 0) return null
  return { avoided, avoidedShare: avoided / m.voucherCount, cashNeeded: m.netDebt, cashShare: Number((BigInt(m.netDebt) * 10000n + total / 2n) / total) / 10000 }
}

/** What a default rate above 0 means: the part of the residual debt that was not paid in the payment window and was covered from the stakes. */
export function defaultNote(m: EpochMetrics): string | null {
  if (m.defaultRate === null || m.defaultRate <= 0 || m.netDebt === null) return null
  return `Default rate: ${formatPercent(m.defaultRate)} of the residual debt of ${formatCredit(m.netDebt)} credit was not paid in the payment window and was covered from the stake of the debtors.`
}

/** A thin bar for a figure that is a share of a whole (0 to 1). Decorative: the figure itself is in the text next to it. */
function Meter({ share, tone }: { share: number; tone: 'blue' | 'green' | 'violet' }) {
  const pct = Math.max(0, Math.min(1, share)) * 100
  return (
    <dd className="meter" data-tone={tone} aria-hidden="true">
      <span style={{ width: `${Math.max(pct, 1.5)}%` }} />
    </dd>
  )
}

// FE-070: the result of the epoch as a picture. Each small dot on the left is a voucher (one dot stands for several when there are many), the large dots on
// the right are the settlement transfers that are left; the lines between them carry the flow. The sentence above says the same in words.
const DOT_MAX = 128
const COLS = 16
function Compression({ vouchers, transfers }: { vouchers: number; transfers: number }) {
  const per = Math.max(1, Math.ceil(vouchers / DOT_MAX))
  const dots = Math.ceil(vouchers / per)
  const rows = Math.ceil(dots / COLS)
  const big = Math.min(transfers, 12)
  const gap = 15
  const left = { x: 24, y: 100 - ((rows - 1) * gap) / 2 }
  const rightX = 560
  const spread = Math.min(30, 150 / Math.max(big, 1))
  const ty = (i: number) => 100 + (i - (big - 1) / 2) * spread * 1.6
  return (
    <figure className="compress">
      <svg viewBox="0 0 640 200" role="img" aria-label={`${formatNumber(vouchers, 0)} vouchers settled as ${formatNumber(transfers, 0)} transfers`}>
        <defs>
          <linearGradient id="compress-flow" x1="0" x2="1">
            <stop offset="0" stopColor="#8fc0ff" stopOpacity="0.05" />
            <stop offset="1" stopColor="#3d8bff" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        {Array.from({ length: big }, (_, i) => (
          <path key={`f${i}`} className="compress-flow" d={`M${left.x + (COLS - 1) * gap + 14} ${100} C 420 100, 440 ${ty(i)}, ${rightX - 18} ${ty(i)}`} stroke="url(#compress-flow)" />
        ))}
        {Array.from({ length: dots }, (_, i) => (
          <circle key={i} className="compress-dot" cx={left.x + (i % COLS) * gap} cy={left.y + Math.floor(i / COLS) * gap} r={4} style={{ animationDelay: `${(i % COLS) * 30 + Math.floor(i / COLS) * 20}ms` }} />
        ))}
        {Array.from({ length: big }, (_, i) => (
          <circle key={`t${i}`} className="compress-big" cx={rightX} cy={ty(i)} r={Math.min(12, spread / 1.4 + 3)} style={{ animationDelay: `${600 + i * 80}ms` }} />
        ))}
      </svg>
      <figcaption>
        <span>
          <strong>{formatNumber(vouchers, 0)}</strong> vouchers{per > 1 ? ` (one dot = ${per})` : ''}
        </span>
        <span>
          <strong>{formatNumber(transfers, 0)}</strong> {transfers === 1 ? 'transfer' : 'transfers'}
        </span>
      </figcaption>
    </figure>
  )
}

function Headline({ m, deadline, cutoffAt, pruned }: { m: EpochMetrics; deadline: string | null; cutoffAt: string | null; pruned: boolean }) {
  const eff = efficiency(m)
  return (
    <div className="headline">
      <p className="headline-main">
        {noClearing(m)
          ? `${formatNumber(m.voucherCount, 0)} vouchers in epoch ${m.epoch}; no clearing was applied (the epoch was committed without a clearing result), so the obligations were left as they were.`
          : m.residualTransfers === null || m.voucherCount === 0
          ? noResultText(m, deadline, Date.now(), cutoffAt)
          : transfersText(m.voucherCount, m.residualTransfers)}
      </p>
      {eff && m.residualTransfers !== null && <Compression vouchers={m.voucherCount} transfers={m.residualTransfers} />}
      {/* FE-070: four figures up front, each with a meter where it is a share; the rest one click away, so the page reads as a picture first */}
      <dl className="facts facts-main">
        <div>
          <dt>Transfers avoided</dt>
          <dd>{eff ? `${formatNumber(eff.avoided, 0)} of ${formatNumber(m.voucherCount, 0)} (${formatPercent(eff.avoidedShare)})` : '—'}</dd>
          {eff && <Meter share={eff.avoidedShare} tone="blue" />}
        </div>
        <div>
          <dt>Cash needed</dt>
          <dd>{eff ? `${formatCredit(eff.cashNeeded)} of ${formatCredit(m.totalVoucherValue)} credit (${formatPercent(eff.cashShare)})` : '—'}</dd>
          {eff && <Meter share={eff.cashShare} tone="green" />}
        </div>
        <div>
          <dt>Cleared ratio</dt>
          <dd>{ratioText(m)}</dd>
          {!noClearing(m) && m.clearedRatio !== null && <Meter share={m.clearedRatio} tone="violet" />}
        </div>
        <div>
          <dt>Cleared value</dt>
          <dd>{formatCredit(m.cleared)}</dd>
        </div>
      </dl>
      <details className="more">
        <summary>More figures</summary>
        <dl className="facts">
          <div>
            <dt>Transfer savings</dt>
            <dd>{formatNumber(m.transferSavings)}</dd>
          </div>
          <div>
            <dt>Graph density</dt>
            <dd>{formatNumber(m.graph.density, 4)}</dd>
          </div>
          <div>
            <dt>Net debt reduction</dt>
            <dd>{formatPercent(m.debtReduction)}</dd>
          </div>
          <div>
            <dt>Default rate</dt>
            <dd>{formatPercent(m.defaultRate)}</dd>
          </div>
          <div>
            <dt>Clearing time</dt>
            <dd>{m.clearingTimeSeconds === null ? 'not available' : `${formatNumber(m.clearingTimeSeconds, 0)} seconds`}</dd>
          </div>
        </dl>
        <p className="state">
          Transfers avoided counts vouchers that did not become their own transfer; cash needed is the net debt that members owe in cash after netting (it does not depend on the solver). Neither counts fees or locked stake.
        </p>
      </details>
      <p className="how-link">
        <a href="https://github.com/x207-labs/frontend/blob/main/docs/capital-efficiency.md" target="_blank" rel="noreferrer">How they are computed</a>
      </p>
      {pruned && <p className="state" role="note">{EDGES_PRUNED_NOTE}</p>}
      {defaultNote(m) && <p className="state">{defaultNote(m)}</p>}
    </div>
  )
}

export function ClearingStats() {
  const { query, selected, resolving } = useEpochSelection()
  // FE-046: the charts use the newest CHART_EPOCHS epochs and the selected one; finalized ones are read once, the rest follow the poll.
  // FE-047: nothing is read before an epoch is selected, then CHART_WAVE at a time (the selected epoch first), each wave after the previous one answered.
  const items = query.data?.items ?? []
  const charted = items.filter((e, i) => i < CHART_EPOCHS || e.epoch === selected?.epoch)
  const order = selected ? [...charted.filter((e) => e.epoch === selected.epoch), ...charted.filter((e) => e.epoch !== selected.epoch)] : []
  const [shown, setShown] = useState(CHART_WAVE)
  const results = useAllMetrics(order.slice(0, shown).map((e) => ({ epoch: e.epoch, final: e.phase === 'finalized' })))
  // the next wave starts in the same render pass once the current one has answered (state adjusted while rendering, no effect)
  if (order.length > shown && results.every((r) => r.data !== undefined || r.isError)) setShown(shown + CHART_WAVE)
  if (!selected) {
    if (resolving) return <Loading label="Loading epoch" />
    return query.data ? <p className="state">No epoch with clearing metrics yet.</p> : null
  }
  const rank = new Map(charted.map((e, i) => [e.epoch, i]))
  const loaded = results.flatMap((r) => (r.data ? [r.data] : [])).sort((a, b) => (rank.get(a.epoch) ?? 0) - (rank.get(b.epoch) ?? 0))
  const pruned = new Set((query.data?.items ?? []).filter((e) => e.edgesUnavailable === true).map((e) => e.epoch))
  const current = loaded.find((m) => m.epoch === selected.epoch)
  const failed = results.find((r) => r.isError && r.data === undefined)

  if (!current) {
    if (failed) return <ErrorNotice error={failed.error} onRetry={() => results.forEach((r) => r.refetch())} />
    return <Loading label="Loading metrics" />
  }

  const ratioPoints = loaded.flatMap((m) =>
    m.clearedRatio === null || noClearing(m)
      ? []
      : [{ id: m.epoch, x: m.graph.density, y: m.clearedRatio, selected: m.epoch === selected.epoch, detail: `cleared ratio ${formatNumber(m.clearedRatio)}, density ${formatNumber(m.graph.density, 4)}` }],
  )
  const savingPoints = loaded.flatMap((m) =>
    m.transferSavings === null
      ? []
      : [{ id: m.epoch, x: m.graph.density, y: m.transferSavings, selected: m.epoch === selected.epoch, detail: `savings ${formatNumber(m.transferSavings)}, density ${formatNumber(m.graph.density, 4)}` }],
  )
  const savingMax = Math.max(...savingPoints.map((p) => p.y), 1) * 1.15

  return (
    <>
      <Headline m={current} deadline={selected.proposalDeadline} cutoffAt={selected.cutoffAt ?? null} pruned={pruned.has(current.epoch)} />
      <h2>Clearing result against graph density</h2>
      <div className="scatter-row">
        <Scatter title="Cleared ratio" xLabel="Graph density" yLabel="Cleared ratio" yMax={1} formatY={(v) => formatNumber(v)} points={ratioPoints} />
        <Scatter title="Transfer savings" xLabel="Graph density" yLabel="Vouchers per transfer" yMax={savingMax} formatY={(v) => formatNumber(v, 0)} points={savingPoints} />
      </div>
      <details className="more">
      <summary>Per epoch</summary>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Epoch</th>
              <th scope="col" className="num">Density</th>
              <th scope="col" className="num">Cleared ratio</th>
              <th scope="col" className="num">Voucher</th>
              <th scope="col" className="num">Residual transfers</th>
              <th scope="col" className="num">Savings</th>
            </tr>
          </thead>
          <tbody>
            {loaded.map((m) => pendingText(m) !== null ? (
              <tr key={m.epoch} aria-current={m.epoch === selected.epoch ? 'true' : undefined}>
                <td>{m.epoch}</td>
                <td colSpan={5}>{pendingText(m)}</td>
              </tr>
            ) : (
              <tr key={m.epoch} aria-current={m.epoch === selected.epoch ? 'true' : undefined}>
                <td>
                  {m.epoch}
                  {pruned.has(m.epoch) && <small className="state" title={EDGES_PRUNED_NOTE}> edges pruned on-chain</small>}
                </td>
                <td className="num">{formatNumber(m.graph.density, 4)}</td>
                <td className="num" title={noClearing(m) ? 'No clearing was applied in this epoch' : undefined}>{ratioText(m)}</td>
                <td className="num">{formatNumber(m.voucherCount, 0)}</td>
                <td className="num">{formatNumber(m.residualTransfers, 0)}</td>
                <td className="num">{formatNumber(m.transferSavings)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </details>
    </>
  )
}
