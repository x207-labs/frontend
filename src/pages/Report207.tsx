import { useReport } from '../api/queries'
import type { ClearingReport, ReportMember } from '../api/types'
import { NoEpoch } from '../components/NoEpoch'
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

// FE-072: each member's state as a word and a drawn sign, in the status colour, instead of an HTTP-like number. The number stays in data-status.
const STATUS: Record<ReportMember['status'], { word: string; path: string }> = {
  200: { word: 'Settled', path: 'M5 12.5l4.5 4.5L19 7.5' },
  402: { word: 'Pays', path: 'M12 19V5M6 11l6-6 6 6' },
  202: { word: 'Claims', path: 'M12 5v14M6 13l6 6 6-6' },
  409: { word: 'Defaulted', path: 'M7 7l10 10M17 7L7 17' },
}
const ORDER: ReportMember['status'][] = [200, 402, 202, 409]

function StatusPill({ status }: { status: ReportMember['status'] }) {
  const s = STATUS[status]
  return (
    <span className="status-pill" data-status={status}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={s.path} />
      </svg>
      {s.word}
    </span>
  )
}

// The share of the obligations that cleared, drawn as the x207 ring: the arc fills to the ratio, the number sits in the middle.
function ClearedRing({ ratio }: { ratio: number | null }) {
  const r = 52
  const c = 2 * Math.PI * r
  const share = ratio === null ? 0 : Math.max(0, Math.min(1, ratio))
  return (
    <div className="cleared-ring" aria-hidden="true">
      <svg viewBox="0 0 128 128" width="148" height="148">
        <defs>
          <linearGradient id="ring-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8fc0ff" />
            <stop offset="1" stopColor="#1a62d6" />
          </linearGradient>
        </defs>
        <circle cx="64" cy="64" r={r} className="ring-track" />
        <circle cx="64" cy="64" r={r} className="ring-arc" stroke="url(#ring-fill)" strokeDasharray={`${share * c} ${c}`} transform="rotate(-90 64 64)" />
      </svg>
      <span className="ring-label">
        <strong>{ratio === null ? '–' : `${Math.round(share * 100)}%`}</strong>
        cleared
      </span>
    </div>
  )
}

// How many members are in each state, as one bar and four counts.
function StatusBar({ members }: { members: ReportMember[] }) {
  const total = members.length || 1
  return (
    <div className="status-bar">
      <div className="status-track" aria-hidden="true">
        {ORDER.map((st) => {
          const n = members.filter((m) => m.status === st).length
          return n > 0 ? <span key={st} data-status={st} style={{ flexGrow: n / total }} /> : null
        })}
      </div>
      <ul className="status-counts" aria-label="Members by state">
        {ORDER.map((st) => (
          <li key={st}>
            <StatusPill status={st} />
            <strong>{members.filter((m) => m.status === st).length}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Report({ report }: { report: ClearingReport }) {
  return (
    <>
      <div className="report-head">
        <ClearedRing ratio={report.clearedRatio} />
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
      <StatusBar members={report.members} />
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
                  <StatusPill status={m.status} />
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
  if (epoch === null) return <NoEpoch />
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
