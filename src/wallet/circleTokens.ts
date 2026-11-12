import { viewContract } from '../api/chain'
import { TOKENS, type TokenIds } from '../config'

/**
 * FE-110: the USDT token and the NEAR Intents contract that the circle contract itself accepts. The contract fixes both at init (`new`) and returns them in
 * `get_circle`; a stake or settle sent to any other token fails with ERR_WRONG_TOKEN. So the contract is the source of truth, and the build config
 * (`VITE_X207_USDT_TOKEN_ID`, `VITE_X207_INTENTS_ID`, or the network default) is only the fallback when the view cannot be read.
 */
export type CircleTokens = TokenIds & { source: 'contract' | 'config' }
type CircleConfigView = { usdt_token_id?: unknown; intents_id?: unknown }

const isAccount = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

let cached: Promise<CircleTokens> | null = null

async function read(): Promise<CircleTokens> {
  const view = await viewContract<CircleConfigView>('get_circle')
  if (!isAccount(view?.usdt_token_id)) throw new Error('get_circle has no usdt_token_id')
  return { usdt: view.usdt_token_id, intents: isAccount(view.intents_id) ? view.intents_id : TOKENS.intents, source: 'contract' }
}

/** The tokens of the circle in `CONTRACT_ID`. A successful read is kept for the session (the contract cannot change them); a failed one is retried next time. */
export function resolveCircleTokens(): Promise<CircleTokens> {
  if (!cached) {
    cached = read().catch(() => {
      cached = null
      return { ...TOKENS, source: 'config' as const }
    })
  }
  return cached
}

/** Tests only: forget the kept answer. */
export function resetCircleTokens(): void {
  cached = null
}
