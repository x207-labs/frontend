// FE-060: the two answers only the visitor can give ("I have test funds", "I made a first payment"), kept per account so a reload resumes the wizard.
// Nothing secret is stored: two booleans per account id. The chain state (member, stake) is always read fresh and is not stored here.
import { useCallback, useState } from 'react'
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

export function useProgress(account: string | null) {
  const [state, setState] = useState<{ account: string | null; value: Acknowledged }>(() => ({ account, value: readProgress(account) }))
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
