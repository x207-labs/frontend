// FE-064: the test-funds faucet of the backend (BE-114, backend/docs/faucet.md): types, the balance reads that show the funds arrived,
// and the mapping of each faucet error to what the wizard does next. The faucet is testnet only; a build without it gets a 404 and the manual steps.
import { ApiError } from '../api/client'
import { NEAR_RPC_URL } from '../config'

export type FaucetInfo = {
  enabled: boolean
  near_yocto: string
  usdt_amount: string
  usdt_contract: string
  per_ip_per_day: number
  per_day: number
  remaining_today: number
}
export type FaucetGrant = {
  account_id: string
  near: { amount_yocto: string; tx: string }
  usdt: { contract: string; amount: string; txs: string[] } | null
}

/** continue: the account has funds, go on to join. retry: the same request may be sent again. wait: not now. stop: something to fix first. */
export type FaucetOutcome = { next: 'continue' | 'retry' | 'wait' | 'stop'; message: string }

/** "45 seconds", "3 minutes", "2 hours": the wait that `Retry-After` asks for. */
export function formatWait(seconds: number): string {
  if (seconds < 90) return `${seconds} second${seconds === 1 ? '' : 's'}`
  if (seconds < 5400) return `${Math.ceil(seconds / 60)} minutes`
  return `${Math.ceil(seconds / 3600)} hours`
}

export function faucetOutcome(error: unknown): FaucetOutcome {
  if (!(error instanceof ApiError)) return { next: 'retry', message: 'The faucet could not be reached. Try again in a moment.' }
  switch (error.code) {
    case 'faucet_already_claimed':
      return { next: 'continue', message: 'This account already received test funds from the faucet (one grant per account). Go on to join.' }
    case 'faucet_already_funded':
      return { next: 'continue', message: 'This account already holds more than 1 NEAR, so the faucet does not top it up. Go on to join.' }
    case 'rate_limited': {
      const seconds = typeof error.details?.retryAfter === 'number' ? error.details.retryAfter : null
      const scope = error.details?.scope === 'faucet_day' ? 'The faucet has reached its limit for today.' : 'Too many grants from your address.'
      return { next: 'wait', message: `${scope} ${seconds ? `Try again in ${formatWait(seconds)}.` : 'Try again later.'}` }
    }
    case 'faucet_partial':
      return { next: 'retry', message: 'The NEAR was sent but the USDT step failed. Try again: it finishes the USDT and does not send NEAR twice.' }
    case 'faucet_failed':
      return { next: 'retry', message: 'The network did not answer, and nothing was sent. Try again.' }
    case 'faucet_empty':
      return { next: 'wait', message: 'The faucet is out of funds for now. Try again later, or use the manual steps below.' }
    case 'faucet_account_not_found':
      return { next: 'stop', message: 'This account does not exist on testnet yet. Create it first, then ask for funds.' }
    case 'faucet_bad_account':
    case 'invalid_request':
      return { next: 'stop', message: 'The faucet did not accept this account id.' }
    default:
      return { next: 'retry', message: `The faucet answered with an error (${error.code}). Try again.` }
  }
}

async function rpc(params: Record<string, unknown>): Promise<{ result?: Record<string, unknown>; error?: unknown }> {
  const res = await fetch(NEAR_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'x207', method: 'query', params: { finality: 'final', ...params } }),
  })
  if (!res.ok) throw new Error(`NEAR RPC answered HTTP ${res.status}`)
  return res.json()
}

/** NEAR balance in yocto. An account that does not exist yet has none. */
export async function nearBalance(account: string): Promise<bigint> {
  const body = await rpc({ request_type: 'view_account', account_id: account })
  const amount = body.result?.amount
  return typeof amount === 'string' ? BigInt(amount) : 0n
}

/** `ft_balance_of` of a NEP-141 contract, in the token's smallest unit. A contract that does not know the account counts as zero. */
export async function ftBalance(contract: string, account: string): Promise<bigint> {
  const args = btoa(JSON.stringify({ account_id: account }))
  const body = await rpc({ request_type: 'call_function', account_id: contract, method_name: 'ft_balance_of', args_base64: args })
  const bytes = body.result?.result
  if (!Array.isArray(bytes)) return 0n
  const value: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes as number[])))
  return typeof value === 'string' ? BigInt(value) : 0n
}

export type Balances = { near: bigint; usdt: bigint }
export async function readBalances(contract: string, account: string): Promise<Balances> {
  const [near, usdt] = await Promise.all([nearBalance(account), ftBalance(contract, account)])
  return { near, usdt }
}

/** Whether the balances show the grant: both amounts above what the account held before it. */
export function arrived(before: Balances, now: Balances, grant: FaucetGrant): boolean {
  const nearOk = now.near >= before.near + BigInt(grant.near.amount_yocto)
  const usdtOk = grant.usdt === null || now.usdt >= before.usdt + BigInt(grant.usdt.amount)
  return nearOk && usdtOk
}
