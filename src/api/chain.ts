import { CONTRACT_ID, NEAR_RPC_URL } from '../config'

export class ChainError extends Error {}

/**
 * View kontrak lingkaran lewat RPC NEAR (`call_function`, finality final). Dipakai bila read API belum memuat datanya:
 * `intents_balance` (tidak ada di read API) dan `list_obligations`. Argumen JSON dikodekan base64; hasilnya bytes JSON.
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
  if (!res.ok) throw new ChainError(`RPC NEAR menjawab HTTP ${res.status}`)
  const body = await res.json()
  const failure = body?.error ?? body?.result?.error
  if (failure) throw new ChainError(`View ${methodName} gagal: ${typeof failure === 'string' ? failure : (failure.cause?.name ?? failure.message ?? 'error')}`)
  const bytes: number[] | undefined = body?.result?.result
  if (!Array.isArray(bytes)) throw new ChainError(`View ${methodName}: jawaban RPC tidak berisi hasil`)
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes))) as T
}
