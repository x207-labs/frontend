import { useState } from 'react'
import { useGrants, useMembers } from '../api/queries'
import type { Grant, GrantEscrow, GrantStatus } from '../api/types'
import { QueryState } from '../components/QueryState'
import { formatCredit, shortAccount } from '../lib/format'
import { useWallet } from '../wallet/WalletContext'

// FE-017 (F8): grant akses per anggota dari D9 `grants` (BE-038). Hanya baca. Kelas A sampai D seperti registri D10; rahasia tidak ada di D9.
const STATUS_LABEL: Record<GrantStatus, string> = { offered: 'Ditawarkan', active: 'Aktif', revoked: 'Dicabut', expired: 'Kedaluwarsa' }
const REASON_LABEL: Record<string, string> = {
  grantor: 'dicabut pemberi',
  grantee: 'dicabut penerima',
  operator: 'dicabut operator',
  expired: 'masa berlaku habis',
  defaulted: 'penerima gagal bayar (defaulted)',
}
const CLASS_LABEL: Record<string, string> = { A: 'A: dialihkan', B: 'B: kredensial turunan', C: 'C: broker TEE', D: 'D: endpoint x402', X: 'X: ditolak' }

const ESCROW_STATE_LABEL: Record<string, string> = {
  held: 'dipegang kontrak',
  completing: 'sedang diserahkan',
  cancelling: 'sedang dikembalikan',
  delivered: 'sudah diserahkan',
  cancelled: 'dikembalikan ke pemberi',
  stuck: 'macet',
}

/** Escrow kelas A: NFT, atau jumlah persis token NEP-141 dalam satuan token itu (bukan credit). */
export function EscrowCell({ escrow }: { escrow: GrantEscrow | null | undefined }) {
  if (!escrow) return <>-</>
  const state = ESCROW_STATE_LABEL[escrow.state] ?? escrow.state
  return escrow.kind === 'ft' ? (
    <>
      Token <code className="plain">{shortAccount(escrow.ftContract)}</code>: {escrow.amount} satuan token ({state})
    </>
  ) : (
    <>
      NFT <code className="plain">{shortAccount(escrow.nftContract)}</code> #{escrow.tokenId} ({state})
    </>
  )
}

/** Nanodetik (string) menjadi tanggal UTC; `belum tersedia` bila tidak terbaca. */
export function formatExpiry(ns: string): string {
  try {
    const ms = Number(BigInt(ns) / 1_000_000n)
    return new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC'
  } catch {
    return 'belum tersedia'
  }
}

type Row = Grant & { role: 'pemberi' | 'penerima' }

function GrantTable({ rows }: { rows: Row[] }) {
  const hasToken = rows.some((g) => g.escrow?.kind === 'ft')
  return (
    <div className="table-wrap">
      {hasToken && (
        <p className="state" role="note" data-testid="ft-escrow-warning">
          Escrow token (kelas A): kontrak memegang <strong>jumlah persis</strong> yang tertulis di grant. Token dengan biaya transfer tidak didukung: jumlah yang
          tiba lebih kecil, jadi titipannya ditolak dan token kembali ke pemberi. Token terbatas (whitelist, pembekuan) bisa menolak penyerahan ke pembeli;
          pembayaran pembeli lalu dibatalkan dan grant tetap ditawarkan. Pembeli harus terdaftar di kontrak token (<code className="plain">storage_deposit</code>).
        </p>
      )}
      <table aria-label="Daftar grant">
        <thead>
          <tr>
            <th scope="col" className="num">ID</th>
            <th scope="col">Peran</th>
            <th scope="col">Jenis aset</th>
            <th scope="col">Kelas</th>
            <th scope="col">Pemberi</th>
            <th scope="col">Penerima</th>
            <th scope="col" className="num">Harga</th>
            <th scope="col">Status</th>
            <th scope="col">Berlaku sampai</th>
            <th scope="col">Alasan pencabutan</th>
            <th scope="col">Escrow</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.grantId}>
              <td className="num">{g.grantId}</td>
              <td>{g.role}</td>
              <td>
                <code className="plain">{g.assetType}</code>
              </td>
              <td>{CLASS_LABEL[g.class] ?? g.class}</td>
              <td>{shortAccount(g.grantor)}</td>
              <td>{g.grantee ? shortAccount(g.grantee) : '-'}</td>
              <td className="num">{`${formatCredit(g.unitPrice)} per ${g.unit}`}</td>
              <td>
                <span className={g.status === 'revoked' ? 'member-suspended' : undefined}>{STATUS_LABEL[g.status] ?? g.status}</span>
              </td>
              <td>{formatExpiry(g.expiresAt)}</td>
              <td>{g.revokeReason ? (REASON_LABEL[g.revokeReason] ?? g.revokeReason) : '-'}</td>
              <td>
                <EscrowCell escrow={g.escrow} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Grants() {
  const members = useMembers()
  const { account: wallet } = useWallet()
  const [chosen, setChosen] = useState('')
  const [status, setStatus] = useState('')
  const account = chosen || wallet || members.data?.items[0]?.account || null
  const filter: Record<string, string> = status ? { status } : {}
  const asGrantee = useGrants(account ? { grantee: account, ...filter } : {}, account !== null)
  const asGrantor = useGrants(account ? { grantor: account, ...filter } : {}, account !== null)

  const rows: Row[] =
    asGrantee.data && asGrantor.data
      ? [
          ...asGrantor.data.items.map((g) => ({ ...g, role: 'pemberi' as const })),
          ...asGrantee.data.items.filter((g) => g.grantor !== account).map((g) => ({ ...g, role: 'penerima' as const })),
        ].sort((a, b) => a.grantId - b.grantId)
      : []
  // satu query bersama untuk status loading dan galat
  const query = asGrantee.isError ? asGrantee : asGrantor.isError ? asGrantor : asGrantee.data && asGrantor.data ? { ...asGrantee, data: { items: rows } } : asGrantee

  return (
    <>
      <p>Grant akses (F8): anggota menyewakan akses tanpa menyerahkan rahasianya. Data dari read API; rahasia tidak pernah ada di sana.</p>
      <label>
        <span>Anggota</span>
        <select value={account ?? ''} onChange={(e) => setChosen(e.target.value)}>
          {members.data?.items.map((m) => (
            <option key={m.account} value={m.account}>
              {m.account}
            </option>
          ))}
          {account && !members.data?.items.some((m) => m.account === account) && <option value={account}>{account}</option>}
        </select>
      </label>
      <label>
        <span>Status</span>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua</option>
          {(Object.keys(STATUS_LABEL) as GrantStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <QueryState
        query={query as never}
        loadingLabel="Memuat grant"
        isEmpty={(d: { items: Row[] }) => d.items.length === 0}
        empty="Anggota ini belum punya grant."
      >
        {(data: { items: Row[] }) => <GrantTable rows={data.items} />}
      </QueryState>
    </>
  )
}
