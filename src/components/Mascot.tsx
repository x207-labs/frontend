import type { ReactNode } from 'react'

// v6 (2026-11-12): the x207 mascot. Every agent is a bright shape with a face: two dark oval eyes and a mouth, the same face as the agents of the landing page.
// The shape and the colour come from a hash of the NEAR account, so one account looks the same on every device and to everyone, with no setting stored.
// The expression says how the agent stands (happy when settled, surprised when it owes, sad when it was closed from its stake); without a standing it is
// one of the friendly faces, also picked from the account.

export type Mood = 'smile' | 'happy' | 'wink' | 'smirk' | 'surprised' | 'sad' | 'flat'

/** The body of each shape on a 32-unit box, and the centre of its face (the eyes; the mouth sits under them). */
const SHAPES = [
  { name: 'ball', body: <circle cx="16" cy="16" r="14" />, face: [16.5, 14] },
  { name: 'bun', body: <ellipse cx="16" cy="16.5" rx="15" ry="13" />, face: [16.5, 14.5] },
  { name: 'box', body: <rect x="3" y="3" width="26" height="26" rx="8" />, face: [16.5, 14] },
  { name: 'pill', body: <rect x="1" y="6" width="30" height="21" rx="10.5" />, face: [16.5, 14] },
  { name: 'peak', body: <path d="M13.2 5.6q2.8-3.9 5.6 0l11.4 17.6q2.4 5.3-3.6 5.3H5.4q-6 0-3.6-5.3z" />, face: [16, 19.5] },
  { name: 'gem', body: <path d="M16 3.5l12.2 6.8v11.4L16 28.5 3.8 21.7V10.3z" strokeWidth="4" strokeLinejoin="round" />, face: [16, 14.5] },
  { name: 'cloud', body: <path d="M8.2 28a7.2 7.2 0 0 1-1.8-14.1A9.6 9.6 0 0 1 25 11.4 8.3 8.3 0 0 1 24.4 28z" />, face: [16.5, 18] },
  { name: 'drop', body: <path d="M16 2.5c4.8 4.4 14 9.8 14 17.1 0 6.1-6.3 10.4-14 10.4S2 25.7 2 19.6C2 12.3 11.2 6.9 16 2.5z" />, face: [16, 19] },
] as const

/** Bright enough for the dark features to read on every one of them. */
export const MASCOT_COLORS = ['#d39a6a', '#ff6b6b', '#ff9f45', '#ffcc4d', '#4fd283', '#33c7b8', '#62a0ff', '#ad8bff', '#ff80b8', '#bdbdbd'] as const
const FRIENDLY: Mood[] = ['smile', 'happy', 'wink', 'smirk']
const INK = '#161616'

/** FNV-1a: a small stable hash of the account id. */
function hash(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** The shape, colour and resting face of an account, the same everywhere. */
export function mascotOf(id: string): { shape: number; color: string; mood: Mood } {
  const h = hash(id)
  return { shape: h % SHAPES.length, color: MASCOT_COLORS[(h >>> 8) % MASCOT_COLORS.length], mood: FRIENDLY[(h >>> 16) % FRIENDLY.length] }
}

function Face({ x, y, mood }: { x: number; y: number; mood: Mood }) {
  const eye = (cx: number) => <ellipse cx={cx} cy={y} rx="1.45" ry="2.25" fill={INK} />
  const line = { fill: 'none', stroke: INK, strokeWidth: 1.5, strokeLinecap: 'round' as const }
  const m = y + 4.6 // the line of the mouth
  const mouth: Record<Mood, ReactNode> = {
    smile: <path d={`M${x - 2.8} ${m}q2.8 2.4 5.6 0`} {...line} />,
    happy: <path d={`M${x - 3.2} ${m - 0.3}h6.4q0 3.6-3.2 3.6t-3.2-3.6z`} fill={INK} />,
    wink: <path d={`M${x - 2.8} ${m}q2.8 2.4 5.6 0`} {...line} />,
    smirk: <path d={`M${x - 2.2} ${m + 0.9}q2.4 .9 4.6-1.2`} {...line} />,
    surprised: <ellipse cx={x} cy={m + 0.9} rx="1.5" ry="1.8" {...line} strokeWidth={1.4} />,
    sad: <path d={`M${x - 2.8} ${m + 1.8}q2.8-2.4 5.6 0`} {...line} />,
    flat: <path d={`M${x - 2.4} ${m + 0.8}h4.8`} {...line} />,
  }
  return (
    // drawn at 1.25x around the eyes, so the face reads at 30 px as it does on the landing page
    <g className="mascot-face" transform={`translate(${x} ${y}) scale(1.25) translate(${-x} ${-y})`}>
      {eye(x - 3.6)}
      {mood === 'wink' ? <path d={`M${x + 2.1} ${y + 0.4}q1.5-1.6 3 0`} {...line} /> : eye(x + 3.6)}
      {mouth[mood]}
    </g>
  )
}

/** The mascot of an account. Decorative: the name always sits beside it. */
export function Mascot({ id, size = 32, mood, className }: { id: string; size?: number; mood?: Mood; className?: string }) {
  const m = mascotOf(id)
  const s = SHAPES[m.shape]
  return (
    <svg className={`mascot ${className ?? ''}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" data-shape={s.name} data-mood={mood ?? m.mood}>
      <g fill={m.color} stroke={m.color} strokeWidth="0">
        {s.body}
      </g>
      <Face x={s.face[0]} y={s.face[1]} mood={mood ?? m.mood} />
    </svg>
  )
}
