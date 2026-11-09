import { pages, type PageRoute } from '../routes'

const text = (p: PageRoute) => `${p.title} ${p.group} ${p.path.slice(1)}`.toLowerCase()

/** FE-057: the pages that match every word typed; titles that start with the first word come first. Empty query: all pages in sidebar order. */
export function matchPages(query: string, list: PageRoute[] = pages): PageRoute[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const hits = list.filter((p) => words.every((w) => text(p).includes(w)))
  if (words.length === 0) return hits
  const first = words[0]
  const rank = (p: PageRoute) => (p.title.toLowerCase().startsWith(first) ? 0 : p.title.toLowerCase().includes(first) ? 1 : 2)
  return [...hits].sort((a, b) => rank(a) - rank(b))
}
