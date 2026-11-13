// FE-121: where the tour resumes, and that blocked storage never breaks it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearProgress, loadProgress, markPrompted, TOUR_PROGRESS_KEY as PROGRESS_KEY, resumeStep, saveProgress, startTour, TOUR_EVENT, wantsTour, wasPrompted } from './state'

describe('tour state', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('resumes where the visitor left off', () => {
    expect(resumeStep(11)).toBe(0)
    saveProgress({ step: 4, done: false })
    expect(loadProgress()).toEqual({ step: 4, done: false })
    expect(resumeStep(11)).toBe(4)
  })

  it('starts over after a finished tour, on restart, and when the steps changed', () => {
    saveProgress({ step: 4, done: true })
    expect(resumeStep(11)).toBe(0)
    saveProgress({ step: 4, done: false })
    expect(resumeStep(11, true)).toBe(0)
    saveProgress({ step: 12, done: false })
    expect(resumeStep(11)).toBe(0)
    clearProgress()
    expect(loadProgress()).toBeNull()
  })

  it('ignores a broken value', () => {
    window.localStorage.setItem(PROGRESS_KEY, '{nope')
    expect(loadProgress()).toBeNull()
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify({ step: -2 }))
    expect(resumeStep(11)).toBe(0)
  })

  it('keeps working when storage throws (private window, blocked site data)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => saveProgress({ step: 3, done: false })).not.toThrow()
    expect(() => markPrompted()).not.toThrow()
    expect(resumeStep(11)).toBe(0)
    expect(wasPrompted()).toBe(false)
  })

  it('remembers that the first-visit prompt was answered', () => {
    expect(wasPrompted()).toBe(false)
    markPrompted()
    expect(wasPrompted()).toBe(true)
  })

  it('knows the URLs that ask for the tour', () => {
    expect(wantsTour('/tour', '')).toBe(true)
    expect(wantsTour('/stats', '?tour=1')).toBe(true)
    expect(wantsTour('/stats', '?circle=v018&tour=1')).toBe(true)
    expect(wantsTour('/stats', '?tour=0')).toBe(false)
    expect(wantsTour('/app', '')).toBe(false)
  })

  it('asks the launcher to start with an event', () => {
    const seen: unknown[] = []
    const on = (e: Event) => seen.push((e as CustomEvent).detail)
    window.addEventListener(TOUR_EVENT, on)
    startTour()
    startTour(true)
    window.removeEventListener(TOUR_EVENT, on)
    expect(seen).toEqual([{ restart: false }, { restart: true }])
  })
})
