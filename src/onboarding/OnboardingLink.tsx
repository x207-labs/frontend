// FE-122: ?onboarding=1 on any dashboard page opens Join the circle at step 1 with this account's saved answers forgotten (the same as the
// "Replay onboarding" button). The parameter is dropped from the address with replace, so Back does not replay again.
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ONBOARDING_PATH, wantsOnboarding, withoutOnboardingParam, type ReplayState } from './replay'

const OUTSIDE = new Set(['/', '/sign'])

export function OnboardingLink() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    // the landing and the sign-in page are left alone, as the tour leaves them
    if (OUTSIDE.has(pathname) || !wantsOnboarding(search)) return
    navigate({ pathname: ONBOARDING_PATH, search: withoutOnboardingParam(search) }, { replace: true, state: { replayOnboarding: true } satisfies ReplayState })
  }, [pathname, search, navigate])
  return null
}
