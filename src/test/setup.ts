import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

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
