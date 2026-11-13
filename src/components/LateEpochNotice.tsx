import { Link, useLocation } from 'react-router-dom'
import { useEpochs } from '../api/queries'
import { lateEpoch } from '../lib/lateEpoch'

/** FE-040: shown only while the newest epoch is past the deadline of its phase. FE-072: "How to move it" opens the app's own Help, not GitHub. */
export function LateEpochNotice() {
  const { data } = useEpochs()
  const { search } = useLocation()
  const late = lateEpoch(data?.items ?? [], Date.now())
  if (!late) return null
  return (
    <p className="state" role="status">
      Epoch {late.epoch} is late. Epochs on this testnet circle are moved by a keeper the team runs until 2026-11-30; if one is late, anyone can move it.{' '}
      <Link to={{ pathname: '/help', search, hash: '#term-move-epoch' }}>How to move it</Link>
    </p>
  )
}
