import { useReport } from '../api/queries'
import type { ClearingReport, ReportMember } from '../api/types'
import { PrunePanel } from '../components/PrunePanel'
import { QueryState } from '../components/QueryState'
import { useSelectedEpoch } from '../epoch'
import { formatCredit, formatPercent, formatTime, shortAccount } from '../lib/format'

function memberNote(m: ReportMember): string {
  switch (m.status) {
    case 200:
      return m.settlement ? `Settled (${m.settlement})` : 'Zero position'
    case 402:
      return `Must pay ${formatCredit(m.amount)} before ${formatTime(m.due)}`
    case 202:
      return m.claimable
        ? `Can claim ${formatCredit(m.amount)}`
        : `${formatCredit(m.amount)} claimable after finalization`
    case 409:
      return `Default: stake slashed ${formatCredit(m.stakeSlashed)}, haircut ${formatCredit(m.haircut)}`
  }
}

function Report({ report }: { report: ClearingReport }) {
  return (
    <>
      <div className="report-head">
        <span className="stamp stamp-207" aria-hidden="true">207</span>
        <dl className="facts">
          <div>
            <dt>Cleared value</dt>
            <dd>{formatCredit(report.cleared)} credit</dd>
          </div>
          <div>
            <dt>Cleared ratio</dt>
            <dd>{formatPercent(report.clearedRatio)}</dd>
          </div>
          <div>
            <dt>Total obligation</dt>
            <dd>{formatCredit(report.totalObligation)} credit</dd>
          </div>
          <div>
            <dt>Payment deadline</dt>
            <dd>{formatTime(report.paymentDeadline)}</dd>
          </div>
        </dl>
      </div>
      <h2>Status per member</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Member</th>
              <th scope="col" className="num">Net position</th>
              <th scope="col" className="num">Cleared</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {report.members.map((m) => (
              <tr key={m.account}>
                <td>
                  <span className={`stamp stamp-${m.status}`}>{m.status}</span>
                </td>
                <td>{shortAccount(m.account)}</td>
                <td className="num">{formatCredit(m.net)}</td>
                <td className="num">{m.cleared === undefined ? '' : formatCredit(m.cleared)}</td>
                <td>{memberNote(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function Report207() {
  const epoch = useSelectedEpoch()
  const report = useReport(epoch)
  if (epoch === null) return null
  return (
    <>
      <QueryState
        query={report}
        loadingLabel="Loading report"
        isEmpty={(d) => !d.committed || d.members.length === 0}
        empty="Epoch is not committed yet, so there is no clearing report."
      >
        {(data) => <Report report={data} />}
      </QueryState>
      <PrunePanel epoch={epoch} />
    </>
  )
}
