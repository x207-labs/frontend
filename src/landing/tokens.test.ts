import { describe, expect, it } from 'vitest'
import { CHAPTER_KEYS, captionFade, chapterAt, RAIL, STORY, type ChapterKey } from './tokens'

// The opacity of a caption at story progress p, interpolated the way motion's useTransform does (clamped, linear between keyframes).
const opacityAt = (key: ChapterKey, p: number) => {
  const { at, opacity } = captionFade(key)
  if (p <= at[0]) return opacity[0]
  if (p >= at[at.length - 1]) return opacity[opacity.length - 1]
  const i = at.findIndex((x, j) => p >= x && p < at[j + 1])
  return opacity[i] + ((p - at[i]) / (at[i + 1] - at[i])) * (opacity[i + 1] - opacity[i])
}

describe('FE-052 story progress to chapter', () => {
  it('the chapters are in story order and touch or leave a gap, never overlap', () => {
    for (let i = 1; i < CHAPTER_KEYS.length; i++) expect(STORY[CHAPTER_KEYS[i]][0]).toBeGreaterThanOrEqual(STORY[CHAPTER_KEYS[i - 1]][1])
  })

  it('at every STORY boundary the HUD chapter is the one that starts there; just before it, the one that ends there', () => {
    const eps = 1e-6
    for (const key of CHAPTER_KEYS) {
      const [a, b] = STORY[key]
      expect(chapterAt(a)).toBe(key)
      expect(chapterAt(b - eps)).toBe(key)
      expect(chapterAt(b)).not.toBe(key)
    }
    expect(chapterAt(STORY.hero[0])).toBeNull()
    expect(chapterAt(STORY.hero[1])).toBeNull()
    expect(chapterAt(STORY.dive[0])).toBeNull()
    expect(chapterAt(1)).toBeNull()
  })

  it('at every progress step the HUD lights the one chapter whose caption shows, and never two captions show at once', () => {
    for (let s = 0; s <= 1000; s++) {
      const p = s / 1000
      const showing = CHAPTER_KEYS.filter((k) => opacityAt(k, p) > 0)
      expect(showing.length, `p=${p}`).toBeLessThanOrEqual(1)
      if (showing.length === 1) expect(chapterAt(p), `p=${p}`).toBe(showing[0])
    }
    // The case that was reported: the Clearing caption is fully on, and so is its tick.
    expect(opacityAt('loops', 0.57)).toBe(1)
    expect(chapterAt(0.57)).toBe('loops')
  })

  it('the rail fill only grows, and reaches each chapter tick as that chapter starts', () => {
    expect(RAIL.at).toHaveLength(RAIL.fill.length)
    for (let i = 1; i < RAIL.at.length; i++) {
      expect(RAIL.at[i]).toBeGreaterThan(RAIL.at[i - 1])
      expect(RAIL.fill[i]).toBeGreaterThan(RAIL.fill[i - 1])
    }
    CHAPTER_KEYS.forEach((k, i) => expect(RAIL.at[i + 1]).toBe(STORY[k][0]))
    expect([RAIL.fill[0], RAIL.fill[RAIL.fill.length - 1]]).toEqual([0, 1])
  })
})
