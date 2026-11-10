import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { pages, type PageGroup } from '../routes'
import { NavIcon } from './icons'
import { PAGE_HUE } from './pageHue'

// FE-082: Home's way into the app, drawn as what x207 is: every kind of trade sits on the ring of the circle and runs a line into the middle, where the
// epoch nets it out. Pointing at a trade lights its line in the page's hue and sends a dash along it to the centre. The other pages are a row of chips
// under the map. Under 760 px the ring folds into a two-column grid of the same tiles and the lines are not drawn.

/** Points on an ellipse around the centre, in percent of the map, starting at the top and going clockwise. */
function ringPoints(n: number): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (-90 + (360 / n) * i) * (Math.PI / 180)
    return { x: 50 + 40 * Math.cos(a), y: 50 + 37 * Math.sin(a) }
  })
}

const OTHER_GROUPS: PageGroup[] = ['Overview', 'My account', 'Governance', 'Help']

export function CircleMap({ counts = {}, signedIn }: { counts?: Record<string, number | undefined>; signedIn: boolean }) {
  const { search } = useLocation()
  const [lit, setLit] = useState<string | null>(null)
  const trades = pages.filter((p) => p.group === 'Marketplace')
  const points = ringPoints(trades.length)
  const others = pages.filter((p) => OTHER_GROUPS.includes(p.group) && p.path !== '/app' && (signedIn || !p.needsWallet))

  return (
    <>
      <div className="circle-map" data-lit={lit ?? undefined}>
        <svg className="cm-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <rect className="cm-track" x="4" y="7" width="92" height="86" rx="40" ry="40" />
          <rect className="cm-track" x="17" y="22" width="66" height="56" rx="28" ry="28" />
          <rect className="cm-track" x="31" y="36" width="38" height="28" rx="14" ry="14" />
          {trades.map((p, i) => {
            const { x, y } = points[i]
            return (
              <path
                key={p.path}
                className="cm-path"
                data-on={lit === p.path || undefined}
                style={{ ['--tone' as string]: PAGE_HUE[p.path] }}
                d={`M ${x} ${y} Q ${x} 50 50 50`}
              />
            )
          })}
        </svg>
        <div className="cm-hub">
          <span className="cm-hub-ring" aria-hidden="true" />
          <strong>Your circle</strong>
          <span>Every trade nets out at the end of the epoch</span>
        </div>
        <ul className="cm-nodes" aria-label="Ways to trade">
          {trades.map((p, i) => {
            const n = counts[p.path]
            return (
              <li key={p.path} style={{ ['--x' as string]: `${points[i].x}%`, ['--y' as string]: `${points[i].y}%`, ['--tone' as string]: PAGE_HUE[p.path] }}>
                <Link
                  to={{ pathname: p.path, search }}
                  title={p.intro}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setLit(p.path)}
                  onPointerLeave={() => setLit(null)}
                  onFocus={() => setLit(p.path)}
                  onBlur={() => setLit(null)}
                >
                  <span className="cm-tile" aria-hidden="true"><NavIcon name={p.path} size={20} /></span>
                  <span className="cm-name">{p.title}</span>
                  {n !== undefined && n > 0 && <span className="cm-count">{n} yours</span>}
                  <span className="sr-only">{p.intro}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
      <ul className="cm-more" aria-label="More pages">
        {others.map((p) => (
          <li key={p.path} style={{ ['--tone' as string]: PAGE_HUE[p.path] ?? '#7a8798' }}>
            <Link to={{ pathname: p.path, search }} title={p.intro}>
              <span className="cm-chip-icon" aria-hidden="true"><NavIcon name={p.path} size={16} /></span>
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
