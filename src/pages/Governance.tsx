import { useParams, useParamsHistory } from '../api/queries'
import type { Params } from '../api/types'
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
