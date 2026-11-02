import { useDaoProposals, useParams, useParamsHistory } from '../api/queries'
import type { DaoProposal, Params } from '../api/types'
import { NEAR_NETWORK } from '../config'
import { QueryState } from '../components/QueryState'
import { formatCredit, formatNumber } from '../lib/format'

type Key = keyof Params

const percent = (bps: number) => `${formatNumber(bps / 100)}%`
const minutes = (seconds: number) => `${formatNumber(seconds / 60)} menit`

const rows: { key: Key; label: string; format: (value: never) => string }[] = [
  { key: 'epoch_length', label: 'Panjang epoch', format: minutes },
  { key: 'payment_window', label: 'Jendela bayar', format: minutes },
  { key: 'proposal_window', label: 'Jendela proposal kliring', format: minutes },
  { key: 'base_limit_ratio', label: 'Rasio limit awal terhadap stake', format: percent },
  { key: 'limit_growth', label: 'Kenaikan limit dari pelunasan tunai', format: percent },
  { key: 'limit_cap', label: 'Batas limit (credit)', format: (v: string) => formatCredit(v) },
  { key: 'limit_decay', label: 'Peluruhan limit', format: percent },
  {
    key: 'fees',
    label: 'Biaya',
    format: (v: Params['fees']) => `kliring ${percent(v.clearing_fee_bps)}, solver ${percent(v.solver_fee_bps)}`,
  },
  { key: 'admission', label: 'Penerimaan anggota', format: (v: string) => v },
]

// Riwayat memuat nilai mentah per field; formatnya mengikuti tabel parameter.
function formatField(field: string, value: unknown): string {
  const row = rows.find((r) => r.key === field)
  return row ? row.format(value as never) : String(value)
}

const EXPLORER_ACCOUNT = NEAR_NETWORK === 'mainnet' ? 'https://nearblocks.io/address/' : 'https://testnet.nearblocks.io/address/'

const STATUS_LABEL: Record<DaoProposal['status'], string> = {
  InProgress: 'Terbuka',
  Approved: 'Disetujui',
  Rejected: 'Ditolak',
  Removed: 'Dihapus',
  Expired: 'Kedaluwarsa',
  Moved: 'Dipindah',
  Failed: 'Gagal dijalankan',
}

/** Sputnik `vote_counts` per peran dijumlahkan: [setuju, tolak, hapus]. */
export function tally(votes: DaoProposal['votes']): { approve: number; reject: number; remove: number } {
  const total = { approve: 0, reject: 0, remove: 0 }
  for (const [a, r, x] of Object.values(votes)) {
    total.approve += a
    total.reject += r
    total.remove += x
  }
  return total
}

const describeParams = (params: DaoProposal['params']) =>
  params === null
    ? '-'
    : Object.entries(params)
        .map(([key, value]) => `${key} = ${formatField(key, value)}`)
        .join(', ')

// FE-015: proposal `set_params` Sputnik DAO. Hanya baca; suara diberikan di DAO, bukan di halaman ini.
function DaoProposals() {
  const proposals = useDaoProposals()
  const params = useParams()
  const next = params.data?.nextEpoch
  return (
    <>
      <h2>Proposal DAO</h2>
      {next && params.data?.nextEpochEffective != null && (
        <p className="state" aria-label="Parameter epoch berikutnya">
          Berlaku mulai epoch {params.data.nextEpochEffective}:{' '}
          {Object.entries(next)
            .map(([key, value]) => `${key} = ${formatField(key, value)}`)
            .join(', ')}
          .
        </p>
      )}
      <QueryState
        query={proposals}
        loadingLabel="Memuat proposal DAO"
        isEmpty={(d) => d.items.length === 0}
        empty="Belum ada proposal set_params di DAO."
      >
        {(data) => {
          const open = data.items.filter((p) => p.status === 'InProgress')
          const closed = data.items.filter((p) => p.status !== 'InProgress')
          const table = (items: DaoProposal[], label: string) => (
            <div className="table-wrap">
              <table aria-label={label}>
                <thead>
                  <tr>
                    <th scope="col" className="num">ID</th>
                    <th scope="col">Status</th>
                    <th scope="col">Perubahan</th>
                    <th scope="col">Pengusul</th>
                    <th scope="col" className="num">Suara (setuju / tolak / hapus)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const t = tally(p.votes)
                    return (
                      <tr key={p.id}>
                        <td className="num">
                          <a href={`${EXPLORER_ACCOUNT}${data.dao}`} target="_blank" rel="noreferrer">
                            {p.id}
                          </a>
                        </td>
                        <td>{STATUS_LABEL[p.status] ?? p.status}</td>
                        <td>
                          <code className="plain">set_params</code> {describeParams(p.params)}
                          <br />
                          <small>{p.description}</small>
                        </td>
                        <td>{p.proposer}</td>
                        <td className="num">{`${t.approve} / ${t.reject} / ${t.remove}`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
          return (
            <>
              <p>
                DAO: <a href={`${EXPLORER_ACCOUNT}${data.dao}`} target="_blank" rel="noreferrer">{data.dao}</a>. Suara diberikan di DAO oleh anggota dewan.
              </p>
              {open.length === 0 ? <p className="state">Tidak ada proposal yang terbuka.</p> : table(open, 'Proposal terbuka')}
              {closed.length > 0 && (
                <>
                  <h3>Proposal selesai</h3>
                  {table(closed, 'Proposal selesai')}
                </>
              )}
            </>
          )
        }}
      </QueryState>
    </>
  )
}

export function Governance() {
  const params = useParams()
  const history = useParamsHistory()
  return (
    <>
      <QueryState query={params} loadingLabel="Memuat parameter">
        {(data) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Parameter</th>
                  <th scope="col">Nama di kontrak</th>
                  <th scope="col" className="num">Nilai aktif</th>
                  <th scope="col">Perubahan tertunda</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ key, label, format }) => {
                  const next = data.nextEpoch?.[key]
                  return (
                    <tr key={key}>
                      <td>{label}</td>
                      <td>
                        <code className="plain">{key}</code>
                      </td>
                      <td className="num">{format(data.active[key] as never)}</td>
                      <td>
                        {next !== undefined &&
                          `${format(next as never)}, berlaku mulai epoch ${data.nextEpochEffective}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
      <DaoProposals />
      <h2>Riwayat perubahan</h2>
      <QueryState
        query={history}
        loadingLabel="Memuat riwayat"
        isEmpty={(d) => d.items.length === 0}
        empty="Belum ada perubahan parameter."
      >
        {(data) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Parameter</th>
                  <th scope="col" className="num">Dari</th>
                  <th scope="col" className="num">Menjadi</th>
                  <th scope="col" className="num">Berlaku mulai epoch</th>
                  <th scope="col" className="num">Blok</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={`${item.blockHeight}-${item.field}`}>
                    <td>
                      <code className="plain">{item.field}</code>
                    </td>
                    <td className="num">{formatField(item.field, item.oldValue)}</td>
                    <td className="num">{formatField(item.field, item.newValue)}</td>
                    <td className="num">{item.effectiveEpoch}</td>
                    <td className="num">{item.blockHeight}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
    </>
  )
}
