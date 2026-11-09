import { Link, useLocation } from 'react-router-dom'
import { pages, type PageGroup } from '../routes'
import { NavIcon } from './icons'

/** FE-069: one card per page, with its plain purpose line, so every part of the app is one click away from Home, Help and the not-found page. */
export function ExploreGrid({ groups, skip = [] }: { groups: readonly PageGroup[]; skip?: string[] }) {
  const { search } = useLocation()
  return (
    <ul className="explore">
      {pages
        .filter((p) => groups.includes(p.group) && !skip.includes(p.path))
        .map((p) => (
          <li key={p.path} data-group={p.group}>
            <Link to={{ pathname: p.path, search }}>
              <NavIcon name={p.path} size={20} />
              <strong>{p.title}</strong>
              <span>{p.intro}</span>
            </Link>
          </li>
        ))}
    </ul>
  )
}
