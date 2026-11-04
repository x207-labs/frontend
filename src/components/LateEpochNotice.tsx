import { JOIN_GUIDE_URL } from '../config'
import { useEpochs } from '../api/queries'
import { lateEpoch } from '../lib/lateEpoch'

/** FE-040: shown only while the newest epoch is past the deadline of its phase. */
export function LateEpochNotice() {
  const { data } = useEpochs()
  const late = lateEpoch(data?.items ?? [], Date.now())
  if (!late) return null
  return (
    <p className="state" role="status">
      Epoch {late.epoch} is late. Epochs on this testnet circle are moved by a keeper the team runs until 2026-11-18; if one is late, anyone can move it.{' '}
      <a href={`${JOIN_GUIDE_URL}#move-the-epoch-yourself`}>How to move it</a>
    </p>
  )
}
