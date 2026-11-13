// FE-121: what the tour keeps between visits, and how the rest of the dashboard asks it to start. Small and loaded with the dashboard; the tour
// itself (camera, panel, steps) is its own chunk, loaded only when someone starts it.

/** Where a visitor left the tour, so "Take the tour" opens there again. */
export const TOUR_PROGRESS_KEY = 'x207.tour.progress'
/** Set once the first-visit prompt was answered (started or dismissed), so it is never shown twice. */
export const TOUR_PROMPT_KEY = 'x207.tour.prompted'
/** The event any button sends to open the tour; `detail.restart` opens it at the first step. */
export const TOUR_EVENT = 'x207:tour'

export type Progress = { step: number; done: boolean }

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null // private window, blocked storage: the tour still runs, it only forgets
  }
}

/** Runs a storage write and ignores a failure: storage is a convenience here. */
function quietly(write: () => void) {
  try {
    write()
  } catch {
    // private window, blocked storage: nothing to do
  }
}

export function loadProgress(): Progress | null {
  const raw = read(TOUR_PROGRESS_KEY)
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as Partial<Progress>
    return typeof p.step === 'number' && Number.isInteger(p.step) && p.step >= 0 ? { step: p.step, done: p.done === true } : null
  } catch {
    return null
  }
}

// a step number and a done flag, and one "prompted" flag: no secret, no account data
export const saveProgress = (p: Progress) => quietly(() => window.localStorage.setItem(TOUR_PROGRESS_KEY, JSON.stringify(p)))
export const clearProgress = () => quietly(() => window.localStorage.removeItem(TOUR_PROGRESS_KEY))
export const wasPrompted = () => read(TOUR_PROMPT_KEY) === '1'
export const markPrompted = () => quietly(() => window.localStorage.setItem(TOUR_PROMPT_KEY, '1'))

/** The step to open at: where the visitor left off, unless they finished, asked to restart, or the steps changed under them. */
export function resumeStep(count: number, restart = false): number {
  if (restart) return 0
  const p = loadProgress()
  if (!p || p.done || p.step >= count) return 0
  return p.step
}

/** Open the tour from anywhere in the dashboard. */
export function startTour(restart = false) {
  window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: { restart } }))
}

/** Whether a URL asks for the tour: the /tour route or ?tour=1 on any dashboard page. */
export function wantsTour(pathname: string, search: string): boolean {
  if (pathname === '/tour') return true
  return new URLSearchParams(search).get('tour') === '1'
}
