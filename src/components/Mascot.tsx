// v6 (2026-11-12): every agent is a small coloured shape with two eyes, after the Grok Bot app. The shape and the colour come from a hash of the
// NEAR account, so one account looks the same on every device and to everyone, with no setting stored anywhere.

const SHAPES = [
  { name: 'ball', body: <circle cx="16" cy="16" r="14" />, eyes: 12.5 },
  { name: 'bun', body: <ellipse cx="16" cy="17" rx="15" ry="12" />, eyes: 13 },
  { name: 'box', body: <rect x="3" y="3" width="26" height="26" rx="8" />, eyes: 12 },
  { name: 'pill', body: <rect x="1" y="8" width="30" height="17" rx="8.5" />, eyes: 13 },
  { name: 'peak', body: <path d="M16 3.5c1.2 0 2.3.7 2.9 1.7l11 19.4c1.2 2.1-.3 4.7-2.8 4.7H4.9c-2.5 0-4-2.6-2.8-4.7l11-19.4c.6-1 1.7-1.7 2.9-1.7z" />, eyes: 17 },
  { name: 'gem', body: <path d="M16 3.5l11 6.35v12.3L16 28.5 5 22.15V9.85z" strokeWidth="4" strokeLinejoin="round" />, eyes: 12.5 },
  { name: 'cloud', body: <path d="M9 27a7 7 0 0 1-1.6-13.8A8.5 8.5 0 0 1 24 11.6a7.6 7.6 0 0 1-.6 15.4z" />, eyes: 15 },
  { name: 'drop', body: <path d="M16 2.5c5 6.5 11 12.4 11 18a11 11 0 0 1-22 0c0-5.6 6-11.5 11-18z" />, eyes: 16.5 },
] as const

export const MASCOT_COLORS = ['#8b5e3c', '#e5484d', '#f07a2f', '#f5a524', '#30a46c', '#12a594', '#3b82f6', '#8e4ec6', '#e93d82', '#737373'] as const

/** FNV-1a: a small stable hash of the account id. */
function hash(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** The shape and colour of an account, the same everywhere. */
export function mascotOf(id: string): { shape: number; color: string } {
  const h = hash(id)
  return { shape: h % SHAPES.length, color: MASCOT_COLORS[(h >>> 8) % MASCOT_COLORS.length] }
}

/** The mascot of an account. Decorative: the name always sits beside it. */
export function Mascot({ id, size = 32, className }: { id: string; size?: number; className?: string }) {
  const { shape, color } = mascotOf(id)
  const s = SHAPES[shape]
  const y = s.eyes
  return (
    <svg className={`mascot ${className ?? ''}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" data-shape={s.name}>
      <g fill={color} stroke={color} strokeWidth="0">
        {s.body}
      </g>
      <path d={`M17.4 ${y}l-.5 3.2M21.4 ${y}l-.5 3.2`} stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}
