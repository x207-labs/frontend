import { useEpochSelection } from '../epoch'
import { Loading, ErrorNotice } from './QueryState'

export function EpochPicker() {
  const { query, selected, select } = useEpochSelection()
  if (query.data === undefined) {
    return query.isError ? (
      <ErrorNotice error={query.error} onRetry={() => query.refetch()} />
    ) : (
      <Loading label="Loading epoch" />
    )
  }
  if (!selected) return <p className="state">No epoch in this circle yet.</p>
  return (
    <div className="picker">
      <label htmlFor="epoch-picker">Epoch</label>
      <select id="epoch-picker" value={selected.epoch} onChange={(e) => select(Number(e.target.value))}>
        {query.data.items.map(({ epoch }) => (
          <option key={epoch} value={epoch}>
            {epoch}
          </option>
        ))}
      </select>
    </div>
  )
}
