import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '../api/client'
import { useMembers } from '../api/queries'
import type { DepositQuote, Job } from '../api/types'
import { QueryState } from '../components/QueryState'
import { TxResult } from '../components/TxResult'
import { CIRCLE } from '../config'
import { useSignTransaction, useWallet } from '../wallet/WalletContext'
import { ftWithdrawTx, joinTx, stakeTx } from '../wallet/transactions'
import type { FunctionCallTx } from '../wallet/types'

const PUBKEY = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,}$/
const TERMS_HASH = /^[0-9a-f]{64}$/
const DECIMALS = 6

type Source = 'near' | 'intents' | 'other'

// Aset asal contoh untuk cabang 1Click; daftar penuh dari 1Click di luar lingkup halaman ini.
const ORIGIN_ASSETS = [
  { id: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', label: 'USDC di Base' },
]

/** "12.5" -> "12500000" (6 desimal); null bila bukan angka > 0. */
export function toAtomic(input: string): string | null {
  const match = input.trim().match(/^(\d+)(?:\.(\d{1,6}))?$/)
  if (!match) return null
  const atomic = BigInt(match[1] + (match[2] ?? '').padEnd(DECIMALS, '0'))
  return atomic > 0n ? atomic.toString() : null
}

const QUOTE_ERRORS: Record<string, string> = {
  refund_account_not_found: 'Akun refund tidak ditemukan di NEAR. Periksa akun yang dipakai.',
  one_click_error: 'Layanan 1Click bermasalah atau jumlah di bawah minimum. Coba lagi nanti.',
  member_not_found: 'Akun belum terdaftar. Selesaikan join dulu.',
}

const JOB_LABEL: Record<string, string> = {
  waiting_deposit: 'Menunggu deposit ke alamat di atas',
  processing: 'Deposit diproses',
  ready_withdraw: 'USDT sudah di saldo Intents, siap ft_withdraw',
  completed: 'Selesai',
  failed: 'Gagal. Tidak ada langkah lanjut.',
  refunded: 'Dikembalikan ke akun refund. Tidak ada langkah lanjut.',
  expired: 'Quote kedaluwarsa tanpa deposit. Tidak ada langkah lanjut.',
}

function useJob(jobId: string | null) {
  return useQuery<Job>({
    queryKey: ['job', jobId],
    queryFn: () => api.job(jobId!),
    enabled: jobId !== null,
  })
}

function OtherAssetBranch({ account, amount, onReady }: { account: string; amount: string; onReady: (ready: boolean) => void }) {
  const [quote, setQuote] = useState<DepositQuote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const job = useJob(quote?.jobId ?? null)
  const status = job.data?.status ?? quote?.status ?? null

  useEffect(() => onReady(status === 'ready_withdraw'), [status, onReady])

  async function requestQuote() {
    setLoading(true)
    setError(null)
    try {
      setQuote(
        await api.depositQuote({
          purpose: 'stake',
          circle: CIRCLE,
          account,
          amount,
          originAsset: ORIGIN_ASSETS[0].id,
          refundType: 'INTENTS',
          refundTo: account,
          dry: false,
        }),
      )
    } catch (e) {
      setQuote(null)
      setError(e instanceof ApiError ? (QUOTE_ERRORS[e.code] ?? e.message) : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="branch">
      <button type="button" onClick={() => void requestQuote()} disabled={loading}>
        {loading ? 'Meminta quote…' : 'Minta quote 1Click'}
      </button>
      {error && <p className="state state-error" role="alert">{error}</p>}
      {quote && (
        <dl>
          <dt>Alamat deposit</dt>
          <dd><code>{quote.depositAddress}</code></dd>
          <dt>Jumlah masuk</dt>
          <dd>{quote.amountIn}</dd>
          <dt>Tujuan</dt>
          <dd>
            <code>{quote.recipientType}</code>
          </dd>
          <dt>Batas quote</dt>
          <dd>{quote.quoteDeadline}</dd>
        </dl>
      )}
      {status && <p className="state" role="status">Status job: {JOB_LABEL[status] ?? status}</p>}
    </div>
  )
}

function JoinForm({ registered }: { registered: boolean }) {
  const { account } = useWallet()
  const { state, sign } = useSignTransaction()
  const [pubkey, setPubkey] = useState('')
  const [termsHash, setTermsHash] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [amount, setAmount] = useState('')
  const [source, setSource] = useState<Source>('near')
  const [withdrawReady, setWithdrawReady] = useState(false)
  const [step, setStep] = useState<string | null>(null)

  const atomic = toAtomic(amount)
  const pubkeyOk = PUBKEY.test(pubkey)
  const hashOk = TERMS_HASH.test(termsHash)
  const signing = state.kind === 'signing'
  const needsJoin = !registered
  const valid = (!needsJoin || (pubkeyOk && hashOk && agreed)) && atomic !== null
  const canSend = Boolean(account) && valid && !signing && (source !== 'other' || withdrawReady)

  async function run() {
    if (!atomic || !account) return
    const txs: Array<[string, FunctionCallTx]> = []
    if (source !== 'near') txs.push(['ft_withdraw', ftWithdrawTx(account, atomic)])
    if (needsJoin) txs.push(['join', joinTx(pubkey, termsHash)])
    txs.push(['stake', stakeTx(atomic)])
    // Satu per satu: tiap transaksi menunggu tanda tangan pemilik (wallet menolak batch lintas receiver).
    for (const [name, tx] of txs) {
      setStep(name)
      if (!(await sign(tx))) break
    }
    setStep(null)
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        void run()
      }}
    >
      {!account && <p className="state">Masuk dengan wallet untuk bergabung ke lingkaran.</p>}
      {account && registered && <p className="state">Akun {account} sudah terdaftar; tambah stake saja.</p>}
      {needsJoin && (
        <>
          <label>
            <span>
              Kunci voucher (<code className="plain">pubkey_voucher</code>)
            </span>
            <input value={pubkey} onChange={(e) => setPubkey(e.target.value)} placeholder="ed25519:…" disabled={!account} />
            {pubkey && !pubkeyOk && <small className="state-error">Harus berformat ed25519: diikuti base58.</small>}
          </label>
          <label>
            <span>
              Hash syarat lingkaran (<code className="plain">terms_hash</code>)
            </span>
            <input value={termsHash} onChange={(e) => setTermsHash(e.target.value)} disabled={!account} />
            {termsHash && !hashOk && <small className="state-error">Harus 64 karakter heksadesimal huruf kecil.</small>}
          </label>
          <label className="check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={!account} />
            <span>Saya menyetujui syarat lingkaran dengan hash di atas.</span>
          </label>
          {!agreed && account && <small className="state-error">Persetujuan syarat diperlukan.</small>}
        </>
      )}
      <label>
        <span>Jumlah stake (USDT)</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" disabled={!account} />
        {amount && atomic === null && <small className="state-error">Jumlah harus lebih dari 0.</small>}
      </label>
      <label>
        <span>Sumber USDT</span>
        <select value={source} onChange={(e) => setSource(e.target.value as Source)} disabled={!account}>
          <option value="near">USDT di akun NEAR</option>
          <option value="intents">USDT di saldo Intents</option>
          <option value="other">Aset lain lewat 1Click</option>
        </select>
      </label>
      {source === 'other' && account && atomic && (
        <OtherAssetBranch account={account} amount={atomic} onReady={setWithdrawReady} />
      )}
      <div>
        <button type="submit" disabled={!canSend}>
          {signing ? 'Menunggu wallet…' : source === 'near' ? 'Tanda tangani join dan stake' : 'Tanda tangani withdraw, join, dan stake'}
        </button>
      </div>
      {step && <p className="state" role="status">Langkah: {step}</p>}
      <TxResult state={state} />
    </form>
  )
}

function useRegistered(account: string | null): boolean {
  const query = useQuery({
    queryKey: ['member', account],
    queryFn: () => api.member(account!),
    enabled: account !== null,
    retry: false,
  })
  return Boolean(query.data)
}

export function Onboarding() {
  const members = useMembers()
  const { account } = useWallet()
  const registered = useRegistered(account)
  return (
    <>
      <QueryState query={members} loadingLabel="Memuat anggota">
        {(data) => (
          <p>
            {data.items.length} anggota terdaftar di lingkaran {CIRCLE}.
          </p>
        )}
      </QueryState>
      <h2>Bergabung</h2>
      <JoinForm registered={registered} />
    </>
  )
}
