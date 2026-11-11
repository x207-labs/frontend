import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIVE } from '../facts'
import { NextDash } from './NextDash'

// The laptop section, with WebGL answered by a fake: the real scene (engine/laptop.ts, three.js) needs a GPU, so it is replaced by one that records what the section hands it.
// jsdom has no layout, so the stage size and the place of the section in the page are set here; the section's progress is then known exactly.
const scene = vi.hoisted(() => ({ made: 0, sets: [] as unknown[][], disposed: 0 }))
vi.mock('./engine/laptop', () => ({
  LaptopScene: class {
    constructor() {
      scene.made++
    }
    set(...args: unknown[]) {
      scene.sets.push(args)
      return { loaded: false }
    }
    dispose() {
      scene.disposed++
    }
  },
}))
vi.mock('./hooks', async (original) => ({ ...(await original<typeof import('./hooks')>()), hasWebGL: () => true }))

const STAGE = { w: 1200, h: 800 }
const SECTION_H = 2720 // 340vh of an 800 px stage: 1920 px of scrolling pin it
let top = 0 // where the top of the section is in the viewport
const assign = vi.fn()

function reduceMotion(on: boolean) {
  window.matchMedia = (query: string) =>
    ({ matches: on && query.includes('prefers-reduced-motion'), media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }) as MediaQueryList
}
const scrollTo = async (progress: number) => {
  top = -progress * (SECTION_H - STAGE.h)
  await act(async () => {
    window.dispatchEvent(new Event('scroll'))
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  })
}
const lastSet = () => scene.sets[scene.sets.length - 1]

beforeEach(() => {
  scene.made = 0
  scene.sets = []
  scene.disposed = 0
  top = 0
  assign.mockReset()
  vi.stubGlobal('location', { ...window.location, assign })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => STAGE.w)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => STAGE.h)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return (this.id === 'next' ? { top, bottom: top + SECTION_H, height: SECTION_H, left: 0, right: STAGE.w, width: STAGE.w, x: 0, y: top, toJSON() {} } : { top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON() {} }) as DOMRect
  })
})
afterEach(() => {
  reduceMotion(false)
  document.documentElement.removeAttribute('data-next')
})

describe('v4 landing: the laptop section that hands off to the dashboard', () => {
  it('live: the laptop is made once the section is near, gets the raw (even negative) progress, the area under the copy and the stage size, and hides the nav while pinned', async () => {
    reduceMotion(false)
    top = 600 // the section is still below the fold: progress is negative
    const { container, unmount } = render(<NextDash />)
    expect(container.querySelector('#next')).toHaveClass('is-live')
    await waitFor(() => expect(scene.made).toBe(1))
    await waitFor(() => expect(scene.sets.length).toBeGreaterThan(0))
    const [pr, tilt, region, w, h] = lastSet() as [number, number[], { top: number; bottom: number; maxW: number }, number, number]
    expect(pr).toBeCloseTo(-600 / (SECTION_H - STAGE.h), 5)
    expect(pr).toBeLessThan(0)
    expect(tilt).toEqual([0, 0])
    expect(region).toEqual({ top: 26, bottom: STAGE.h - 18, maxW: Math.min(900, STAGE.w * 0.64) }) // jsdom copy has no height: top is 0 + 26; a wide stage: 64% of the width, at most 900
    expect([w, h]).toEqual([STAGE.w, STAGE.h])
    expect(document.documentElement).not.toHaveAttribute('data-next')
    await scrollTo(0.5)
    expect(lastSet()![0]).toBeCloseTo(0.5, 5)
    expect(document.documentElement).toHaveAttribute('data-next')
    expect(assign).not.toHaveBeenCalled()
    unmount()
    expect(scene.disposed).toBe(1)
    expect(document.documentElement).not.toHaveAttribute('data-next')
  })

  it('live: the page moves to the dashboard once, at the end of the section, and only after the visitor was above 80% on this visit', async () => {
    reduceMotion(false)
    top = -0.99 * (SECTION_H - STAGE.h) // loaded already scrolled to the bottom (Back button, a restored scroll)
    render(<NextDash />)
    await waitFor(() => expect(scene.made).toBe(1))
    await scrollTo(1)
    await scrollTo(0.99)
    expect(assign).not.toHaveBeenCalled() // not armed: the visitor never scrolled in on this visit
    await scrollTo(0.5)
    expect(assign).not.toHaveBeenCalled()
    await scrollTo(0.9)
    expect(assign).not.toHaveBeenCalled()
    await scrollTo(0.99)
    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith(LIVE.dashboard)
    await scrollTo(1)
    await scrollTo(0.99)
    expect(assign).toHaveBeenCalledTimes(1)
  })

  it('live: on a portrait stage the picture gets more room under the copy and almost the full width', async () => {
    reduceMotion(false)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 390)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800)
    render(<NextDash />)
    await waitFor(() => expect(scene.sets.length).toBeGreaterThan(0))
    const region = lastSet()![2] as { top: number; bottom: number; maxW: number }
    expect(region).toEqual({ top: 34, bottom: 782, maxW: 390 * 0.94 })
  })

  it('reduced motion with WebGL: the laptop stands open and still (0.19), nothing is pinned and the page never moves on', async () => {
    reduceMotion(true)
    const { container } = render(<NextDash />)
    expect(container.querySelector('#next')).toHaveClass('is-still')
    expect(container.querySelector('.cue')).toBeNull()
    await waitFor(() => expect(scene.made).toBe(1))
    await waitFor(() => expect(scene.sets.length).toBeGreaterThan(0))
    for (const [pr, tilt] of scene.sets as [number, number[]][]) {
      expect(pr).toBe(0.19)
      expect(tilt).toEqual([0, 0])
    }
    await scrollTo(1)
    await scrollTo(0.99)
    expect(assign).not.toHaveBeenCalled()
    expect(document.documentElement).not.toHaveAttribute('data-next')
    expect(screen.getByRole('link', { name: 'Open the dashboard' })).toHaveAttribute('href', LIVE.dashboard)
  })
})
