import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '../api/client'
import type { DepositQuote, Job } from '../api/types'
import { CIRCLE } from '../config'

// Aset asal contoh untuk cabang 1Click; daftar penuh dari 1Click di luar lingkup halaman ini.
const ORIGIN_ASSETS = [
  { id: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', label: 'USDC di Base' },
]

const QUOTE_ERRORS: Record<string, string> = {
  refund_account_not_found: 'Akun refund tidak ditemukan di NEAR. Periksa akun yang dipakai.',
  one_click_error: 'Layanan 1Click bermasalah atau jumlah di bawah minimum. Coba lagi nanti.',
  member_not_found: 'Akun belum terdaftar. Selesaikan join dulu.',
  nothing_due: 'Tidak ada tagihan untuk epoch ini.',
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

const WARNING_LABEL: Record<string, string> = {
  deadline_risk: 'Risiko melewati batas bayar: perkiraan waktu swap melewati payment window. Pertimbangkan membayar USDT langsung.',
}

function useJob(jobId: string | null) {
  return useQuery<Job>({
    queryKey: ['job', jobId],
    queryFn: () => api.job(jobId!),
    enabled: jobId !== null,
  })
}

type Props = {
  purpose: 'stake' | 'settle'
  account: string
  /** Jumlah stake (satuan terkecil); diabaikan untuk `settle`. */
  amount?: string
  epoch?: number
  onReady: (ready: boolean) => void
}

// Cabang aset lain (ADR-19): quote 1Click ke saldo Intents, lalu pantau job sampai `ready_withdraw`.
export function DepositBranch({ purpose, account, amount, epoch, onReady }: Props) {
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
          purpose,
          circle: CIRCLE,
          account,
          ...(purpose === 'stake' ? { amount } : { epoch }),
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
      {quote?.warnings.map((w) => (
        <p key={w} className="state state-error" role="alert">{WARNING_LABEL[w] ?? w}</p>
      ))}
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
