import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ApiError } from '../api/client'
import { describeMarketError } from '../lib/marketError'

export function Loading({ label = 'Memuat data' }: { label?: string }) {
  return (
    <p className="state" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}…
    </p>
  )
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = error instanceof ApiError ? error.code : 'network_error'
  // BE-066: the answers about limits are said in words (with the seconds to wait for a 429), the others show the message of the server
  const limit = error instanceof ApiError && ['rate_limited', 'payload_too_large', 'open_limit_reached'].includes(error.code)
  const message = limit
    ? describeMarketError(error)
    : error instanceof Error && error.message !== 'Failed to fetch'
      ? error.message
      : 'Read API tidak bisa dihubungi.'
  return (
    <div className="state state-error" role="alert">
      <p>
        <code>{code}</code> {message}
      </p>
      <button type="button" onClick={onRetry}>
        Coba lagi
      </button>
    </div>
  )
}

type Props<T> = {
  query: UseQueryResult<T>
  loadingLabel?: string
  isEmpty?: (data: T) => boolean
  empty?: ReactNode
  children: (data: T) => ReactNode
}

// Empat status halaman data: loading, error API, kosong, dan data.
export function QueryState<T>({ query, loadingLabel, isEmpty, empty, children }: Props<T>) {
  if (query.data === undefined) {
    if (query.isError) return <ErrorNotice error={query.error} onRetry={() => query.refetch()} />
    return <Loading label={loadingLabel} />
  }
  if (isEmpty?.(query.data)) return <p className="state">{empty}</p>
  return <>{children(query.data)}</>
}
