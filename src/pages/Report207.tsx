import { useAllMetrics, useReport } from '../api/queries'
import type { ClearingReport, EpochMetrics, EpochPhase, ReportMember } from '../api/types'
import { NoEpoch } from '../components/NoEpoch'
import { PrunePanel } from '../components/PrunePanel'
import { QueryState } from '../components/QueryState'
import { CONTRACT_ID } from '../config'
import { StatusBadge, type StatusCode } from '../ds/components'
import { useSelectedEpoch } from '../epoch'
import { splitOf } from '../lib/epochSplit'
import { formatCredit2, formatNumber, formatPercent, formatTime, shortAccount } from '../lib/format'

function memberNote(m: ReportMember): string {
  switch (m.status) {
    case 200:
      return m.settlement ? `Settled (${m.settlement})` : 'Zero position'
    case 402:
      return `Must pay ${formatCredit2(m.amount)} before ${formatTime(m.due)}`
    case 202:
      return m.claimable ? `Can claim ${formatCredit2(m.amount)}` : `${formatCredit2(m.amount)} claimable after finalization`
    case 409:
      return `Default: stake slashed ${formatCredit2(m.stakeSlashed)}, haircut ${formatCredit2(m.haircut)}`
  }
}

/** The state of the epoch as one result code and a word: it is the code of the epoch, not of a member. The report only exists once the epoch is committed. */
const STATE: Partial<Record<EpochPhase, { code: StatusCode; label: string }>> = {
  commit: { code: 202, label: 'Committed' },
  payment_window: { code: 402, label: 'Payment window' },
  finalized: { code: 200, label: 'Finalized' },
}

const asRaw = (v: bigint): string => v.toString()
const times = (n: number, one: string, many: string): string => `${formatNumber(n, 0)} ${n === 1 ? one : many}`

/** How much of the whole a part is, as a share of 0 to 1 with 4 digits (no float of a big number). */
function shareOf(part: bigint, whole: bigint): number {
  return whole === 0n ? 0 : Number((part * 10000n) / whole) / 10000
}

function Statement({ report, metrics }: { report: ClearingReport; metrics: EpochMetrics | undefined }) {
  const split = splitOf(report)
  const state = STATE[report.phase]
  const vouchers = metrics?.voucherCount
  const whole = split.owed > 0n ? split.owed : split.moved + split.loops + split.pairs
  const parts: { key: string; name: string; value: bigint; note: string }[] = [
    { key: 'moved', name: 'Moved as mock USDT', value: split.moved, note: `${times(split.payers, 'member paid in', 'members paid in')}, ${times(split.paid, 'was paid', 'were paid')}.` },
    { key: 'loops', name: 'Cancelled in loops', value: split.loops, note: 'Debts that ran in a loop. The solver removed them from the record.' },
    { key: 'pairs', name: 'Netted between pairs', value: split.pairs, note: 'What a member owed against what it was owed, offset without a transfer.' },
  ]
  return (
    <header className="ep-head">
      <p className="ep-eyebrow">
        {report.circle} · epoch {report.epoch} · {report.phase.replace(/_/g, ' ')}
      </p>
      {/* the page title is the h1 of the shell; this one names the epoch the page is about */}
      <h2 className="ep-title">Epoch {report.epoch} settlement statement</h2>
      <dl className="kv ep-facts">
        <div>
          <dt>Circle contract</dt>
          <dd className="ds-num">{CONTRACT_ID}</dd>
        </div>
        <div>
          <dt>Committed at</dt>
          <dd>{formatTime(report.committedAt)}</dd>
        </div>
        <div>
          <dt>Payment deadline</dt>
          <dd>{formatTime(report.paymentDeadline)}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{state ? <StatusBadge code={state.code} label={state.label} /> : report.phase.replace(/_/g, ' ')}</dd>
        </div>
      </dl>

      <figure className="ep-statement" aria-labelledby="ep-split-caption">
        <p className="ep-big">
          <span className="ds-num">{formatCredit2(asRaw(split.owed))}</span>
          <small>credit owed{vouchers !== undefined ? ` across ${times(vouchers, 'voucher', 'vouchers')}` : ''}</small>
        </p>
        <p className="ep-big">
          <span className="ds-num">{formatCredit2(asRaw(split.moved))}</span>
          <small>credit moved</small>
        </p>
        {whole > 0n && (
          <div
            className="ep-bar"
            role="img"
            aria-label={`Bar to scale: ${formatCredit2(asRaw(split.moved))} moved, ${formatCredit2(asRaw(split.loops))} cancelled in loops, ${formatCredit2(asRaw(split.pairs))} netted between pairs, out of ${formatCredit2(asRaw(split.owed))} owed`}
          >
            {parts.map((p) => (p.value > 0n ? <span key={p.key} data-part={p.key} style={{ width: `${shareOf(p.value, whole) * 100}%` }} /> : null))}
          </div>
        )}
        <figcaption id="ep-split-caption" className="sr-only">What was owed, split into what moved, what the loops cancelled and what was netted between pairs</figcaption>
        <dl className="kv ep-legend">
          {parts.map((p) => (
            <div key={p.key} data-part={p.key}>
              <dt>
                <i aria-hidden="true" />
                {p.name}
              </dt>
              <dd>
                <span className="ds-num">{formatCredit2(asRaw(p.value))}</span> <small>credit, {formatPercent(shareOf(p.value, whole))} of what was owed. {p.note}</small>
              </dd>
            </div>
          ))}
        </dl>
      </figure>
    </header>
  )
}

const RAN: { phase: EpochPhase; name: string }[] = [
  { phase: 'open', name: 'Open' },
  { phase: 'cutoff', name: 'Cutoff' },
  { phase: 'clearing', name: 'Clearing' },
  { phase: 'commit', name: 'Committed' },
  { phase: 'payment_window', name: 'Payment window' },
  { phase: 'finalized', name: 'Finalized' },
]

/** What the report and the metrics say about each step of the epoch; nothing is claimed about a step the data does not cover. */
function stepDetail(phase: EpochPhase, report: ClearingReport, metrics: EpochMetrics | undefined, reached: boolean): string {
  if (!reached) return 'Not yet'
  switch (phase) {
    case 'open':
      return 'Vouchers signed and served'
    case 'cutoff':
      return metrics ? `${times(metrics.voucherCount, 'voucher', 'vouchers')} registered` : 'Vouchers registered'
    case 'clearing':
      return report.cleared !== null && BigInt(report.cleared) > 0n ? `${formatCredit2(report.cleared)} credit cancelled in loops` : 'Solver proposal checked'
    case 'commit':
      return formatTime(report.committedAt)
    case 'payment_window':
      return report.paymentDeadline ? `Until ${formatTime(report.paymentDeadline)}` : 'Debtors pay in'
    case 'finalized': {
      const defaulted = report.members.filter((m) => m.status === 409).length
      return defaulted > 0 ? `${times(defaulted, 'member', 'members')} defaulted, covered from stake` : 'No member defaulted'
    }
  }
}

function Ran({ report, metrics }: { report: ClearingReport; metrics: EpochMetrics | undefined }) {
  const at = RAN.findIndex((s) => s.phase === report.phase)
  return (
    <section className="ep-section" aria-labelledby="ep-ran">
      <h2 id="ep-ran" className="ep-h2">How the epoch ran</h2>
      <ol className="ep-steps">
        {RAN.map((s, i) => (
          <li key={s.phase} data-state={i < at ? 'done' : i === at ? 'now' : 'todo'} aria-current={i === at ? 'step' : undefined}>
            <b>{s.name}</b>
            <span>{stepDetail(s.phase, report, metrics, i <= at)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Members({ members }: { members: ReportMember[] }) {
  return (
    <section className="ep-section" aria-labelledby="ep-members">
      <h2 id="ep-members" className="ep-h2">Status per member</h2>
      <p className="ep-sechint">Amounts in credit. Each member gets its own result code: 200 settled, 202 claimable, 402 due, 409 defaulted.</p>
      <div className="table-wrap ep-table ep-cards">
        <table>
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col" className="num">Net position (credit)</th>
              <th scope="col" className="num">Cleared (credit)</th>
              <th scope="col">Result</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.account}>
                <th scope="row" data-label="Member">{shortAccount(m.account)}</th>
                <td className="num" data-label="Net position (credit)">{formatCredit2(m.net)}</td>
                <td className="num" data-label="Cleared (credit)">{m.cleared === undefined ? '' : formatCredit2(m.cleared)}</td>
                <td data-label="Result">
                  <StatusBadge code={m.status} />
                </td>
                <td data-label="Note">{memberNote(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Report({ report, metrics }: { report: ClearingReport; metrics: EpochMetrics | undefined }) {
  return (
    <div className="ep ep-report">
      <Statement report={report} metrics={metrics} />
      <Ran report={report} metrics={metrics} />
      <Members members={report.members} />
    </div>
  )
}

export function Report207() {
  const epoch = useSelectedEpoch()
  const report = useReport(epoch)
  const [metrics] = useAllMetrics(epoch === null ? [] : [{ epoch, final: report.data?.finalized === true }])
  if (epoch === null) return <NoEpoch />
  return (
    <>
      <QueryState
        query={report}
        loadingLabel="Loading report"
        isEmpty={(d) => !d.committed || d.members.length === 0}
        empty="Epoch is not committed yet, so there is no clearing report."
      >
        {(data) => <Report report={data} metrics={metrics?.data} />}
      </QueryState>
      <PrunePanel epoch={epoch} />
    </>
  )
}
