import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { resetRateLimit } from '../api/client'

// FE-124: findBy* and waitFor give up after 1 s by default. Under load a lazy page chunk or a voucher signature can take longer, and the test then fails
// with "Unable to find" although the page is right. They still resolve as soon as the element is there; only a real absence waits the full 5 s.
configure({ asyncUtilTimeout: 5_000 })

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
// v4 landing: jsdom has no canvas, and its getContext logs "not implemented" on every call. Answer null quietly: the landing then keeps its static markup
// (no 2D canvas for the ring and the story, no WebGL for the laptop), which is what the tests check.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
}
