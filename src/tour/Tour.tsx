// FE-121: the guided tour of the dashboard. It drives the real pages: it opens each page, zooms the app window onto the part a step is about (one CSS
// transform on `.shell`, or on a pop-up for the steps inside one), dims and blurs the rest around a hole, and points at it from the panel.
// Inclusive by construction: a modal panel with a focus trap, arrows / Enter / Home / End / Escape, a polite live narration, a static highlight without
// zoom when the system asks for reduced motion, a bottom sheet on a phone, and the place it was left is kept (localStorage, best effort).
// It never signs or sends: the only page buttons it presses open a listing, a proof, or play the replay; it works on sample data without a wallet.

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { AppraisalBadge } from '../components/AppraisalBadge'
import { NavIcon } from '../components/icons'
import { SELECTED_CIRCLE, USE_FIXTURES } from '../config'
import { DEMO_MODE } from '../demo/mode'
import { arrowPath, boxOf, css, ease, frame, freeArea, grow, holePath, IDENTITY, mix, unzoom, type Box, type Cam } from './camera'
import { SAMPLE_ASSET, SAMPLE_LISTING_APPRAISAL, SAMPLE_SOURCE } from './sample'
import { resumeStep, saveProgress } from './state'
import { STEPS, type Step, type StepContext, type Target } from './steps'
import './tour.css'

/** The real testnet circle v018, where epoch 184 and the appraised listings exist; sample data and demo mode show the recorded ones instead. */
export const LIVE = !USE_FIXTURES && !DEMO_MODE && SELECTED_CIRCLE === 'v018'

export type Timing = { poll: number; wait: number; settle: number; settleAfterRoute: number; move: number }
const TIMING: Timing = { poll: 100, wait: 4000, settle: 380, settleAfterRoute: 820, move: 720 }

type Place = 'side' | 'bottom' | 'center'
const WIDE = 840 // the same break as the sidebar: under it the panel is a bottom sheet

const raf = (cb: FrameRequestCallback): number =>
  typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame(cb) : window.setTimeout(() => cb(performance.now()), 16)
const unraf = (id: number) => (typeof window.cancelAnimationFrame === 'function' ? window.cancelAnimationFrame(id) : window.clearTimeout(id))
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

function useReducedMotion(): boolean {
  const query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  const [reduced, setReduced] = useState(() => query?.matches ?? false)
  useEffect(() => {
    if (!query) return
    const on = () => setReduced(query.matches)
    query.addEventListener?.('change', on)
    return () => query.removeEventListener?.('change', on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return reduced
}

const resolve = (t: Target): HTMLElement | null => {
  const el = typeof t === 'string' ? document.querySelector(t) : t()
  return el instanceof HTMLElement ? el : null
}

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

export type TourProps = {
  /** Opens at the first step instead of where the visitor left off. */
  restart?: boolean
  onExit: () => void
  steps?: Step[]
  timing?: Partial<Timing>
}

export default function Tour({ restart = false, onExit, steps = STEPS, timing }: TourProps) {
  const t = useMemo(() => ({ ...TIMING, ...timing }), [timing])
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const still = useReducedMotion()
  const [start] = useState(() => resumeStep(steps.length, restart))
  const [index, setIndex] = useState(start)
  const [found, setFound] = useState<boolean | null>(null)
  const [specimenHost, setSpecimenHost] = useState<HTMLElement | null>(null)
  const [vw, setVw] = useState(() => window.innerWidth)
  const step = steps[index]
  const last = steps.length - 1
  const place: Place = !step.target ? 'center' : vw >= WIDE ? 'side' : 'bottom'

  const panel = useRef<HTMLDivElement>(null)
  const nextButton = useRef<HTMLButtonElement>(null)
  const dim = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const arrow = useRef<SVGPathElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)
  const loc = useRef(location)
  loc.current = location
  const run = useRef(0)
  const target = useRef<HTMLElement | null>(null)
  const stage = useRef<HTMLElement | null>(null)
  const cams = useRef(new Map<HTMLElement, Cam>())
  const tweens = useRef(new Map<HTMLElement, number>())
  const prev = useRef<Step | null>(null)
  const placeRef = useRef(place)
  placeRef.current = place
  const stillRef = useRef(still)
  stillRef.current = still
  const indexRef = useRef(index)
  indexRef.current = index
  const done = useRef(onExit)
  done.current = onExit

  // --- the camera -------------------------------------------------------------------------------------------------------------------------------
  const apply = useCallback((el: HTMLElement, c: Cam) => {
    const value = css(c)
    if (value) {
      el.style.transformOrigin = '0 0'
      el.style.transform = value
      el.setAttribute('data-tour-zoom', '')
    } else {
      el.style.removeProperty('transform')
      el.style.removeProperty('transform-origin')
      el.removeAttribute('data-tour-zoom')
    }
    cams.current.set(el, c)
  }, [])

  const tween = useCallback(
    (el: HTMLElement, to: Cam, ms: number) =>
      new Promise<void>((done) => {
        const old = tweens.current.get(el)
        if (old !== undefined) unraf(old)
        const from = cams.current.get(el) ?? IDENTITY
        if (ms <= 0 || stillRef.current) {
          apply(el, to)
          tweens.current.delete(el)
          done()
          return
        }
        const t0 = performance.now()
        const tick = (now: number) => {
          const k = Math.min(1, (now - t0) / ms)
          apply(el, mix(from, to, ease(k)))
          if (k < 1) tweens.current.set(el, raf(tick))
          else {
            tweens.current.delete(el)
            done()
          }
        }
        tweens.current.set(el, raf(tick))
      }),
    [apply],
  )

  /** Every zoomed element back to no transform, except `keep`. */
  const resetStages = useCallback(
    async (keep: HTMLElement | null, ms: number) => {
      const jobs: Promise<void>[] = []
      for (const [el] of cams.current) {
        if (el === keep) continue
        if (!el.isConnected) {
          cams.current.delete(el)
          continue
        }
        jobs.push(tween(el, IDENTITY, ms).then(() => void cams.current.delete(el)))
      }
      await Promise.all(jobs)
    },
    [tween],
  )

  /** Moves the stage so the target sits in the free part of the screen, as large as fits. */
  const frameTarget = useCallback(
    (ms: number) => {
      const el = target.current
      const st = stage.current
      const box = panel.current
      if (!el?.isConnected || !st?.isConnected || !box) return Promise.resolve()
      const cam = cams.current.get(st) ?? IDENTITY
      const sr = st.getBoundingClientRect()
      const origin = { x: sr.left - cam.tx, y: sr.top - cam.ty }
      const layout = unzoom(boxOf(el.getBoundingClientRect()), cam, origin)
      const p = placeRef.current
      const free = freeArea(p, boxOf(box.getBoundingClientRect()), window.innerWidth, window.innerHeight)
      // reduced motion: no zoom and no travel, only the highlight; the page scrolls the target into the free part instead
      if (stillRef.current) {
        const y = layout.y - free.y - 24
        if (st.classList.contains('shell') && Math.abs(y) > 2) window.scrollBy(0, y)
        return Promise.resolve()
      }
      const goal = frame(layout, free, origin, p === 'bottom' ? 1.2 : 1.6, p === 'bottom' ? 12 : 28)
      return tween(st, goal, ms)
    },
    [tween],
  )

  // --- running a step ---------------------------------------------------------------------------------------------------------------------------
  const ctxFor = useCallback(
    (token: number): StepContext => ({
      queryClient,
      live: LIVE,
      cancelled: () => token !== run.current,
      specimen: (host) => setSpecimenHost(host),
      press: (el) => {
        if (el instanceof HTMLElement) el.click()
      },
      find: async (what, ms = t.wait) => {
        const until = performance.now() + ms
        for (;;) {
          const el = resolve(what)
          if (el || token !== run.current) return el
          if (performance.now() >= until) return null
          await sleep(t.poll)
        }
      },
    }),
    [queryClient, t],
  )

  useEffect(() => {
    const token = ++run.current
    const ctx = ctxFor(token)
    const cancelled = ctx.cancelled
    const from = prev.current
    prev.current = step
    setFound(null)
    target.current = null
    ;(async () => {
      if (from && from !== step) from.leave?.(ctx)
      if (!step.specimen) setSpecimenHost(null)
      // the page of the step, with the circle of the visitor kept
      let moved = false
      if (step.route) {
        const now = loc.current
        const params = new URLSearchParams(now.search)
        params.delete('tour')
        params.delete('epoch')
        for (const [k, v] of new URLSearchParams(step.route.search?.(LIVE) ?? '')) params.set(k, v)
        const search = params.toString() ? `?${params}` : ''
        if (now.pathname !== step.route.pathname || now.search !== search) {
          moved = now.pathname !== step.route.pathname
          navigate({ pathname: step.route.pathname, search })
        }
      }
      const stageNow = step.stage ? document.querySelector<HTMLElement>(step.stage) : null
      await resetStages(stageNow, t.move / 2)
      if (cancelled()) return
      if (!stillRef.current && !step.stage) window.scrollTo(0, 0)
      await step.enter?.(ctx)
      if (cancelled()) return
      const el = step.target ? await ctx.find(step.target) : null
      if (cancelled()) return
      setFound(step.target ? el !== null : null)
      if (!el) return
      await sleep(still ? 40 : moved ? t.settleAfterRoute : t.settle)
      if (cancelled()) return
      target.current = step.target ? resolve(step.target) ?? el : el
      stage.current = (step.stage ? document.querySelector<HTMLElement>(step.stage) : null) ?? document.querySelector<HTMLElement>('.shell')
      await frameTarget(t.move)
    })()
    saveProgress({ step: index, done: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // a change of size (the window, the panel, data that loaded into the target) frames the target again
  useEffect(() => {
    const again = () => {
      setVw(window.innerWidth)
      void frameTarget(0)
    }
    window.addEventListener('resize', again)
    let ro: ResizeObserver | null = null
    let size = ''
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(() => {
        const el = target.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const key = `${Math.round(r.width / 8)}x${Math.round(r.height / 8)}`
        if (size && key !== size) void frameTarget(240)
        size = key
      })
      const watch = window.setInterval(() => {
        if (target.current && ro) {
          ro.disconnect()
          size = ''
          ro.observe(target.current)
          window.clearInterval(watch)
        }
      }, 200)
      return () => {
        window.clearInterval(watch)
        ro?.disconnect()
        window.removeEventListener('resize', again)
      }
    }
    return () => window.removeEventListener('resize', again)
  }, [frameTarget, index, found])

  // the hole, the ring and the arrow follow the target every frame (it may still animate in, scroll or load)
  useEffect(() => {
    let id = 0
    let key = ''
    const loop = () => {
      const el = target.current
      const hole = el?.isConnected ? grow(boxOf(el.getBoundingClientRect()), 8) : null
      const box = panel.current ? boxOf(panel.current.getBoundingClientRect()) : null
      const vwNow = window.innerWidth
      const vh = window.innerHeight
      const next = hole && box ? `${Math.round(hole.x)},${Math.round(hole.y)},${Math.round(hole.w)},${Math.round(hole.h)},${Math.round(box.x)},${Math.round(box.y)},${vwNow},${vh}` : `none,${vwNow},${vh}`
      if (next !== key) {
        key = next
        const visible: Box | null = hole && hole.w > 0 && hole.h > 0 ? hole : null
        const path = holePath(vwNow, vh, visible)
        if (dim.current) dim.current.style.clipPath = `path(evenodd, "${path}")`
        if (ring.current) {
          ring.current.hidden = !visible
          if (visible) Object.assign(ring.current.style, { left: `${visible.x}px`, top: `${visible.y}px`, width: `${visible.w}px`, height: `${visible.h}px` })
        }
        if (arrow.current) {
          const d = box ? arrowPath(visible, box, placeRef.current) : null
          arrow.current.setAttribute('d', d ?? '')
          arrow.current.style.visibility = d ? 'visible' : 'hidden'
        }
      }
      id = raf(loop)
    }
    id = raf(loop)
    return () => unraf(id)
  }, [])

  // --- the page while the tour is open ------------------------------------------------------------------------------------------------------------
  useLayoutEffect(() => {
    const html = document.documentElement
    const overflow = html.style.overflow
    const y = window.scrollY
    const path = loc.current.pathname
    html.style.overflow = 'hidden'
    html.setAttribute('data-tour-open', '')
    // the sidebar opened as a list on a phone would sit over the page the tour shows
    const list = document.querySelector<HTMLElement>('.list-toggle[aria-expanded="true"]')
    list?.click()
    const zoomed = cams.current
    const moving = tweens.current
    return () => {
      for (const id of moving.values()) unraf(id)
      moving.clear()
      for (const [el] of zoomed) {
        el.style.removeProperty('transform')
        el.style.removeProperty('transform-origin')
        el.removeAttribute('data-tour-zoom')
      }
      zoomed.clear()
      html.style.overflow = overflow
      html.removeAttribute('data-tour-open')
      window.scrollTo(0, loc.current.pathname === path ? y : 0)
    }
  }, [])

  // the recorded appraisal lives in a node the tour added to the page; it goes with the step
  useEffect(() => {
    if (!specimenHost) return
    return () => specimenHost.remove()
  }, [specimenHost])

  // --- moving through the steps -------------------------------------------------------------------------------------------------------------------
  const go = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(steps.length - 1, i))
      if (next === index) return
      // busy again in the same render as the new step, not one render later, so "found" never speaks for the step before
      setFound(null)
      setIndex(next)
    },
    [steps.length, index],
  )

  const exit = useCallback(
    (finished: boolean) => {
      const token = ++run.current
      const now = steps[indexRef.current]
      now.leave?.(ctxFor(token))
      setSpecimenHost(null)
      saveProgress({ step: finished ? steps.length - 1 : indexRef.current, done: finished })
      done.current()
    },
    [ctxFor, steps],
  )

  // Escape leaves from anywhere, before the page sees it (the listing pop-up and the proof also close on Escape)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      exit(false)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [exit])

  // the focus stays in the panel: a page that moves the focus (a new page focuses <main>, a proof focuses its Close button) gives it back
  useEffect(() => {
    const keep = (e: FocusEvent) => {
      const box = panel.current
      if (!box) return
      const to = e.target
      if (to instanceof HTMLElement && box.contains(to)) {
        lastFocus.current = to
        return
      }
      const back = lastFocus.current?.isConnected && box.contains(lastFocus.current) ? lastFocus.current : box
      back.focus({ preventScroll: true })
    }
    document.addEventListener('focusin', keep)
    ;(nextButton.current ?? panel.current)?.focus({ preventScroll: true })
    return () => document.removeEventListener('focusin', keep)
  }, [])

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement
    const control = el.closest('button, a, input, select, textarea')
    if (e.key === 'ArrowRight' || (e.key === 'Enter' && !control)) {
      e.preventDefault()
      if (index === last) exit(true)
      else go(index + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(index - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      go(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      go(last)
    } else if (e.key === 'Tab') {
      const box = panel.current
      if (!box) return
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.hasAttribute('hidden'))
      if (items.length === 0) return
      const first = items[0]
      const end = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) {
        e.preventDefault()
        end.focus({ preventScroll: true })
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
  }

  const resumed = start > 0 && index === start
  const narration = `${resumed ? 'Resuming the tour. ' : ''}Step ${index + 1} of ${steps.length}: ${step.title}. ${step.say}${found === false ? ' This part of the page is not shown right now.' : ''}`
  const Diagram = step.diagram

  return createPortal(
    <div className="tour" data-place={place} data-still={still ? '' : undefined} data-step={step.id}>
      <div className="tour-dim" ref={dim} aria-hidden="true" />
      <div className="tour-ring" ref={ring} aria-hidden="true" hidden />
      <svg className="tour-arrow" aria-hidden="true" focusable="false">
        <defs>
          <marker id="tour-arrow-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="currentColor" />
          </marker>
        </defs>
        <path ref={arrow} key={step.id} d="" markerEnd="url(#tour-arrow-head)" />
      </svg>
      <div
        className="tour-panel"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        aria-busy={found === null && step.target ? true : undefined}
      >
        <div className="tour-top">
          <p className="tour-count">
            Step {index + 1} of {steps.length}
            {step.theme && <span className="tour-theme" data-theme={step.theme}>{step.theme}</span>}
          </p>
          <button type="button" className="tour-exit" onClick={() => exit(false)} aria-label="Exit the tour">
            <NavIcon name="close" size={18} />
          </button>
        </div>
        <div className="tour-bar" aria-hidden="true">
          <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <h2 id="tour-title" className="tour-title">{step.title}</h2>
        <div id="tour-body" className="tour-body" key={step.id}>
          {step.body({ live: LIVE, sample: specimenHost !== null })}
          {found === false && (
            <p className="tour-miss">This part of the page is not shown right now: it may still be loading, or this circle has no data for it yet. The text above still holds.</p>
          )}
        </div>
        {Diagram && <div className="tour-diagram" key={`d-${step.id}`}><Diagram still={still} /></div>}
        <div className="tour-actions">
          <button type="button" className="tour-back" onClick={() => go(index - 1)} disabled={index === 0}>
            Back
          </button>
          {index === last ? (
            <button type="button" className="tour-again" onClick={() => go(0)}>
              Start over
            </button>
          ) : (
            // FE-122: a tour that opened where it was left can go back to the first step in one press (Home does the same)
            start > 0 &&
            index > 0 && (
              <button type="button" className="tour-again" onClick={() => go(0)}>
                Restart from step 1
              </button>
            )
          )}
          <button type="button" className="tour-next" ref={nextButton} onClick={() => (index === last ? exit(true) : go(index + 1))}>
            {index === last ? 'Finish' : 'Next'}
          </button>
        </div>
        <ol className="tour-dots" aria-label="Steps">
          {steps.map((s, i) => (
            <li key={s.id}>
              <button type="button" aria-label={`Step ${i + 1}: ${s.title}`} aria-current={i === index ? 'step' : undefined} onClick={() => go(i)} />
            </li>
          ))}
        </ol>
        <p className="tour-keys" aria-hidden="true">← → to move · Esc to leave</p>
        <p className="tour-sr" aria-live="polite">{narration}</p>
      </div>
      {specimenHost && createPortal(<Specimen />, specimenHost)}
    </div>,
    document.body,
  )
}

/** The recorded appraisal, put into the listings while the pricing steps show; labelled as recorded, never passed off as a listing of this circle. */
function Specimen() {
  return (
    <div className="tour-specimen-card">
      <p className="tour-specimen-label">Recorded listing, shown by the tour</p>
      <p className="asset-meta">
        <code>{SAMPLE_ASSET.assetType}</code> {SAMPLE_ASSET.provider}: {SAMPLE_ASSET.scope}. {SAMPLE_SOURCE}
      </p>
      <AppraisalBadge appraisal={SAMPLE_LISTING_APPRAISAL} />
    </div>
  )
}
