// FE-060: the two answers only the visitor can give ("I have test funds", "I made a first payment"), kept per account so a reload resumes the wizard.
// Nothing secret is stored: two booleans per account id. The chain state (member, stake) is always read fresh and is not stored here.
import { useCallback, useEffect, useState } from 'react'
import type { Acknowledged } from './steps'

const PROGRESS_KEY = 'x207.onboarding.progress'
const NONE: Acknowledged = { funds: false, payment: false }

type Store = Record<string, Partial<Acknowledged>>

function readAll(): Store {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {}
  } catch {
    return {}
  }
}

export function readProgress(account: string | null): Acknowledged {
  if (!account) return NONE
  const entry = readAll()[account]
  return { funds: entry?.funds === true, payment: entry?.payment === true }
}

export function writeProgress(account: string, value: Acknowledged): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...readAll(), [account]: value }))
  } catch {
    // Without storage the ticks last until the page closes; the chain-derived steps still resume.
  }
}

/** Sent when the saved answers change outside a hook (FE-122: "Replay onboarding"), so every open checklist reads them again. */
export const PROGRESS_EVENT = 'x207:onboarding-progress'

/**
 * FE-122: forgets the two answers of one account, so the onboarding can be walked again. Only that account's entry goes: the answers of other
 * accounts, the wallet connection, the session and every other key stay. The chain state (signed in, member, stake) is not stored here, so the
 * steps the chain shows as done stay done.
 */
export function forgetProgress(account: string): void {
  try {
    const rest = { ...readAll() }
    delete rest[account]
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(rest))
  } catch {
    // Without storage there is nothing saved to forget.
  }
  window.dispatchEvent(new CustomEvent(PROGRESS_EVENT, { detail: { account } }))
}

export function useProgress(account: string | null) {
  const [state, setState] = useState<{ account: string | null; value: Acknowledged }>(() => ({ account, value: readProgress(account) }))
  useEffect(() => {
    const reread = () => setState({ account, value: readProgress(account) })
    window.addEventListener(PROGRESS_EVENT, reread)
    return () => window.removeEventListener(PROGRESS_EVENT, reread)
  }, [account])
  // A different account (sign out, sign in as another) gets its own saved answers.
  const value = state.account === account ? state.value : readProgress(account)
  const mark = useCallback(
    (key: keyof Acknowledged) => {
      if (!account) return
      const next = { ...readProgress(account), [key]: true }
      writeProgress(account, next)
      setState({ account, value: next })
    },
    [account],
  )
  return { acknowledged: value, mark }
}
