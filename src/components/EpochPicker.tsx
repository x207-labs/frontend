import { useEpochSelection } from '../epoch'
import { Loading, ErrorNotice } from './QueryState'

export function EpochPicker() {
  const { query, items, selected, select, resolving } = useEpochSelection()
  if (query.data === undefined) {
    return query.isError ? (
      <ErrorNotice error={query.error} onRetry={() => query.refetch()} />
    ) : (
      <Loading label="Loading epoch" />
    )
  }
  if (resolving) return <Loading label="Loading epoch" />
  if (!selected) return <p className="state">No epoch in this circle yet.</p>
  return (
    <div className="picker">
      <label htmlFor="epoch-picker">Epoch</label>
      <select id="epoch-picker" value={selected.epoch} onChange={(e) => select(Number(e.target.value))}>
        {/* FE-118: the selected epoch is listed even when it is older than the first page of the list */}
        {items.map(({ epoch }) => (
          <option key={epoch} value={epoch}>
            {epoch}
          </option>
        ))}
      </select>
    </div>
  )
}
