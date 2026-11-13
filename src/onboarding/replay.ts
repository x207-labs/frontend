// FE-122: walk the onboarding again on request. Every button ("Replay onboarding" in Settings, Help and All pages) and the ?onboarding=1 link
// open Join the circle with this mark in the router state; the steps then forget this account's two saved answers and open at step 1. The mark
// lives in the history entry only, so a reload does not reset again, and nothing new is stored.
import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export const ONBOARDING_PATH = '/onboarding'

export type ReplayState = { replayOnboarding: true }

export const isReplay = (state: unknown): boolean => typeof state === 'object' && state !== null && (state as Partial<ReplayState>).replayOnboarding === true

/** Whether a URL asks to walk the onboarding again: ?onboarding=1 on any dashboard page. */
export const wantsOnboarding = (search: string): boolean => new URLSearchParams(search).get('onboarding') === '1'

/** The query string without the ?onboarding=1 that asked for the replay, the other parameters (circle, epoch) kept. */
export function withoutOnboardingParam(search: string): string {
  const params = new URLSearchParams(search)
  params.delete('onboarding')
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}

/** Opens Join the circle at step 1 with the saved answers of this account forgotten. */
export function useReplayOnboarding() {
  const navigate = useNavigate()
  const { search } = useLocation()
  return useCallback(
    () => navigate({ pathname: ONBOARDING_PATH, search: withoutOnboardingParam(search) }, { state: { replayOnboarding: true } satisfies ReplayState }),
    [navigate, search],
  )
}
