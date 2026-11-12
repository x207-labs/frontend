import { useMembers } from '../api/queries'
import { CIRCLE, CONTRACT_ID, NEAR_NETWORK } from '../config'
import { Mascot } from '../components/Mascot'
import { formatCredit } from '../lib/format'
import { MONEY } from '../lib/network'
import { phaseWord, useVoucherScan } from './voucherScan'

/** Above the title of Home: the circle, the epoch the page is about (the latest one with vouchers) and its phase, in mono. */
export function HomeEyebrow() {
  const scan = useVoucherScan()
  const latest = scan.state === 'ready' ? scan.rows[0] : undefined
  const live = latest ? latest.phase !== 'finalized' : scan.state === 'ready' && scan.live !== null && scan.live.phase !== 'finalized'
  return (
    <p className="page-eyebrow" data-live={live || undefined}>
      {/* v6.3: the logo of the circle (the mascot of its contract, as in the circle picker), with the live dot on it */}
      <span className="eyebrow-logo" aria-hidden="true">
        <Mascot id={CONTRACT_ID} size={22} mood="smile" />
        <i />
      </span>
      {latest
        ? `${CIRCLE} · epoch ${latest.epoch} · ${phaseWord(latest.phase)}`
        : scan.state === 'ready' && scan.live
          ? `${CIRCLE} · epoch ${scan.live.epoch} · ${phaseWord(scan.live.phase)}`
          : `${CIRCLE} · ${scan.state === 'error' ? 'epochs not available' : 'reading epochs'}`}
    </p>
  )
}

/** The sentence under the title of Home: the real numbers of the latest epoch that carried vouchers, with their units. */
export function HomeStatement() {
  const scan = useVoucherScan()
  const members = useMembers().data?.items.length
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
    // v6.3 (KISS): one short line, not a count of empty epochs
    return (
      <>
        <p className="home-statement">{members ? `${members} ${members === 1 ? 'member' : 'members'}, no trades yet.` : 'No trades yet.'}</p>
        <p className="home-sub">The first voucher signed in this circle shows up here.</p>
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
