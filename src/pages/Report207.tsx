import { useReport } from '../api/queries'
import type { ClearingReport, ReportMember } from '../api/types'
import { PrunePanel } from '../components/PrunePanel'
import { QueryState } from '../components/QueryState'
import { useSelectedEpoch } from '../epoch'
import { formatCredit, formatPercent, formatTime, shortAccount } from '../lib/format'

function memberNote(m: ReportMember): string {
  switch (m.status) {
    case 200:
      return m.settlement ? `Lunas (${m.settlement})` : 'Posisi nol'
    case 402:
      return `Wajib bayar ${formatCredit(m.amount)} sebelum ${formatTime(m.due)}`
    case 202:
      return m.claimable
        ? `Bisa klaim ${formatCredit(m.amount)}`
        : `${formatCredit(m.amount)} bisa diklaim setelah finalisasi`
    case 409:
      return `Default: stake dipotong ${formatCredit(m.stakeSlashed)}, haircut ${formatCredit(m.haircut)}`
  }
}

function Report({ report }: { report: ClearingReport }) {
  return (
    <>
      <div className="report-head">
        <span className="stamp stamp-207" aria-hidden="true">207</span>
        <dl className="facts">
          <div>
            <dt>Nilai terhapus</dt>
            <dd>{formatCredit(report.cleared)} credit</dd>
          </div>
          <div>
            <dt>Cleared ratio</dt>
            <dd>{formatPercent(report.clearedRatio)}</dd>
          </div>
          <div>
            <dt>Total kewajiban</dt>
            <dd>{formatCredit(report.totalObligation)} credit</dd>
          </div>
          <div>
            <dt>Batas bayar</dt>
            <dd>{formatTime(report.paymentDeadline)}</dd>
          </div>
        </dl>
      </div>
      <h2>Status per anggota</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Anggota</th>
              <th scope="col" className="num">Posisi bersih</th>
              <th scope="col" className="num">Terhapus</th>
              <th scope="col">Keterangan</th>
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
        loadingLabel="Memuat laporan"
        isEmpty={(d) => !d.committed || d.members.length === 0}
        empty="Epoch belum di-commit, jadi laporan kliring belum ada."
      >
        {(data) => <Report report={data} />}
      </QueryState>
      <PrunePanel epoch={epoch} />
    </>
  )
}
