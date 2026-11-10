import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '../api/client'
import type { DepositQuote, Job } from '../api/types'
import { CIRCLE } from '../config'
import { describeMarketError } from '../lib/marketError'

// Sample source assets for the 1Click branch; the full list from 1Click is outside this page's scope.
const ORIGIN_ASSETS = [
  { id: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', label: 'USDC on Base' },
]

const QUOTE_ERRORS: Record<string, string> = {
  refund_account_not_found: 'Refund account not found on NEAR. Check the account you are using.',
  one_click_error: 'The 1Click service has a problem or the amount is below the minimum. Try again later.',
  member_not_found: 'Account not registered. Complete join first.',
  nothing_due: 'No bill for this epoch.',
}

const JOB_LABEL: Record<string, string> = {
  waiting_deposit: 'Waiting for a deposit to the address above',
  processing: 'Deposit processing',
  ready_withdraw: 'USDT is in the Intents balance, ready for ft_withdraw',
  completed: 'Completed',
  failed: 'Failed. No further steps.',
  refunded: 'Refunded to the refund account. No further steps.',
  expired: 'Quote expired without a deposit. No further steps.',
}

const WARNING_LABEL: Record<string, string> = {
  deadline_risk: 'Risk of missing the payment deadline: the estimated swap time exceeds the payment window. Consider paying USDT directly.',
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
  /** Stake amount (smallest unit); ignored for `settle`. */
  amount?: string
  epoch?: number
  onReady: (ready: boolean) => void
}

// Other-asset branch (ADR-19): 1Click quote to the Intents balance, then watch the job until `ready_withdraw`.
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
      setError(e instanceof ApiError ? (QUOTE_ERRORS[e.code] ?? e.message) : describeMarketError(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="branch">
      <button type="button" onClick={() => void requestQuote()} disabled={loading}>
        {loading ? 'Requesting quote…' : 'Request 1Click quote'}
      </button>
      {error && <p className="state state-error" role="alert">{error}</p>}
      {quote?.warnings.map((w) => (
        <p key={w} className="state state-error" role="alert">{WARNING_LABEL[w] ?? w}</p>
      ))}
      {quote && (
        <dl>
          <dt>Deposit address</dt>
          <dd><code>{quote.depositAddress}</code></dd>
          <dt>Amount in</dt>
          <dd>{quote.amountIn}</dd>
          <dt>Destination</dt>
          <dd>
            <code>{quote.recipientType}</code>
          </dd>
          <dt>Quote deadline</dt>
          <dd>{quote.quoteDeadline}</dd>
        </dl>
      )}
      {status && <p className="state" role="status">Job status: {JOB_LABEL[status] ?? status}</p>}
    </div>
  )
}
