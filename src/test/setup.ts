import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { resetRateLimit } from '../api/client'

// FE-049: the fixtures carry fixed dates (deadlines, expiries), so every test starts its clock at the same instant and never breaks with the calendar. Only Date
// is faked and it keeps running (timers stay real). Set here too, not only before each test, so a date read while a test file is imported is the same.
// A test against a real chain or backend opts out with vi.useRealTimers().
const TEST_NOW = Date.parse('2026-11-09T10:00:00Z')
const pinClock = () => vi.useFakeTimers({ toFake: ['Date'], now: TEST_NOW, shouldAdvanceTime: true })
pinClock()
beforeEach(pinClock)
afterEach(() => vi.useRealTimers())

afterEach(cleanup)
// FE-046: a 429 in one test must not slow the polling of the next one.
afterEach(resetRateLimit)

// FE-044: the landing page uses motion, which asks for IntersectionObserver (reveal on scroll) and matchMedia (reduced motion); jsdom has neither.
if (typeof window !== 'undefined' && !('IntersectionObserver' in window)) {
  class NoIntersection {
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds = []
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }
  Object.assign(window, { IntersectionObserver: NoIntersection })
}
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })
}
