// FE-068: what the account service last told us (or what the person saved), kept in this browser so the shell can show the display name and the
// Settings form can open filled without a signature. The server is the source of truth; this is only a cache. Per account id: name, email, reminder flag.
import { useSyncExternalStore } from 'react'

const ACCOUNT_CACHE_KEY = 'x207.account.cache'
// FE-087: `photo` is the profile picture as a small data URL. It lives only here (the service has no field for it), so it is per browser.
export type CachedAccount = { displayName?: string; email?: string | null; deadlineReminder?: boolean; photo?: string }

type Store = Record<string, CachedAccount>
const listeners = new Set<() => void>()
let snapshot: Store | null = null

function load(): Store {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ACCOUNT_CACHE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {}
  } catch {
    return {}
  }
}
const all = (): Store => (snapshot ??= load())

export const readCache = (account: string | null): CachedAccount => (account ? (all()[account] ?? {}) : {})

export function writeCache(account: string, patch: CachedAccount): void {
  snapshot = { ...all(), [account]: { ...all()[account], ...patch } }
  try {
    localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify(snapshot))
  } catch {
    // Without storage the name shows until the page closes.
  }
  listeners.forEach((l) => l())
}

/** Test helper: forget the in-memory copy so the next read goes to storage again. */
export function resetCache(): void {
  snapshot = null
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}
const empty: CachedAccount = {}
export function useCachedAccount(account: string | null): CachedAccount {
  return useSyncExternalStore(subscribe, () => (account ? (all()[account] ?? empty) : empty))
}
