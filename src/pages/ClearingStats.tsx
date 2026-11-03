import { useAllMetrics } from '../api/queries'
import type { EpochMetrics } from '../api/types'
import { ErrorNotice, Loading } from '../components/QueryState'
import { Scatter } from '../components/Scatter'
import { useEpochSelection } from '../epoch'
import { formatCredit, formatNumber, formatPercent } from '../lib/format'

function Headline({ m }: { m: EpochMetrics }) {
  return (
    <div className="headline">
      <p className="headline-main">
        {formatNumber(m.voucherCount, 0)} vouchers become{' '}
        {m.residualTransfers === null ? 'no clearing result yet' : `${formatNumber(m.residualTransfers, 0)} transfers`}.
      </p>
      <dl className="facts">
        <div>
          <dt>Cleared ratio</dt>
          <dd>{formatNumber(m.clearedRatio)}</dd>
        </div>
        <div>
          <dt>Transfer savings</dt>
          <dd>{formatNumber(m.transferSavings)}</dd>
        </div>
        <div>
          <dt>Graph density</dt>
          <dd>{formatNumber(m.graph.density, 4)}</dd>
        </div>
        <div>
          <dt>Cleared value</dt>
          <dd>{formatCredit(m.cleared)}</dd>
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
    </div>
  )
}

export function ClearingStats() {
  const { query, selected } = useEpochSelection()
  const results = useAllMetrics((query.data?.items ?? []).map((e) => e.epoch))
  if (!selected) {
    return query.data ? <p className="state">No epoch with clearing metrics yet.</p> : null
  }
  const loaded = results.flatMap((r) => (r.data ? [r.data] : []))
  const current = loaded.find((m) => m.epoch === selected.epoch)
  const failed = results.find((r) => r.isError && r.data === undefined)

  if (!current) {
    if (failed) return <ErrorNotice error={failed.error} onRetry={() => results.forEach((r) => r.refetch())} />
    return <Loading label="Loading metrics" />
  }

  const ratioPoints = loaded.flatMap((m) =>
    m.clearedRatio === null
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
      <Headline m={current} />
      <h2>Clearing result against graph density</h2>
      <div className="scatter-row">
        <Scatter title="Cleared ratio" xLabel="Graph density" yLabel="Cleared ratio" yMax={1} formatY={(v) => formatNumber(v)} points={ratioPoints} />
        <Scatter title="Transfer savings" xLabel="Graph density" yLabel="Vouchers per transfer" yMax={savingMax} formatY={(v) => formatNumber(v, 0)} points={savingPoints} />
      </div>
      <h2>Per epoch</h2>
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
            {loaded.map((m) => (
              <tr key={m.epoch} aria-current={m.epoch === selected.epoch ? 'true' : undefined}>
                <td>{m.epoch}</td>
                <td className="num">{formatNumber(m.graph.density, 4)}</td>
                <td className="num">{formatNumber(m.clearedRatio)}</td>
                <td className="num">{formatNumber(m.voucherCount, 0)}</td>
                <td className="num">{formatNumber(m.residualTransfers, 0)}</td>
                <td className="num">{formatNumber(m.transferSavings)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
