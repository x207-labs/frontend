import { CIRCLE, NEAR_NETWORK } from '../config'
import { formatCredit } from '../lib/format'
import { MONEY } from '../lib/network'
import { phaseWord, useVoucherScan } from './voucherScan'

/** Above the title of Home: the circle, the epoch the page is about (the latest one with vouchers) and its phase, in mono. */
export function HomeEyebrow() {
  const scan = useVoucherScan()
  const latest = scan.state === 'ready' ? scan.rows[0] : undefined
  const live = latest !== undefined && latest.phase !== 'finalized'
  return (
    <p className="page-eyebrow" data-live={live || undefined}>
      {latest
        ? `${CIRCLE} · epoch ${latest.epoch} · ${phaseWord(latest.phase)}`
        : `${CIRCLE} · ${scan.state === 'ready' ? 'no epoch with vouchers' : scan.state === 'error' ? 'epochs not available' : 'reading epochs'}`}
    </p>
  )
}

/** The sentence under the title of Home: the real numbers of the latest epoch that carried vouchers, with their units. */
export function HomeStatement() {
  const scan = useVoucherScan()
  if (scan.state === 'loading') return <p className="home-statement is-quiet" role="status">Reading the newest epochs…</p>
  if (scan.state === 'error') {
    return (
      <div className="home-statement-error state state-error" role="alert">
        <p>The newest epochs could not be read from the read API, so there is no figure to lead with yet.</p>
        <button type="button" className="quiet" onClick={scan.retry}>Try again</button>
      </div>
    )
  }
  const latest = scan.rows[0]
  if (!latest) {
    return (
      <>
        <p className="home-statement">
          None of the newest <b>{scan.scanned}</b> epochs carried vouchers.
        </p>
        <p className="home-sub">
          {scan.live ? `Epoch ${scan.live.epoch} is ${phaseWord(scan.live.phase)}. ` : ''}
          Epochs without vouchers are left out of this page.
        </p>
      </>
    )
  }
  const owed = <b>{formatCredit(latest.owed)}</b>
  const moved = latest.moved === null ? null : <b>{formatCredit(latest.moved)}</b>
  return (
    <>
      <p className="home-statement">
        {moved === null ? (
          <>
            In epoch <b>{latest.epoch}</b>, {owed} credit is owed. Clearing has no result yet, so nothing has moved.
          </>
        ) : latest.phase === 'finalized' ? (
          <>
            In epoch <b>{latest.epoch}</b>, {owed} credit was owed and {moved} {MONEY} moved.
          </>
        ) : (
          <>
            In epoch <b>{latest.epoch}</b>, {owed} credit is owed and {moved} {MONEY} is due to move.
          </>
        )}
      </p>
      <p className="home-sub">
        {latest.vouchers.toLocaleString('en-US')} {latest.vouchers === 1 ? 'voucher' : 'vouchers'} among {latest.participants.toLocaleString('en-US')} {latest.participants === 1 ? 'member' : 'members'}.
        {scan.live && scan.live.epoch !== latest.epoch && scan.live.empty ? ` Epoch ${scan.live.epoch} is ${phaseWord(scan.live.phase)} and has no vouchers yet.` : ''}
        {NEAR_NETWORK === 'mainnet' ? '' : ' Credit is settled in mock USDT on NEAR testnet; no real funds move.'}
      </p>
    </>
  )
}
