// FE-059: the login steps of the Privy wallet, written against the small part of the Privy client they use so a test can pass a fake. The real client is `@privy-io/js-sdk-core`.

type LinkedAccount = { type?: string; chain_type?: string }
export type PrivyUser = { linked_accounts?: LinkedAccount[] } | null | undefined

export type PrivyLike = {
  initialize?: () => Promise<unknown>
  user: { get: () => Promise<{ user: PrivyUser }> }
  auth: {
    email: {
      sendCode: (email: string) => Promise<unknown>
      loginWithCode: (email: string, code: string) => Promise<{ user: PrivyUser }>
    }
    oauth: {
      generateURL: (provider: 'google', redirectURI: string) => Promise<{ url: string }>
      loginWithCode: (code: string, state: string, provider?: 'google') => Promise<{ user: PrivyUser }>
    }
    logout: () => Promise<unknown>
  }
}

export const hasNearWallet = (user: PrivyUser): boolean => (user?.linked_accounts ?? []).some((a) => a.type === 'wallet' && a.chain_type === 'near')

/** Creates the embedded NEAR wallet of a user that has none yet (a first login). `createNearWallet` is `create` of the SDK bound to the client. */
export async function ensureNearWallet(privy: PrivyLike, user: PrivyUser, createNearWallet: () => Promise<unknown>): Promise<PrivyUser> {
  if (!user) return null
  if (hasNearWallet(user)) return user
  await createNearWallet()
  const { user: refreshed } = await privy.user.get().catch(() => ({ user: null as PrivyUser }))
  return hasNearWallet(refreshed) ? refreshed : null
}

export const OAUTH_CODE_PARAM = 'privy_oauth_code'
export const OAUTH_STATE_PARAM = 'privy_oauth_state'

/** The Google redirect brings the code back in the query of the sign page; returns it, or `null` when this load is not a return from Google. */
export function readOAuthReturn(search: string): { code: string; state: string } | null {
  const params = new URLSearchParams(search)
  const code = params.get(OAUTH_CODE_PARAM)
  const state = params.get(OAUTH_STATE_PARAM)
  return code && state ? { code, state } : null
}

export type LoginStep = 'email' | 'code'

/** A short sentence for a failed login; the SDK's own message is kept when it has one. */
export function loginErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.trim() || 'Sign-in failed. Try again.'
}
