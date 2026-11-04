import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '../api/client'
import type { WithdrawQuote } from '../api/types'
import { CIRCLE, INTENTS_EXPLORER_URL } from '../config'
import { toAtomic } from '../lib/amount'
import { formatCredit } from '../lib/format'
import { useWallet } from '../wallet/WalletContext'
import { ErrorNotice, Loading } from './QueryState'

const CHAINS = {
  base: { label: 'Base (USDC)', asset: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near' },
  tron: { label: 'Tron (USDT)', asset: 'nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near' },
} as const
type Chain = keyof typeof CHAINS

const base64ToBytes = (value: string): Uint8Array => Uint8Array.from(atob(value), (c) => c.charCodeAt(0))

const JOB_LABEL: Record<string, string> = {
  quoted: 'Quote ready',
  awaiting_signature: 'Waiting for signature',
  processing: 'Withdrawal processing',
  completed: 'Completed',
  failed: 'Failed. No further steps.',
  refunded: 'Refunded. No further steps.',
  expired: 'Expired. No further steps.',
}

// FE-011: withdraw a creditor's Intents balance to another chain. Order: quote -> intent -> wallet signature -> submit -> polling.
export function WithdrawPanel({ account }: { account: string }) {
  const { signMessage } = useWallet()
  const [chain, setChain] = useState<Chain>('base')
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [acceptHighFee, setAcceptHighFee] = useState(false)
  const [needsAck, setNeedsAck] = useState(false)
  const [quote, setQuote] = useState<WithdrawQuote | null>(null)
  const [intentHash, setIntentHash] = useState<string | null>(null)
  const [busy, setBusy] = useState<'quote' | 'sign' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const atomic = toAtomic(amount)
  const job = useQuery({
    queryKey: ['job', quote?.jobId],
    queryFn: () => api.job(quote!.jobId),
    enabled: intentHash !== null && quote !== null,
  })
  const status = intentHash ? (job.data?.status ?? 'processing') : null

  const describe = (e: unknown): string => {
    if (!(e instanceof ApiError)) return e instanceof Error ? e.message : String(e)
    const d = e.details as Record<string, unknown> | undefined
    switch (e.code) {
      case 'below_withdraw_threshold':
        return `Withdrawal to ${String(d?.chain ?? 'this chain')} must be at least ${formatCredit(String(d?.minAmount ?? '0'))} USD; this amount would lose about ${String(d?.estimatedLossPct ?? '?')}%.`
      case 'high_fee_requires_ack':
        return 'The withdrawal fee to this chain is high relative to the amount. Tick the high-fee consent to continue.'
      case 'job_state_conflict':
        return 'Steps are out of order. Start again from the quote.'
      case 'one_click_error':
        return `1Click has a problem${d?.upstream ? `: ${JSON.stringify(d.upstream).slice(0, 120)}` : ''}`
      default:
        return `${e.code}: ${e.message}`
    }
  }

  async function requestQuote() {
    if (!atomic) return
    setBusy('quote')
    setError(null)
    setIntentHash(null)
    try {
      setQuote(
        await api.withdrawQuote({
          circle: CIRCLE, account, destinationAsset: CHAINS[chain].asset, amount: atomic, recipient,
          refundTo: account, acceptHighFee, dry: false,
        }),
      )
      setNeedsAck(false)
    } catch (e) {
      setQuote(null)
      if (e instanceof ApiError && e.code === 'high_fee_requires_ack') setNeedsAck(true)
      setError(describe(e))
    } finally {
      setBusy(null)
    }
  }

  async function sign() {
    if (!quote) return
    setBusy('sign')
    setError(null)
    try {
      const { intent } = await api.withdrawIntent(quote.jobId)
      const payload = intent.payload
      if (!payload) throw new Error('The intent from 1Click has no NEP-413 payload')
      const signed = await signMessage({ message: payload.message, recipient: payload.recipient, nonce: base64ToBytes(payload.nonce) })
      const result = await api.withdrawSubmit(quote.jobId, {
        standard: 'nep413', payload, public_key: signed.publicKey, signature: signed.signature,
      })
      setIntentHash(result.intentHash)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'job_state_conflict') setQuote(null)
      setError(/reject|cancel|denied|declin|closed|batal/i.test(String((e as Error).message)) ? 'Cancelled by user. Nothing was sent.' : describe(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="withdraw" aria-label="Withdrawal to another chain">
      <h3>Withdraw Intents balance to another chain</h3>
      <label>
        <span>Destination chain</span>
        <select value={chain} onChange={(e) => setChain(e.target.value as Chain)}>
          {Object.entries(CHAINS).map(([key, c]) => <option key={key} value={key}>{c.label}</option>)}
        </select>
      </label>
      <label>
        <span>Amount (credit)</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </label>
      <label>
        <span>Recipient address</span>
        <input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
      </label>
      {needsAck && (
        <label className="check">
          <input type="checkbox" checked={acceptHighFee} onChange={(e) => setAcceptHighFee(e.target.checked)} />
          <span>I accept the high fee for this withdrawal.</span>
        </label>
      )}
      <button type="button" onClick={() => void requestQuote()} disabled={!atomic || !recipient || busy !== null}>
        {busy === 'quote' ? 'Requesting quote…' : 'Request withdrawal quote'}
      </button>
      {busy === 'quote' && <Loading label="Loading quote" />}
      {error && <p className="state state-error" role="alert">{error}</p>}
      {quote && (
        <dl aria-label="Withdrawal fees">
          <dt>Fixed fee</dt>
          <dd>{formatCredit(quote.withdrawFee)}</dd>
          <dt>Estimated variable fee</dt>
          <dd>{quote.variableFeeBpsEstimate} bps</dd>
          <dt>Total fee</dt>
          <dd>{quote.totalFeePct}%</dd>
          <dt>Received</dt>
          <dd>{formatCredit(quote.amountOut)}</dd>
        </dl>
      )}
      {quote && !intentHash && (
        <button type="button" onClick={() => void sign()} disabled={busy !== null}>
          {busy === 'sign' ? 'Waiting for wallet…' : 'Sign withdrawal'}
        </button>
      )}
      {intentHash && (
        <p>
          Intent sent: <a href={`${INTENTS_EXPLORER_URL}${intentHash}`} target="_blank" rel="noreferrer">{intentHash}</a>
        </p>
      )}
      {status && <p className="state" role="status">Status: {JOB_LABEL[status] ?? status}</p>}
      {job.isError && <ErrorNotice error={job.error} onRetry={() => job.refetch()} />}
    </section>
  )
}
