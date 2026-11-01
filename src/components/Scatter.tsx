import { useState } from 'react'

export type ScatterPoint = { id: number; x: number; y: number; selected: boolean; detail: string }

const W = 400
const H = 240
const M = { top: 16, right: 16, bottom: 44, left: 52 }

type Props = {
  title: string
  xLabel: string
  yLabel: string
  yMax: number
  formatY: (v: number) => string
  points: ScatterPoint[]
}

// Satu seri titik per epoch terhadap kepadatan grafik. Sumbu x selalu 0..1.
export function Scatter({ title, xLabel, yLabel, yMax, formatY, points }: Props) {
  const [hover, setHover] = useState<ScatterPoint | null>(null)
  const sx = (v: number) => M.left + v * (W - M.left - M.right)
  const sy = (v: number) => H - M.bottom - (v / yMax) * (H - M.top - M.bottom)
  const yTicks = [0, yMax / 2, yMax]
  const xTicks = [0, 0.25, 0.5, 0.75, 1]
  return (
    <figure className="scatter">
      <figcaption>{title}</figcaption>
      <div className="scatter-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. Rincian ada di tabel per epoch.`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line className="grid" x1={M.left} x2={W - M.right} y1={sy(t)} y2={sy(t)} />
              <text className="tick" x={M.left - 8} y={sy(t) + 4} textAnchor="end">
                {formatY(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} className="tick" x={sx(t)} y={H - M.bottom + 18} textAnchor="middle">
              {t.toLocaleString('id-ID')}
            </text>
          ))}
          <text className="tick" x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle">
            {xLabel}
          </text>
          <text className="tick" transform={`translate(12 ${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle">
            {yLabel}
          </text>
          {points.map((p) => (
            <g
              key={p.id}
              data-testid={`dot-${p.id}`}
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover(null)}
            >
              <circle className="hit" cx={sx(p.x)} cy={sy(p.y)} r={14} />
              <circle className={p.selected ? 'dot dot-selected' : 'dot'} cx={sx(p.x)} cy={sy(p.y)} r={p.selected ? 7 : 5} />
              {p.selected && (
                <text className="dot-label" x={sx(p.x)} y={sy(p.y) - 12} textAnchor="middle">
                  Epoch {p.id}
                </text>
              )}
            </g>
          ))}
        </svg>
        {hover && (
          <div
            className="tooltip"
            role="tooltip"
            style={{ left: `${(sx(hover.x) / W) * 100}%`, top: `${(sy(hover.y) / H) * 100}%` }}
          >
            <strong>Epoch {hover.id}</strong> {hover.detail}
          </div>
        )}
      </div>
    </figure>
  )
}
