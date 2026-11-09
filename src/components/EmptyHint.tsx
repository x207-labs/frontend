import { Link } from 'react-router-dom'
import { JOIN_GUIDE_URL } from '../config'

// FE-035: a list that is empty on the shared testnet circle says why, and where to look instead. Nothing here is sample data: the clearing pages hold real epochs (epoch 8 is the
// realistic one), and the join guide shows how to put the first row in.
// FE-057: `next` adds the step that fills the list from this very page (a link to the form further down), so an empty list always points at something to do.
export function EmptyHint({ what, next }: { what: string; next?: { href: string; label: string } }) {
  return (
    <span>
      {' '}
      Nobody has posted {what} on the testnet circle yet. {next && <><a className="next-step" href={next.href}>{next.label}</a>, or look at </>}
      {!next && 'Real data is on the '}
      {next && 'real data on the '}
      <Link to="/stats?epoch=8">clearing stats of epoch 8</Link>; to add the first one,{' '}
      <a href={JOIN_GUIDE_URL} target="_blank" rel="noreferrer">
        join the circle
      </a>
      .
    </span>
  )
}
