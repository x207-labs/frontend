// FE-068: the account data of the dashboard (profile name, onboarding steps, notification preferences, feedback) lives in one Supabase Edge Function, `x207-account`
// (BE-116, backend/supabase/README.md). It needs no anon key (verify_jwt off): each account action carries a NEP-413 signature of the wallet instead.
// Money, credit and membership are not here; they stay on the contract and in the read API.

export const ACCOUNT_URL = 'https://vldhsabgpfxccsljdtye.supabase.co/functions/v1/x207-account'
/** The host the function accepts as the NEP-413 `recipient`. */
export const ACCOUNT_RECIPIENT = 'x207.vercel.app'

export type AccountAction = 'get' | 'upsert_profile' | 'upsert_onboarding' | 'upsert_prefs'

export type OnboardingRow = { wallet_created: boolean; funds_received: boolean; joined: boolean; staked: boolean; tour_done: boolean }
export type AccountData = {
  account_id: string
  profile: { display_name: string } | null
  onboarding: OnboardingRow | null
  prefs: { email: string | null; deadline_reminder: boolean } | null
}

export class AccountError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** NEP-413 nonce: 8 bytes of the current time in milliseconds (big endian), 24 random bytes. The server refuses a nonce older than 5 minutes and one it has seen. */
export function makeNonce(now: number = Date.now(), random: (length: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): Uint8Array {
  const nonce = new Uint8Array(32)
  new DataView(nonce.buffer).setBigUint64(0, BigInt(now), false)
  nonce.set(random(24), 8)
  return nonce
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export type SignedFields = { accountId: string; publicKey: string; signature: string; message: string; nonce: string; recipient: string }

async function post(body: unknown): Promise<unknown> {
  const res = await fetch(ACCOUNT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload: unknown = await res.json().catch(() => null)
  if (res.ok) return payload
  const error = (payload as { error?: { code?: string; message?: string } } | null)?.error
  throw new AccountError(res.status, error?.code ?? 'http_error', error?.message ?? `The account service answered HTTP ${res.status}`)
}

export async function callAccount(action: AccountAction, data: Record<string, unknown>, signed: SignedFields): Promise<AccountData> {
  return (await post({ action, data, ...signed })) as AccountData
}

/** Feedback needs no signature (the account stays unknown). */
export async function sendFeedback(page: string, message: string): Promise<void> {
  await post({ action: 'feedback', data: { page: page.slice(0, 200), message: message.trim() } })
}

/** What the person sees for each error of the function. */
export function accountErrorMessage(error: unknown): string {
  if (!(error instanceof AccountError)) return 'The account service could not be reached. Try again in a moment.'
  switch (error.code) {
    case 'rate_limited':
      return 'Too many messages from your address. Try again later.'
    case 'nonce_expired':
    case 'nonce_used':
      return 'The signature was too old or already used. Try again.'
    case 'key_not_owned':
      return 'The wallet key that signed is not a full access key of this account, so it cannot be used here.'
    case 'invalid_signature':
    case 'bad_signature_format':
    case 'bad_public_key':
    case 'wrong_message':
    case 'wrong_recipient':
      return 'The wallet signature was not accepted. Try again, or use another wallet.'
    case 'rpc_unavailable':
      return 'The NEAR network did not answer while checking the signature. Try again.'
    case 'invalid_request':
      return 'Some value was not accepted. Check the fields and try again.'
    case 'payload_too_large':
      return 'The message is too long.'
    default:
      return 'The account service had an error. Try again in a moment.'
  }
}
