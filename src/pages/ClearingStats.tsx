import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAllMetrics } from '../api/queries'
import type { EpochItem, EpochMetrics } from '../api/types'
import { EpochReplay } from '../components/EpochReplay'
import { ErrorNotice, Loading } from '../components/QueryState'
import { Scatter } from '../components/Scatter'
import { Kpi } from '../ds/components'
import { useEpochSelection } from '../epoch'
import { EDGES_PRUNED_NOTE, formatCredit, formatCredit2, formatNumber, formatPercent } from '../lib/format'

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

/**
 * The one sentence under the title, with the real numbers of the epoch: what was owed, what the loops cancelled, what had to move. An epoch without a clearing result says why instead.
 * `final` is whether the epoch is finalized: a running epoch speaks in the present tense.
 */
export function statementText(m: EpochMetrics, final: boolean, deadline: string | null, cutoffAt: string | null, now = Date.now()): string {
  if (noClearing(m)) return `${formatNumber(m.voucherCount, 0)} vouchers in epoch ${m.epoch}; no clearing was applied (the epoch was committed without a clearing result), so the obligations were left as they were.`
  if (m.residualTransfers === null || m.voucherCount === 0) return noResultText(m, deadline, now, cutoffAt)
  const owed = `In epoch ${m.epoch}, ${formatCredit2(m.totalVoucherValue)} credit ${final ? 'was' : 'is'} owed across ${formatNumber(m.voucherCount, 0)} ${m.voucherCount === 1 ? 'voucher' : 'vouchers'}`
  if (m.cleared === null || m.netDebt === null) return `${owed}.`
  return `${owed}; ${formatCredit2(m.cleared)} ${final ? 'was cancelled' : 'is cancelled'} in loops and ${formatCredit2(m.netDebt)} ${final ? 'had to move' : 'is set to move'}.`
}

/** `payment_window` -> `payment window` */
const phaseWord = (phase: string): string => phase.replace(/_/g, ' ')

function Statement({ m, selected, pruned }: { m: EpochMetrics; selected: EpochItem; pruned: boolean }) {
  const final = selected.phase === 'finalized'
  const showTransfers = !noClearing(m) && m.residualTransfers !== null && m.voucherCount > 0
  return (
    <header className="ep-head">
      <p className="ep-eyebrow">
        {m.circle} · epoch {m.epoch} · {phaseWord(selected.phase)}
      </p>
      {/* the page title is the h1 of the shell; this one names the epoch the page is about */}
      <h2 className="ep-title">Epoch {m.epoch} clearing result</h2>
      <p className="ep-lede">{statementText(m, final, selected.proposalDeadline, selected.cutoffAt ?? null)}</p>
      {showTransfers && <p className="ep-sub">{transfersText(m.voucherCount, m.residualTransfers!)}</p>}
      {pruned && <p className="state" role="note">{EDGES_PRUNED_NOTE}</p>}
    </header>
  )
}

/** The headline figures as cards, then the rest one click away. */
function Figures({ m }: { m: EpochMetrics }) {
  const eff = efficiency(m)
  const { search } = useLocation()
  const cleared = noClearing(m) || m.voucherCount === 0 ? null : m.clearedRatio
  // an epoch with no vouchers has nothing to clear: "yet" would promise a result that will never come
  const none = m.voucherCount === 0 ? 'No vouchers in this epoch' : 'No clearing result yet'
  return (
    <section className="ep-section" aria-label="Headline figures">
      <div className="ds-kpis ep-kpis">
        <Kpi
          label="Transfers avoided"
          value={eff ? formatNumber(eff.avoided, 0) : '—'}
          unit={eff ? `of ${formatNumber(m.voucherCount, 0)}` : undefined}
          note={eff ? `${formatPercent(eff.avoidedShare)} of the vouchers need no transfer` : none}
        />
        <Kpi
          label="Cash needed"
          value={eff ? formatCredit2(eff.cashNeeded) : '—'}
          unit={eff ? 'credit' : undefined}
          note={eff ? `${formatPercent(eff.cashShare)} of the ${formatCredit2(m.totalVoucherValue)} credit owed` : none}
        />
        <Kpi label="Cleared ratio" value={cleared === null ? '—' : formatPercent(cleared)} note={cleared === null ? none : `Ratio ${formatNumber(cleared)}: the share of what was owed`} />
        <Kpi label="Cleared value" value={m.cleared === null ? '—' : formatCredit2(m.cleared)} unit={m.cleared === null ? undefined : 'credit'} note="Cancelled in loops" />
      </div>
      <details className="more ep-more">
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
      </details>
      <p className="ep-how">
        {/* FE-072: explained in the app's own Help, never on GitHub */}
        <Link to={{ pathname: '/help', search, hash: '#term-transfers-avoided' }}>How they are computed</Link>
      </p>
      {defaultNote(m) && <p className="state">{defaultNote(m)}</p>}
    </section>
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
    <div className="ep ep-stats">
      <Statement m={current} selected={selected} pruned={pruned.has(current.epoch)} />
      <EpochReplay epoch={current.epoch} final={selected.phase === 'finalized'} />
      <Figures m={current} />
      <section className="ep-section" aria-labelledby="ep-density">
        <h2 id="ep-density" className="ep-h2">Clearing result against graph density</h2>
        <div className="scatter-row">
          <Scatter title="Cleared ratio" xLabel="Graph density" yLabel="Cleared ratio" yMax={1} formatY={(v) => formatNumber(v)} points={ratioPoints} />
          <Scatter title="Transfer savings" xLabel="Graph density" yLabel="Vouchers per transfer" yMax={savingMax} formatY={(v) => formatNumber(v, 0)} points={savingPoints} />
        </div>
      </section>
      <details className="more ep-more ep-epochs">
        <summary>Per epoch</summary>
        <div className="table-wrap ep-table">
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
    </div>
  )
}
