import { Link, useLocation } from 'react-router-dom'
import { pages, type PageGroup } from '../routes'
import { NavIcon } from './icons'

/**
 * FE-069: one tile per page, so every part of the app is one click away from Home, Help and the not-found page.
 * FE-072: an app-grid of icon tiles grouped by section, title only; the purpose line is read by screen readers and shown on hover.
 */
export function ExploreGrid({ groups, skip = [] }: { groups: readonly PageGroup[]; skip?: string[] }) {
  const { search } = useLocation()
  return (
    <div className="explore">
      {groups.map((g) => {
        const list = pages.filter((p) => p.group === g && !skip.includes(p.path))
        if (list.length === 0) return null
        return (
          <section key={g} className="explore-group" aria-label={g}>
            <p className="explore-label">{g}</p>
            <ul>
              {list.map((p) => (
                <li key={p.path} data-group={p.group}>
                  <Link to={{ pathname: p.path, search }} title={p.intro}>
                    <span className="explore-icon">
                      <NavIcon name={p.path} size={24} />
                    </span>
                    <strong>{p.title}</strong>
                    <span className="sr-only">{p.intro}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
