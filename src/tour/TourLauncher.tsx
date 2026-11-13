// FE-121: opens the guided tour. Small and part of the dashboard; the tour itself (camera, panel, steps, diagrams) is a separate chunk, fetched the
// first time someone starts it. Three ways in: any button that calls startTour() ("Take the tour" in the sidebar), the /tour route, and ?tour=1 on
// any dashboard page. A first visit may also see a small prompt that offers the tour once; answering it in either way hides it for good.

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { markPrompted, TOUR_EVENT, wantsTour, wasPrompted } from './state'
import './prompt.css'

const Tour = lazy(() => import('./Tour'))

/** Pages outside the dashboard: no prompt there (the landing page and the sign-in hand-off). */
const OUTSIDE = new Set(['/', '/sign'])

export type TourLauncherProps = {
  /** Offer the tour once on a first visit. Off under test, so other tests never see it. */
  firstVisitPrompt?: boolean
  /** How long the first visit waits before offering it, in ms. */
  promptDelay?: number
}

export function TourLauncher({ firstVisitPrompt = import.meta.env.MODE !== 'test', promptDelay = 1200 }: TourLauncherProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState<null | { restart: boolean }>(null)
  const [prompt, setPrompt] = useState(false)
  const opener = useRef<Element | null>(null)

  const start = useCallback((restart: boolean) => {
    opener.current = document.activeElement
    markPrompted()
    setPrompt(false)
    setOpen({ restart })
  }, [])

  // any button of the dashboard
  useEffect(() => {
    const on = (e: Event) => start((e as CustomEvent<{ restart?: boolean }>).detail?.restart === true)
    window.addEventListener(TOUR_EVENT, on)
    return () => window.removeEventListener(TOUR_EVENT, on)
  }, [start])

  // the /tour route and the ?tour=1 deep link: the URL loses the ask (so a reload or the back button does not reopen it), then the tour opens
  useEffect(() => {
    if (!wantsTour(location.pathname, location.search)) return
    const q = new URLSearchParams(location.search)
    q.delete('tour')
    const search = q.toString()
    navigate({ pathname: location.pathname === '/tour' ? '/app' : location.pathname, search: search ? `?${search}` : '' }, { replace: true })
    start(false)
  }, [location.pathname, location.search, navigate, start])

  // the first-visit prompt, once, on a dashboard page
  const outside = OUTSIDE.has(location.pathname)
  useEffect(() => {
    if (!firstVisitPrompt || outside || open || wasPrompted()) return
    const t = window.setTimeout(() => setPrompt(true), promptDelay)
    return () => window.clearTimeout(t)
  }, [firstVisitPrompt, outside, open, promptDelay])

  const exit = useCallback(() => {
    setOpen(null)
    const back = opener.current
    opener.current = null
    // back to the button that opened it; if that is gone (the prompt, a deep link), to the page
    window.setTimeout(() => {
      if (back instanceof HTMLElement && back.isConnected && back !== document.body) back.focus()
      else document.getElementById('content')?.focus()
    }, 0)
  }, [])

  return (
    <>
      {prompt && !open && !outside && (
        <aside className="tour-prompt" aria-label="Guided tour">
          <p className="tour-prompt-text">
            <strong>New here?</strong> A two-minute tour shows how x207 fixes barter for AI agents. No wallet needed.
          </p>
          <div className="tour-prompt-actions">
            <button type="button" className="tour-prompt-go" onClick={() => start(true)}>
              Start the tour
            </button>
            <button
              type="button"
              className="tour-prompt-no"
              onClick={() => {
                markPrompted()
                setPrompt(false)
              }}
            >
              Not now
            </button>
          </div>
        </aside>
      )}
      {open && (
        <Suspense fallback={<p className="tour-loading" role="status">Loading the tour…</p>}>
          <Tour restart={open.restart} onExit={exit} />
        </Suspense>
      )}
    </>
  )
}
