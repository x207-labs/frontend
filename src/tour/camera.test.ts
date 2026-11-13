// FE-121: the camera math of the tour, without a browser.
import { describe, expect, it } from 'vitest'
import { arrowPath, css, frame, freeArea, holePath, IDENTITY, unzoom, zoom, type Box } from './camera'

const origin = { x: 0, y: 0 }

describe('camera', () => {
  it('zoom and unzoom are inverses', () => {
    const cam = { tx: -120, ty: 40, s: 1.4 }
    const o = { x: 30, y: 10 }
    const layout: Box = { x: 200, y: 300, w: 120, h: 80 }
    const shown = zoom(layout, cam, o)
    const back = unzoom(shown, cam, o)
    expect(back.x).toBeCloseTo(layout.x)
    expect(back.y).toBeCloseTo(layout.y)
    expect(back.w).toBeCloseTo(layout.w)
    expect(back.h).toBeCloseTo(layout.h)
  })

  it('frames a small box in the middle of the free area, up to the max scale', () => {
    const free: Box = { x: 0, y: 0, w: 1000, h: 800 }
    const cam = frame({ x: 600, y: 500, w: 100, h: 50 }, free, origin, 1.6, 24)
    expect(cam.s).toBe(1.6)
    const shown = zoom({ x: 600, y: 500, w: 100, h: 50 }, cam, origin)
    expect(shown.x + shown.w / 2).toBeCloseTo(500)
    expect(shown.y + shown.h / 2).toBeCloseTo(400)
  })

  it('never shrinks the app, and keeps the left and top edges of a box larger than the free area', () => {
    const free: Box = { x: 0, y: 0, w: 600, h: 400 }
    const cam = frame({ x: 50, y: 900, w: 1200, h: 900 }, free, origin, 1.6, 24)
    expect(cam.s).toBe(1)
    const shown = zoom({ x: 50, y: 900, w: 1200, h: 900 }, cam, origin)
    expect(shown.x).toBeCloseTo(24)
    expect(shown.y).toBeCloseTo(24)
  })

  it('writes no transform for the identity camera', () => {
    expect(css(IDENTITY)).toBe('')
    expect(css({ tx: 10, ty: 0, s: 1.2 })).toBe('translate(10.00px, 0.00px) scale(1.2000)')
  })

  it('cuts a hole in the dim only where the target is', () => {
    expect(holePath(800, 600, null)).toBe('M0 0H800V600H0Z')
    const p = holePath(800, 600, { x: 10, y: 20, w: 100, h: 40 }, 8)
    expect(p.startsWith('M0 0H800V600H0Z')).toBe(true)
    expect(p).toContain('M18 20H102')
  })

  it('draws an arrow only when the panel and the hole are apart', () => {
    const panel: Box = { x: 1000, y: 20, w: 380, h: 700 }
    expect(arrowPath({ x: 100, y: 200, w: 300, h: 100 }, panel, 'side')).toMatch(/^M990\.0 250\.0C/)
    expect(arrowPath({ x: 900, y: 200, w: 80, h: 100 }, panel, 'side')).toBeNull()
    expect(arrowPath(null, panel, 'side')).toBeNull()
    expect(arrowPath({ x: 0, y: 0, w: 10, h: 10 }, panel, 'center')).toBeNull()
    const bottom: Box = { x: 8, y: 500, w: 359, h: 300 }
    expect(arrowPath({ x: 40, y: 100, w: 200, h: 100 }, bottom, 'bottom')).toMatch(/^M140\.0 490\.0C/)
    expect(arrowPath({ x: 40, y: 440, w: 200, h: 40 }, bottom, 'bottom')).toBeNull()
  })

  it('leaves the free area left of a side panel, above a bottom panel, and all of it for a centred one', () => {
    const panel: Box = { x: 1000, y: 500, w: 380, h: 300 }
    expect(freeArea('side', panel, 1440, 900)).toEqual({ x: 0, y: 0, w: 988, h: 900 })
    expect(freeArea('bottom', panel, 1440, 900)).toEqual({ x: 0, y: 0, w: 1440, h: 492 })
    expect(freeArea('center', panel, 1440, 900)).toEqual({ x: 0, y: 0, w: 1440, h: 900 })
  })
})
