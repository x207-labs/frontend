import { Link, useLocation } from 'react-router-dom'
import { useEpochSelection } from '../epoch'
import { ErrorNotice, Loading } from './QueryState'

/** FE-069: what a page that reads one epoch shows while no epoch is chosen, instead of a blank page: loading, the error, or why there is nothing yet. */
export function NoEpoch() {
  const { search } = useLocation()
  const { query, resolving } = useEpochSelection()
  if (query.isError) return <ErrorNotice error={query.error} onRetry={() => query.refetch()} />
  if (query.data === undefined || resolving) return <Loading label="Choosing an epoch" />
  return (
    <section className="card" aria-label="No epoch yet">
      <div className="card-head">
        <h2>No epoch to show yet</h2>
      </div>
      <p className="state">This circle has not finished an epoch, so there is nothing to read here yet. The page fills in once the first epoch clears.</p>
      <p className="cta-row">
        <Link className="btn" to={{ pathname: '/app', search }}>Go to Home</Link>
        <Link className="btn quiet" to={{ pathname: '/help', search }}>What is an epoch?</Link>
      </p>
    </section>
  )
}
