import { CONTRACT_ID, NEAR_RPC_URL } from '../config'

export class ChainError extends Error {}

/**
 * Circle contract views over NEAR RPC (`call_function`, final finality). Used when the read API does not carry the data yet:
 * `intents_balance` (not in the read API) and `list_obligations`. JSON arguments are base64-encoded; the result is JSON bytes.
 */
export async function viewContract<T>(methodName: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(NEAR_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'x207',
      method: 'query',
      params: { request_type: 'call_function', finality: 'final', account_id: CONTRACT_ID, method_name: methodName, args_base64: btoa(JSON.stringify(args)) },
    }),
  })
  if (!res.ok) throw new ChainError(`NEAR RPC answered HTTP ${res.status}`)
  const body = await res.json()
  const failure = body?.error ?? body?.result?.error
  if (failure) throw new ChainError(`View ${methodName} failed: ${typeof failure === 'string' ? failure : (failure.cause?.name ?? failure.message ?? 'error')}`)
  const bytes: number[] | undefined = body?.result?.result
  if (!Array.isArray(bytes)) throw new ChainError(`View ${methodName}: the RPC answer has no result`)
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes))) as T
}
