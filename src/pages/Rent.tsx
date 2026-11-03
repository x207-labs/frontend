import { RentError, checkAccessBeforeNextDay } from '@x207/core'
import { useState } from 'react'
import { api } from '../api/client'
import type { RentView } from '../api/types'
import { VoucherKeyField } from '../components/VoucherKeyField'
import { CONTRACT_ID } from '../config'
import { signMessageWithVoucher } from '../lib/barter'
import { toAtomic, fromAtomic } from '../lib/amount'
import { formatCredit } from '../lib/format'
import { describeMarketError } from '../lib/marketError'
import { useWallet } from '../wallet/WalletContext'

// FE-029: sewa akses harian (pipeline P2, ADR-47), dari README broker (BE-060). Pemberi menyiapkan scope dan listing sewa; penyewa melihat keadaan akses, biaya hari ini, memeriksa
// akses sebelum membayar hari berikutnya (aturan satu-satunya ada di SDK: `checkAccessBeforeNextDay`), dan berhenti sewa. Pembayaran harian dilakukan klien x402 atau agent, bukan halaman ini.
export const PROVIDERS: Record<string, { label: string; costly: boolean; note: string }> = {
  github: { label: 'GitHub (kolaborator repo atau kursi org)', costly: true, note: 'Ketentuan GitHub membatasi berbagi akun; kolaborator dan kursi org bukan berbagi kata sandi. Anda yang menanggung kebijakan org Anda.' },
  discord: { label: 'Discord (role di server)', costly: false, note: 'Role hanya untuk anggota server yang sudah ada; ketentuan Discord melarang menjual akun, bukan role.' },
  ssh: { label: 'SSH (kunci dengan command= dan kedaluwarsa)', costly: false, note: 'Kunci berlaku sampai akhir hari yang dibayar di mesin Anda sendiri, walau broker mati.' },
  's3-presigned': { label: 'S3 (URL presigned)', costly: false, note: 'URL presigned tidak bisa ditarik kembali; kerugian paling banyak satu hari.' },
  'aws-sts': { label: 'AWS (role dengan permission boundary)', costly: true, note: 'Sesi tidak bisa ditarik sebelum habis. Biaya nyata ditagih per hari dengan batas harian.' },
  mock: { label: 'Penyedia tiruan (demo)', costly: false, note: 'Hanya untuk demo; tidak menyentuh layanan nyata.' },
}
const STATUS_LABEL: Record<string, string> = { active: 'Aktif', revoke_pending: 'Menunggu pencabutan', revoked: 'Dicabut' }
const now = () => Math.floor(Date.now() / 1000)

function Offer() {
  const [provider, setProvider] = useState('github')
  const [resource, setResource] = useState('')
  const [permission, setPermission] = useState('')
  const [price, setPrice] = useState('')
  const [cap, setCap] = useState('')
  const info = PROVIDERS[provider]!
  const priceAtomic = toAtomic(price)
  const capAtomic = cap.trim() === '' ? null : toAtomic(cap)
  const problem = priceAtomic === null ? 'Harga per hari harus angka credit > 0.' : info.costly && capAtomic === null ? 'Akses berbiaya wajib punya batas belanja harian (daily_cap) > 0.' : null
  const scope = { provider, grantee_ref: '<diisi penyewa saat offer_grant>', ...(resource.trim() ? { resource: resource.trim() } : {}), ...(permission.trim() ? { permission: permission.trim() } : {}), ...(capAtomic !== null ? { daily_cap: capAtomic } : {}) }
  const detail = JSON.stringify({ kind: 'access-rent', provider, ...(resource.trim() ? { resource: resource.trim() } : {}), ...(permission.trim() ? { permission: permission.trim() } : {}), price_per_day: priceAtomic, ...(capAtomic !== null ? { daily_cap: capAtomic } : {}) })
  return (
    <section className="form" aria-label="Pasang sewa akses">
      <h3>Pasang sewa akses (pemberi)</h3>
      <label><span>Penyedia</span><select value={provider} onChange={(e) => setProvider(e.target.value)}>{Object.entries(PROVIDERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
      <label><span>Sumber daya (repo, role, perintah, objek)</span><input value={resource} onChange={(e) => setResource(e.target.value)} /></label>
      <label><span>Izin</span><input value={permission} onChange={(e) => setPermission(e.target.value)} placeholder="pull" /></label>
      <label><span>Harga per hari (credit)</span><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" /></label>
      <label><span>Batas belanja harian di penyedia (credit){info.costly ? ' · wajib' : ' · opsional'}</span><input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" /></label>
      <p className="state" role="note" data-testid="rent-provider-note">{info.note} Token admin penyedia tetap di mesin Anda: broker dijalankan sendiri oleh pemberi.</p>
      {problem && <p className="state state-error" role="alert" data-testid="rent-offer-error">{problem}</p>}
      {!problem && (
        <>
          <p>Scope untuk <code>offer_grant</code> (<code>limits.scope</code>); penyewa mengisi <code>grantee_ref</code>, dan referensi itu dikunci di rantai:</p>
          <pre data-testid="rent-scope">{JSON.stringify(scope)}</pre>
          <p>Detail listing:</p>
          <pre data-testid="rent-detail">{detail}</pre>
          <p>Per hari: {formatCredit(priceAtomic!)} credit{capAtomic !== null ? `, batas biaya nyata ${fromAtomic(capAtomic)} credit` : ''}. Penyewa yang berhenti membayar kehilangan aksesnya di akhir hari yang dibayar.</p>
        </>
      )}
    </section>
  )
}

function Renter({ voucherKey, onVoucherKey }: { voucherKey: string; onVoucherKey: (v: string) => void }) {
  const { account } = useWallet()
  const [id, setId] = useState('')
  const [view, setView] = useState<RentView | null>(null)
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const grantId = Number(id)
  const valid = /^[1-9]\d{0,9}$/.test(id.trim())

  async function load() {
    setError(null)
    setCheck(null)
    setMessage(null)
    try {
      setView(await api.rent(grantId))
    } catch (e) {
      setView(null)
      setError(describeMarketError(e))
    }
  }
  async function checkNext() {
    if (!view) return
    try {
      await checkAccessBeforeNextDay({ grantId: view.grantId, view: { grantId: view.grantId, status: view.status, paidUntil: Date.parse(view.paidUntil) }, nowMs: Date.now() })
      setCheck({ ok: true, text: 'Akses masih berjalan: aman membayar hari berikutnya (lewat klien x402 atau agent Anda).' })
    } catch (e) {
      setCheck({ ok: false, text: e instanceof RentError ? `${e.code}: hari berikutnya tidak dibayar.` : String(e) })
    }
  }
  async function stop() {
    if (!account || !view) return
    setError(null)
    try {
      const notice = { circle: CONTRACT_ID, grant_id: view.grantId, actor: account, action: 'stop', at: now() }
      const next = await api.stopRent(view.grantId, notice, await signMessageWithVoucher(JSON.stringify(notice), CONTRACT_ID, voucherKey))
      setView(next)
      setMessage('Berhenti sewa dikirim: akses dicabut di akhir hari ini atau sekarang.')
    } catch (e) {
      setError(describeMarketError(e))
    }
  }
  return (
    <section className="form" aria-label="Akses saya">
      <h3>Akses saya (penyewa)</h3>
      <label><span>Nomor grant</span><input value={id} onChange={(e) => setId(e.target.value)} inputMode="numeric" /></label>
      <div><button type="button" disabled={!valid} onClick={() => void load()}>Lihat akses</button></div>
      {view && (
        <div data-testid="rent-view">
          <dl className="status-panel">
            <dt>Penyedia</dt><dd>{view.provider} · <code>{view.granteeRef}</code></dd>
            <dt>Status</dt><dd>{STATUS_LABEL[view.status] ?? view.status}{view.reason ? ` (${view.reason})` : ''}</dd>
            <dt>Terbayar sampai</dt><dd>{view.paidUntil}</dd>
            <dt>Biaya nyata hari ini</dt><dd data-testid="rent-today">{view.today?.cost == null ? 'tanpa biaya' : `${formatCredit(view.today.cost)} credit`}{view.today?.billed != null && ` · ditagih ${formatCredit(view.today.billed)}`}</dd>
          </dl>
          {view.revokePending && <p className="state state-error" role="status">Pencabutan tertunda: percobaan ke-{view.revokePending.attempts}{view.revokePending.lastError ? ` (${view.revokePending.lastError})` : ''}.</p>}
          <div className="actions">
            <button type="button" onClick={() => void checkNext()}>Periksa sebelum bayar hari berikutnya</button>
            <button type="button" disabled={!account || voucherKey.trim() === '' || view.status === 'revoked'} onClick={() => void stop()}>Berhenti sewa</button>
          </div>
          {check && <p className={check.ok ? 'state' : 'state state-error'} role="status" data-testid="rent-check">{check.text}</p>}
          <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />
        </div>
      )}
      {message && <p className="state" role="status">{message}</p>}
      {error && <p className="state state-error" role="alert">{error}</p>}
    </section>
  )
}

export function Rent() {
  const [voucherKey, setVoucherKey] = useState('')
  return (
    <>
      <h2>Sewa akses</h2>
      <p className="state">Akses disewa per hari: bayar satu hari di depan, hari berikutnya hanya bila akses masih berjalan, jadi kerugian tiap pihak paling banyak satu hari.</p>
      <Offer />
      <Renter voucherKey={voucherKey} onVoucherKey={setVoucherKey} />
    </>
  )
}
