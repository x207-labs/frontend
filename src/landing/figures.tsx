// FE-051: one hairline figure per section after the theatre, drawn in the theatre's line work so the page keeps one look past the brain.
// Decorative only (aria-hidden): every fact stays in the section's text. Hidden on narrow screens, where the title needs the width.

type FigureName = 'cabinet' | 'hub' | 'window'

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' } as const

function Cabinet() {
  // The barter cabinet of the theatre, three lockers by three, seen a little from the side; one locker is open.
  const cells = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => [30 + c * 44, 34 + r * 38] as const))
  return (
    <>
      <path {...line} d="M30 34 l18 -14 h132 l-18 14 M162 34 l18 -14 v114 l-18 14" />
      {cells.map(([x, y], i) => (
        <rect key={i} {...line} x={x + 2} y={y + 2} width={40} height={34} className={i === 4 ? 'is-lit' : undefined} />
      ))}
      <path {...line} className="is-lit" d="M76 72 l-14 -8 v30 l14 8" />
      <path {...line} d="M24 148 h144 l18 -14" />
    </>
  )
}

function Hub() {
  // A star graph: everyone pays one hub, so no loop can cancel. The dashed ring is the loop that is not there.
  const nodes = Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2
    return [110 + Math.cos(a) * 62, 84 + Math.sin(a) * 62] as const
  })
  return (
    <>
      <circle {...line} cx={110} cy={84} r={62} strokeDasharray="2 5" />
      {nodes.map(([x, y], i) => (
        <g key={i}>
          <line {...line} x1={x} y1={y} x2={110} y2={84} />
          <circle {...line} cx={x} cy={y} r={5} />
        </g>
      ))}
      <circle {...line} className="is-lit" cx={110} cy={84} r={9} />
    </>
  )
}

function Window() {
  // A terminal with one line in it and the cursor after it.
  return (
    <>
      <rect {...line} x={14} y={24} width={192} height={120} rx={6} />
      <path {...line} d="M14 44 h192" />
      {[28, 40, 52].map((x) => (
        <circle key={x} {...line} cx={x} cy={34} r={3} />
      ))}
      <path {...line} className="is-lit" d="M30 74 l8 6 l-8 6" />
      <path {...line} d="M46 86 h86" />
      <rect className="is-lit lp-cursor" x={138} y={72} width={8} height={15} fill="currentColor" />
      <path {...line} d="M30 108 h120 M30 122 h64" strokeDasharray="2 4" />
    </>
  )
}

const DRAW: Record<FigureName, () => React.JSX.Element> = { cabinet: Cabinet, hub: Hub, window: Window }

export function SectionFigure({ name }: { name: FigureName }) {
  const Draw = DRAW[name]
  return (
    <svg className={`section-figure is-${name}`} viewBox="0 0 220 168" aria-hidden="true" focusable="false">
      <Draw />
    </svg>
  )
}
