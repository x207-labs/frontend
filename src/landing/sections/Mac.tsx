import { useId, type ReactNode } from 'react'

/** A macOS window: traffic lights, a centred title and an optional action on the right. The hero replay and the build terminal sit in one. */
export function Mac({ title, action, className = '', children }: { title: ReactNode; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={`mac ${className}`}>
      <div className="mac-bar">
        <span className="lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="mac-title">{title}</span>
        <span className="mac-act">{action}</span>
      </div>
      {children}
    </div>
  )
}

/** A loop of agents written as m00 › m01 › m02 › m00, with a chevron icon between the names (the path closes on its first agent). */
export function LoopPath({ members, label }: { members: number[]; label: (m: number) => string }) {
  const path = [...members, members[0]]
  return (
    <span className="loop-path">
      <span className="sr">{path.map(label).join(' to ')}</span>
      {path.map((m, i) => (
        <span key={i} aria-hidden="true">
          {i > 0 && (
            <svg className="chev-r" width="7" height="9" viewBox="0 0 7 9">
              <path d="M1.5 1 5 4.5 1.5 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {label(m)}
        </span>
      ))}
    </span>
  )
}

/** The horizon the full-screen sections rise out of: two hairline arcs and the fifteen agents as dots along the outer one (no gradient). */
export function Horizon({ className = '' }: { className?: string }) {
  return (
    <svg className={`horizon ${className}`} viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <ellipse cx="800" cy="860" rx="1100" ry="560" />
      <ellipse cx="800" cy="900" rx="900" ry="470" />
      {Array.from({ length: 15 }, (_, i) => {
        const a = Math.PI * (1.18 + (i / 14) * 0.64)
        return <circle key={i} cx={800 + 1100 * Math.cos(a)} cy={860 + 560 * Math.sin(a)} r="5" />
      })}
    </svg>
  )
}

export type Mood = 'happy' | 'smile' | 'sad' | 'flat'

const MOUTH: Record<Mood, string> = {
  happy: 'M15.8 25.2h8.4q0 4.6-4.2 4.6t-4.2-4.6z',
  smile: 'M16.6 26.4q3.4 2.6 6.8 0',
  sad: 'M16.6 28.6q3.4-2.6 6.8 0',
  flat: 'M17 27.4h6',
}

/** One agent of epoch 8 as a face, tinted by how it settled (the same faces as the ring), or in graphite (`mono`); the mouth shows the mood. */
export function Face({ tone, size = 28, mood = 'smile', mono = false, round = false }: { tone: string; size?: number; mood?: Mood; mono?: boolean; round?: boolean }) {
  const id = `face${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <svg className={mono ? 'face mono-face' : 'face'} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" style={{ ['--tone' as string]: tone }}>
      {mono && (
        // graphite, lit from the top left: the face of the agent cards
        <defs>
          <linearGradient id={id} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor="#4a4a4a" />
            <stop offset="1" stopColor="#262626" />
          </linearGradient>
        </defs>
      )}
      <rect x="1" y="1" width="38" height="38" rx={round ? 19 : 13} style={mono ? { fill: `url(#${id})` } : undefined} />
      <ellipse cx="14.5" cy="19" rx="2.6" ry="4.4" />
      <ellipse cx="25.5" cy="19" rx="2.6" ry="4.4" />
      <path d={MOUTH[mood]} className={mood === 'happy' ? 'open' : undefined} />
    </svg>
  )
}

/** The pair of calls to action: a glowing blue pill set in a dark ring, with a chevron, and a glass pill with a play chip. */
export function Cta({ go, watch }: { go: { href: string; label: string }; watch: { href: string; label: string } }) {
  return (
    <div className="cta">
      <a className="cta-go" href={go.href}>
        <span className="cta-label">{go.label}</span>
        <svg className="cta-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4.2 2 8.2 6l-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
      <a className="cta-glass" href={watch.href}>
        <span className="cta-play" aria-hidden="true">
          <svg width="9" height="9" viewBox="0 0 10 10">
            <path d="M3 1.8v6.4a.6.6 0 0 0 .9.5l5-3.2a.6.6 0 0 0 0-1L3.9 1.3a.6.6 0 0 0-.9.5Z" fill="currentColor" />
          </svg>
        </span>
        {watch.label}
      </a>
    </div>
  )
}
