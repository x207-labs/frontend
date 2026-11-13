// FE-121: the camera of the tour. It zooms the whole app window (`.shell`) with one CSS transform (translate, then scale, origin top left), so the
// element a step is about sits in the free part of the screen, larger, while the panel of the tour keeps its own corner. Pure math, so it is tested
// without a browser.

export type Box = { x: number; y: number; w: number; h: number }
export type Cam = { tx: number; ty: number; s: number }

export const IDENTITY: Cam = { tx: 0, ty: 0, s: 1 }

/** Where an element sits with no transform, from where it sits now under `cam` (both measured from the viewport). */
export function unzoom(now: Box, cam: Cam, origin: { x: number; y: number }): Box {
  // screen = origin + t + s * (layout - origin)  =>  layout = origin + (screen - origin - t) / s
  return {
    x: origin.x + (now.x - origin.x - cam.tx) / cam.s,
    y: origin.y + (now.y - origin.y - cam.ty) / cam.s,
    w: now.w / cam.s,
    h: now.h / cam.s,
  }
}

/** Where an element that sits at `layout` (no transform) shows under `cam`. */
export function zoom(layout: Box, cam: Cam, origin: { x: number; y: number }): Box {
  return {
    x: origin.x + cam.tx + cam.s * (layout.x - origin.x),
    y: origin.y + cam.ty + cam.s * (layout.y - origin.y),
    w: layout.w * cam.s,
    h: layout.h * cam.s,
  }
}

/**
 * The camera that puts `layout` in the middle of `free` (the part of the screen the panel leaves open), as large as fits with `pad` around it,
 * never above `maxScale` and never below 1 (the tour zooms in, it does not shrink the app). A box taller than `free` keeps its top in view.
 */
export function frame(layout: Box, free: Box, origin: { x: number; y: number }, maxScale: number, pad = 24): Cam {
  const fit = Math.min((free.w - 2 * pad) / Math.max(1, layout.w), (free.h - 2 * pad) / Math.max(1, layout.h))
  const s = Math.max(1, Math.min(maxScale, fit))
  const w = layout.w * s
  const h = layout.h * s
  // a box wider (taller) than the free part keeps its left edge (its top) in view, instead of losing both sides
  const x = w > free.w - 2 * pad ? free.x + pad : free.x + (free.w - w) / 2
  const y = h > free.h - 2 * pad ? free.y + pad : free.y + (free.h - h) / 2
  // origin + t + s * (layout.x - origin.x) = x
  return { tx: x - origin.x - s * (layout.x - origin.x), ty: y - origin.y - s * (layout.y - origin.y), s }
}

/** Ease out, quick start and a soft landing (the same curve as --ds-ease). */
export const ease = (t: number) => 1 - Math.pow(1 - t, 4)

export const mix = (a: Cam, b: Cam, t: number): Cam => ({ tx: a.tx + (b.tx - a.tx) * t, ty: a.ty + (b.ty - a.ty) * t, s: a.s + (b.s - a.s) * t })
export const mixBox = (a: Box, b: Box, t: number): Box => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t })

/** The CSS transform of a camera. */
export const css = (c: Cam) => (c.s === 1 && c.tx === 0 && c.ty === 0 ? '' : `translate(${c.tx.toFixed(2)}px, ${c.ty.toFixed(2)}px) scale(${c.s.toFixed(4)})`)

/** An SVG path of the whole screen with a rounded hole over `hole`; with `fill-rule: evenodd` the hole stays clear. */
export function holePath(vw: number, vh: number, hole: Box | null, r = 14): string {
  const outer = `M0 0H${vw}V${vh}H0Z`
  if (!hole) return outer
  const x = Math.round(hole.x)
  const y = Math.round(hole.y)
  const w = Math.max(0, Math.round(hole.w))
  const h = Math.max(0, Math.round(hole.h))
  const k = Math.min(r, w / 2, h / 2)
  return `${outer}M${x + k} ${y}H${x + w - k}A${k} ${k} 0 0 1 ${x + w} ${y + k}V${y + h - k}A${k} ${k} 0 0 1 ${x + w - k} ${y + h}H${x + k}A${k} ${k} 0 0 1 ${x} ${y + h - k}V${y + k}A${k} ${k} 0 0 1 ${x + k} ${y}Z`
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * A curved arrow from the panel of the tour to the hole: from the left edge of a panel at the side, from the top edge of a panel at the bottom. Null when
 * the two are too close or overlap (an arrow would point into itself), or when there is no hole.
 */
export function arrowPath(hole: Box | null, panel: Box, place: 'side' | 'bottom' | 'center'): string | null {
  if (!hole || place === 'center') return null
  if (place === 'side') {
    const sx = panel.x - 10
    const ex = hole.x + hole.w + 12
    if (sx - ex < 48) return null
    const sy = clamp(hole.y + hole.h / 2, panel.y + 36, panel.y + panel.h - 36)
    const ey = clamp(sy, hole.y + 12, hole.y + hole.h - 12)
    const dx = (sx - ex) * 0.5
    return `M${sx.toFixed(1)} ${sy.toFixed(1)}C${(sx - dx).toFixed(1)} ${sy.toFixed(1)} ${(ex + dx).toFixed(1)} ${ey.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`
  }
  const sy = panel.y - 10
  const ey = hole.y + hole.h + 12
  if (sy - ey < 40) return null
  const sx = clamp(hole.x + hole.w / 2, panel.x + 36, panel.x + panel.w - 36)
  const ex = clamp(sx, hole.x + 12, hole.x + hole.w - 12)
  const dy = (sy - ey) * 0.5
  return `M${sx.toFixed(1)} ${sy.toFixed(1)}C${sx.toFixed(1)} ${(sy - dy).toFixed(1)} ${ex.toFixed(1)} ${(ey + dy).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`
}

/** The part of the screen the panel leaves open: left of a panel at the side, above a panel at the bottom. */
export function freeArea(place: 'side' | 'bottom' | 'center', panel: Box, vw: number, vh: number): Box {
  if (place === 'side') return { x: 0, y: 0, w: Math.max(1, panel.x - 12), h: vh }
  if (place === 'bottom') return { x: 0, y: 0, w: vw, h: Math.max(1, panel.y - 8) }
  return { x: 0, y: 0, w: vw, h: vh }
}

/** A box grown by `p` on every side. */
export const grow = (b: Box, p: number): Box => ({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p })

export const boxOf = (r: DOMRect | { left: number; top: number; width: number; height: number }): Box => ({ x: r.left, y: r.top, w: r.width, h: r.height })
