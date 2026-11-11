// FE-064: "Get test funds" through the backend faucet. Without the faucet (404, disabled, unreachable) it renders `fallback`, the manual steps.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { formatCredit } from '../lib/format'
import { formatNear } from '@x207/core'
import { Button } from '../ds/components'
import { arrived, faucetOutcome, readBalances, type Balances, type FaucetGrant, type FaucetOutcome } from './faucet'

export const WATCH_POLL_MS = 3_000
export const WATCH_TIMEOUT_MS = 90_000

type Phase =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'watching'; grant: FaucetGrant; before: Balances }
  | { kind: 'slow'; grant: FaucetGrant; before: Balances }
  | { kind: 'arrived'; balances: Balances }
  | { kind: 'refused'; outcome: FaucetOutcome }

export function FaucetPanel({
  account,
  onFunded,
  fallback,
  pollMs = WATCH_POLL_MS,
  timeoutMs = WATCH_TIMEOUT_MS,
}: {
  account: string
  /** The account has funds (the faucet delivered, or it had been funded before): the wizard may go on to join. */
  onFunded: () => void
  fallback: ReactNode
  pollMs?: number
  timeoutMs?: number
}) {
  const info = useQuery({ queryKey: ['faucet'], queryFn: api.faucetInfo, retry: false, staleTime: 30_000 })
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const contract = info.data?.usdt_contract ?? ''
  const watching = phase.kind === 'watching' || phase.kind === 'slow'
  const balances = useQuery({
    queryKey: ['faucet-balances', account, contract],
    queryFn: () => readBalances(contract, account),
    enabled: watching && contract !== '',
    refetchInterval: phase.kind === 'watching' ? pollMs : false,
    retry: false,
    gcTime: 0,
  })

  const funded = useRef(onFunded)
  useEffect(() => {
    funded.current = onFunded
  })
  useEffect(() => {
    if (phase.kind === 'watching' && balances.data && arrived(phase.before, balances.data, phase.grant)) {
      setPhase({ kind: 'arrived', balances: balances.data })
      funded.current()
    }
  }, [phase, balances.data])
  useEffect(() => {
    if (phase.kind !== 'watching') return
    const timer = setTimeout(() => setPhase({ kind: 'slow', grant: phase.grant, before: phase.before }), timeoutMs)
    return () => clearTimeout(timer)
  }, [phase, timeoutMs])

  if (info.isPending) return <p className="state" role="status">Checking the faucet…</p>
  if (info.isError || !info.data?.enabled) return <>{fallback}</>
  const faucet = info.data

  async function claim() {
    setPhase({ kind: 'sending' })
    // What the account holds now, so "arrived" means "more than before", also for an account that already had some NEAR.
    const before = await readBalances(faucet.usdt_contract, account).catch(() => ({ near: 0n, usdt: 0n }))
    try {
      const grant = await api.faucetClaim(account)
      setPhase({ kind: 'watching', grant, before })
    } catch (error) {
      const outcome = faucetOutcome(error)
      setPhase({ kind: 'refused', outcome })
      if (outcome.next === 'continue') funded.current()
    }
  }

  const busy = phase.kind === 'sending' || phase.kind === 'watching'
  const depleted = faucet.remaining_today <= 0
  return (
    <>
      <p>
        The faucet sends <strong>{formatNear(BigInt(faucet.near_yocto))} NEAR</strong> for gas and the join deposit and <strong>{formatCredit(faucet.usdt_amount)} mock USDT</strong> for
        the stake, once per account. Testnet only.
      </p>
      {depleted && phase.kind === 'idle' && <p className="state-error" role="alert">The faucet has reached its limit for today. Try again tomorrow, or use the manual steps below.</p>}
      {phase.kind !== 'arrived' && (
        <Button type="button" variant="glow" onClick={() => void claim()} disabled={busy || depleted}>
          {phase.kind === 'sending' ? 'Sending…' : phase.kind === 'watching' ? 'Waiting for the funds…' : phase.kind === 'refused' && phase.outcome.next === 'retry' ? 'Try again' : 'Get test funds'}
        </Button>
      )}
      {phase.kind === 'watching' && <p className="state" role="status">Funds sent. Waiting for the NEAR and USDT to show in {account}…</p>}
      {phase.kind === 'slow' && (
        <>
          <p className="state" role="status">The funds were sent but are not visible yet. This can take a minute.</p>
          <Button type="button" variant="quiet" onClick={() => setPhase({ kind: 'watching', grant: phase.grant, before: phase.before })}>Check again</Button>
        </>
      )}
      {phase.kind === 'arrived' && (
        <p className="state" role="status">
          Funds arrived: {formatNear(phase.balances.near)} NEAR and {formatCredit(phase.balances.usdt.toString())} USDT. Go on to join.
        </p>
      )}
      {phase.kind === 'refused' && (
        <p className={phase.outcome.next === 'continue' ? 'state' : 'state-error'} role={phase.outcome.next === 'continue' ? 'status' : 'alert'}>
          {phase.outcome.message}
        </p>
      )}
      {(phase.kind === 'refused' && phase.outcome.next !== 'continue') || depleted ? <details><summary>Manual steps</summary>{fallback}</details> : null}
    </>
  )
}
