import { useId, useMemo, useState, type ReactNode } from 'react'

export type Column<T> = {
  key: string
  label: string
  /** Present: the header is a button that sorts by this value. Absent: a plain header (for example the column of Open buttons). */
  sortValue?: (row: T) => string | number | bigint
  className?: string
}

type Sort = { key: string; dir: 'asc' | 'desc' }

const compare = (a: string | number | bigint, b: string | number | bigint): number =>
  typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b, 'en', { numeric: true }) : a < b ? -1 : a > b ? 1 : 0

// FE-057: a list table with a filter box and sortable headers. The page keeps its own row markup (renderRow) and its own server filters; this only narrows and orders the rows already read.
// A header click sorts ascending, a second click descending, a third clears the sort. The filter keeps rows that contain every word typed, in any column of `searchText`.
export function SortableTable<T>({ label, rows, columns, searchText, renderRow, filterLabel }: {
  label: string
  rows: T[]
  columns: Column<T>[]
  searchText: (row: T) => string
  renderRow: (row: T) => ReactNode
  filterLabel: string
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort | null>(null)
  const status = useId()

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const kept = words.length === 0 ? rows : rows.filter((r) => words.every((w) => searchText(r).toLowerCase().includes(w)))
    const col = sort && columns.find((c) => c.key === sort.key)?.sortValue
    if (!sort || !col) return kept
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...kept].sort((a, b) => sign * compare(col(a), col(b)))
  }, [rows, query, sort, columns, searchText])

  const toggle = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null))

  return (
    <>
      {rows.length > 1 && (
        <div className="table-tools">
          <label>
            <span>{filterLabel}</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type to narrow the rows" aria-describedby={status} />
          </label>
          <p className="state" id={status} role="status">
            {query ? `${shown.length} of ${rows.length} shown` : `${rows.length} rows`}
          </p>
        </div>
      )}
      {shown.length === 0 ? (
        <p className="state">
          No row matches “{query}”.
          <button type="button" className="quiet" onClick={() => setQuery('')}>
            Clear the filter
          </button>
        </p>
      ) : (
        <div className="table-wrap">
          <table aria-label={label}>
            <thead>
              <tr>
                {columns.map((c) => {
                  const active = sort?.key === c.key ? sort.dir : null
                  return (
                    <th key={c.key} scope="col" className={c.className} aria-sort={c.sortValue ? (active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none') : undefined}>
                      {c.sortValue ? (
                        <button type="button" className="th-sort" onClick={() => toggle(c.key)}>
                          {c.label}
                          <span aria-hidden="true">{active === 'asc' ? ' ▲' : active === 'desc' ? ' ▼' : ''}</span>
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>{shown.map(renderRow)}</tbody>
          </table>
        </div>
      )}
    </>
  )
}
