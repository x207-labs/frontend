// FE-070: one small drawing per idea, so a step reads at a glance before its caption is read. Decorative: the step title carries the meaning.
export type Glyph = 'join' | 'trade' | 'loop' | 'net'

export function StepGlyph({ name }: { name: Glyph }) {
  return (
    <svg className={`glyph glyph-${name}`} viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false">
      {name === 'join' && (
        <>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2
            return <circle key={i} cx={24 + Math.cos(a) * 14} cy={24 + Math.sin(a) * 14} r={3.5} className="glyph-dot" />
          })}
          <circle cx="24" cy="24" r="14" className="glyph-ring" />
          <circle cx="24" cy="24" r="5" className="glyph-accent" />
        </>
      )}
      {name === 'trade' && (
        <>
          <path d="M8 14h32v6a4 4 0 0 0 0 8v6H8v-6a4 4 0 0 0 0-8z" className="glyph-line" />
          <path d="M15 27c3-4 5 2 8-1s4-3 6 0 3 1 4-1" className="glyph-sign" />
          <path d="M15 20h12" className="glyph-line" />
        </>
      )}
      {name === 'loop' && (
        <>
          <path d="M24 9a15 15 0 0 1 13 22.5" className="glyph-line" />
          <path d="M33.5 37A15 15 0 0 1 10 31" className="glyph-line" />
          <path d="M11 24A15 15 0 0 1 18 10.3" className="glyph-line" />
          <path d="M34 28l3.5 4 3-4.5M14 33.5l-4.5-2 0.5 5M15.5 8.5l3 2-1.5 4.5" className="glyph-line" />
          <circle cx="24" cy="24" r="3" className="glyph-accent" />
        </>
      )}
      {name === 'net' && (
        <>
          <path d="M6 24h22" className="glyph-line" />
          <path d="M22 18l6 6-6 6" className="glyph-line" />
          <circle cx="36" cy="24" r="7" className="glyph-coin" />
          <path d="M36 20.5v7" className="glyph-line" />
        </>
      )}
    </svg>
  )
}
