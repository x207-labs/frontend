import { GranteeProofError, RentError, buildGistContent, parseSshEd25519, checkAccessBeforeNextDay, encodeGranteeProof, granteeChallenge, parseGranteeProof, type GranteeProof } from '@x207/core'
import { useState } from 'react'
import { api } from '../api/client'
import type { RentChallenge, RentView } from '../api/types'
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
/** B4-F5 (review batch 4): the reference of the lessee as the broker can prove it. An SSH key must be `ssh-ed25519` (the proof is a raw ed25519 signature); a key of another type is accepted by the contract and by the broker's first check but can never be proven, so the grant could never open. */
export function granteeRefProblem(provider: string, ref: string): string | null {
  const text = ref.trim()
  if (text === '') return null
  if (provider === 'ssh') {
    if (!text.startsWith('ssh-ed25519 ')) return `Hanya kunci ssh-ed25519 yang bisa dibuktikan; ${text.split(/\s+/)[0]?.slice(0, 30) || 'kunci ini'} tidak bisa, jadi sewa ini tidak akan pernah terbuka. Buat kunci baru dengan ssh-keygen -t ed25519.`
    try {
      parseSshEd25519(text)
    } catch {
      return 'Baris kunci ssh-ed25519 tidak sah (blob tidak cocok).'
    }
  }
  if (provider === 'github' && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(text)) return 'Bukan login GitHub.'
  if (provider === 'discord' && !/^\d{15,21}$/.test(text)) return 'Bukan id pengguna Discord (angka 15 sampai 21 digit).'
  return null
}
const STATUS_LABEL: Record<string, string> = { active: 'Aktif', revoke_pending: 'Menunggu pencabutan', revoked: 'Dicabut' }
const now = () => Math.floor(Date.now() / 1000)

function Offer() {
  const [provider, setProvider] = useState('github')
  const [resource, setResource] = useState('')
  const [permission, setPermission] = useState('')
  const [price, setPrice] = useState('')
  const [cap, setCap] = useState('')
  const [ref, setRef] = useState('')
  const refProblem = granteeRefProblem(provider, ref)
  const info = PROVIDERS[provider]!
  const priceAtomic = toAtomic(price)
  const capAtomic = cap.trim() === '' ? null : toAtomic(cap)
  const problem = refProblem !== null ? refProblem : priceAtomic === null ? 'Harga per hari harus angka credit > 0.' : info.costly && capAtomic === null ? 'Akses berbiaya wajib punya batas belanja harian (daily_cap) > 0.' : null
  const scope = { provider, grantee_ref: ref.trim() === '' ? '<diisi penyewa saat offer_grant>' : ref.trim(), ...(resource.trim() ? { resource: resource.trim() } : {}), ...(permission.trim() ? { permission: permission.trim() } : {}), ...(capAtomic !== null ? { daily_cap: capAtomic } : {}) }
  const detail = JSON.stringify({ kind: 'access-rent', provider, ...(resource.trim() ? { resource: resource.trim() } : {}), ...(permission.trim() ? { permission: permission.trim() } : {}), price_per_day: priceAtomic, ...(capAtomic !== null ? { daily_cap: capAtomic } : {}) })
  return (
    <section className="form" aria-label="Pasang sewa akses">
      <h3>Pasang sewa akses (pemberi)</h3>
      <label><span>Penyedia</span><select value={provider} onChange={(e) => setProvider(e.target.value)}>{Object.entries(PROVIDERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
      <label><span>Referensi penyewa (grantee_ref; kosong = diisi saat offer_grant)</span><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={provider === 'ssh' ? 'ssh-ed25519 AAAA…' : provider === 'discord' ? '123456789012345678' : 'login'} /></label>
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

// FE-029, BE-057: the proof that the renter controls the reference `grantee_ref`. The broker is not trusted for the text that is signed: it is built again here from the circle of the
// configuration, the grant and the reference that the page shows, and only the nonce comes from the broker. The payment of the day and the field `proof` of
// `POST /grants/{id}/access` are sent by the x402 client or the agent of the renter; this panel only builds the text of the proof.
/** The three states of the reference of the lessee (batch 4, B4-F7): proven, not proven, and not applicable (the provider has no proof at all). */
export function proofKind(proof: string | null): 'verified' | 'unproven' | 'not_applicable' | 'unknown' {
  if (proof === 'verified') return 'verified'
  if (proof === 'not_applicable') return 'not_applicable'
  if (proof !== null && proof.startsWith('unproven')) return 'unproven'
  return 'unknown'
}
function ProofState({ proof, warnings }: { proof: string | null; warnings: string[] }) {
  const kind = proofKind(proof)
  const warned = warnings.includes('grantee_unproven')
  const text = {
    verified: 'Referensi terbukti: broker sudah memeriksa bahwa Anda mengendalikannya.',
    unproven: `Referensi belum terbukti (${proof}). Akses dibuka dengan peringatan grantee_unproven; siapa pun yang mengetahui nama akun itu tidak bisa dibedakan dari Anda.`,
    not_applicable: 'Penyedia ini tidak punya cara membuktikan pemilik referensi, jadi tidak ada keterangan bukti. Akses dibuka dengan peringatan grantee_unproven; ini bukan kegagalan bukti.',
    unknown: 'Belum ada keterangan bukti dari broker.',
  }[kind]
  return (
    <p data-testid="rent-proof-state" data-proof={kind} className={kind === 'unproven' ? 'state state-error' : 'state'}>
      {text}{warned && kind === 'verified' ? ' (broker masih memberi peringatan.)' : ''}
    </p>
  )
}

function GranteeProofPanel({ view, voucherKey, account }: { view: RentView; voucherKey: string; account: string | null }) {
  const [challenge, setChallenge] = useState<RentChallenge | null>(null)
  const [gist, setGist] = useState('')
  const [signature, setSignature] = useState('')
  const [proof, setProof] = useState<string | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const kind: GranteeProof['kind'] | null = view.provider === 'github' ? 'near-gist' : view.provider === 'ssh' ? 'ssh-signature' : view.provider === 'discord' ? 'oauth' : null

  async function fetchChallenge() {
    setError(null)
    setProof(null)
    setContent(null)
    try {
      const c = await api.rentChallenge(view.grantId)
      if (c.required) {
        if (c.grantId !== view.grantId || c.circle !== CONTRACT_ID || c.granteeRef !== view.granteeRef || typeof c.nonce !== 'string') throw new Error('Tantangan broker bukan untuk grant, lingkaran, atau referensi ini: tidak ditandatangani.')
        const expected = granteeChallenge({ circle: CONTRACT_ID, grantId: view.grantId, granteeRef: view.granteeRef, nonce: c.nonce })
        if (c.challenge !== expected) throw new Error('Teks tantangan dari broker berbeda dari yang dihitung di sini: tidak ditandatangani.')
      }
      setChallenge(c)
    } catch (e) {
      setChallenge(null)
      setError(describeMarketError(e))
    }
  }
  const input = () => ({ circle: CONTRACT_ID, grantId: view.grantId, granteeRef: view.granteeRef, nonce: challenge!.nonce! })
  function makeContent() {
    setError(null)
    try {
      if (account === null) throw new Error('Masuk dengan wallet dulu.')
      setContent(buildGistContent(input(), account, voucherKey))
    } catch (e) {
      setError(e instanceof GranteeProofError ? e.message : describeMarketError(e))
    }
  }
  function makeProof() {
    setError(null)
    try {
      const text = encodeGranteeProof(kind === 'near-gist' ? { kind, gist: gist.trim() } : { kind: 'ssh-signature', signature: signature.trim() })
      parseGranteeProof(text) // the broker would refuse a malformed proof and use up the challenge: fail here instead
      setProof(text)
    } catch (e) {
      setProof(null)
      setError(e instanceof GranteeProofError ? e.message : describeMarketError(e))
    }
  }
  return (
    <div data-testid="rent-proof-panel">
      <h4>Bukti pemilik referensi</h4>
      <ProofState proof={view.proof ?? null} warnings={view.warnings ?? []} />
      {kind === null && <p className="state">Penyedia ini tidak memakai bukti dari halaman ini.</p>}
      {kind === 'oauth' && <p className="state">Bukti Discord lewat OAuth dibuat di sisi penyedia; halaman ini tidak menyimpan token OAuth.</p>}
      {(kind === 'near-gist' || kind === 'ssh-signature') && (
        <>
          <div><button type="button" onClick={() => void fetchChallenge()}>Ambil tantangan dari broker</button></div>
          {challenge && !challenge.required && <p className="state" data-testid="rent-challenge-none">Broker tidak meminta bukti untuk grant ini.</p>}
          {challenge?.required && (
            <>
              <pre data-testid="rent-challenge">{challenge.challenge}</pre>
              <p className="state">Berlaku sampai {challenge.expiresAt}. Bukti pertama yang diperiksa menghabiskan tantangan ini; bukti tidak bisa dicoba ulang.</p>
              {kind === 'near-gist' ? (
                <>
                  <div><button type="button" disabled={voucherKey.trim() === ''} onClick={makeContent}>Tandatangani untuk gist</button></div>
                  {content && <><p>Isi gist publik milik akun GitHub <code>{view.granteeRef}</code> (satu berkas):</p><pre data-testid="rent-gist-content">{content}</pre></>}
                  <label><span>ID gist</span><input value={gist} onChange={(e) => setGist(e.target.value)} placeholder="0123abcd…" /></label>
                </>
              ) : (
                <label><span>Tanda tangan ed25519 atas tantangan oleh kunci SSH (base64; dibuat di mesin Anda dengan <code>signSshChallenge</code>)</span><input value={signature} onChange={(e) => setSignature(e.target.value)} /></label>
              )}
              <div><button type="button" disabled={kind === 'near-gist' ? gist.trim() === '' : signature.trim() === ''} onClick={makeProof}>Susun bukti</button></div>
            </>
          )}
          {proof && <><p>Kirim teks ini sebagai <code>proof</code> pada <code>POST /grants/{view.grantId}/access</code> hari pertama (klien x402 atau agent Anda):</p><pre data-testid="rent-proof">{proof}</pre></>}
          {error && <p className="state state-error" role="alert" data-testid="rent-proof-error">{error}</p>}
        </>
      )}
    </div>
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
      setCheck({ ok: true, text: `Broker melaporkan akses berjalan sampai ${view.paidUntil}. Itu keterangan broker, bukan bukti dari penyedia (broker bisa mencabut lebih awal): coba aksesnya langsung ke penyedia hari ini, lalu bayar hari berikutnya hanya sehari sekali lewat klien x402 atau agent Anda.` })
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
          <GranteeProofPanel view={view} voucherKey={voucherKey} account={account} />
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
