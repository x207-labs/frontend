// FE-044: the motion tokens of the landing page. Springs in the iOS manner: quick, settled, a trace of overshoot at most.
export const SPRING = { type: 'spring', stiffness: 170, damping: 26, mass: 1 } as const
export const SPRING_PRESS = { type: 'spring', stiffness: 520, damping: 32 } as const
export const EASE_OUT = [0.22, 1, 0.36, 1] as const

// The phases of the ring, on its one progress value (0..1).
//   members appear  ·  vouchers drawn  ·  gross fades, net labels  ·  net arrows
export const STAGES = { members: [0, 0.14], vouchers: [0.2, 0.44], net: [0.5, 0.64], settle: [0.74, 0.92] } as const

// FE-048: the chapters of the scroll theatre, on its one story value (0..1). The captions, the counters, the brain and the fallback ring all read these.
//   hero  ·  asset kinds drawn in  ·  vouchers flow in  ·  loops cancel  ·  only the net flows out  ·  the camera dives in
export const STORY = { hero: [0, 0.1], kinds: [0.12, 0.3], vouchers: [0.3, 0.48], loops: [0.48, 0.66], net: [0.66, 0.86], dive: [0.88, 1] } as const

// FE-052: the chapters with a caption, in order, and the one mapping from story progress to the chapter on screen. The captions and the HUD both
// read it, so the HUD can never light a chapter other than the one whose caption shows.
export const CHAPTER_KEYS = ['kinds', 'vouchers', 'loops', 'net'] as const
export type ChapterKey = (typeof CHAPTER_KEYS)[number]

/** The chapter whose caption is on screen at story progress `p`, or null outside the chapters (hero, gap, dive). */
export const chapterAt = (p: number): ChapterKey | null => CHAPTER_KEYS.find((k) => p >= STORY[k][0] && p < STORY[k][1]) ?? null

/** The caption's opacity keyframes: it fades in and out inside its own chapter, so two captions never show at once. */
export const captionFade = (key: ChapterKey) => {
  const [a, b] = STORY[key]
  return { at: [a, a + 0.035, b - 0.035, b], opacity: [0, 1, 1, 0] }
}

/** The HUD rail fill: it reaches a chapter's tick the moment that chapter starts, and runs on to the next tick while it plays. The tick
 * centres are those of four ticks on the rail's height (12px labels, 22px gap; within a few hundredths at the 10px gap of a phone). */
export const RAIL = {
  at: [STORY.hero[1], ...CHAPTER_KEYS.map((k) => STORY[k][0]), STORY.net[1]],
  fill: [0, 0.07, 0.36, 0.64, 0.93, 1],
} as const
