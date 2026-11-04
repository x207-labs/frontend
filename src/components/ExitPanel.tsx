import { useEpochs } from '../api/queries'
import type { MemberResponse } from '../api/types'
import { formatCredit } from '../lib/format'
import { useSignTransaction } from '../wallet/WalletContext'
import { requestExitTx, withdrawStakeTx } from '../wallet/transactions'
import { TxResult } from './TxResult'

// FE-018 (ADR-29, ADR-32): leave the circle and withdraw stake. The withdrawal conditions match the contract: the epoch in which exit was requested
// is `finalized` and the member's `outstanding_debt` is 0. The contract still decides; the panel only prevents transactions that would certainly be rejected.
export function ExitPanel({ member }: { member: MemberResponse }) {
  const epochs = useEpochs()
  const { state, sign } = useSignTransaction()
  const signing = state.kind === 'signing'
  const owes = BigInt(member.outstandingDebt) > 0n
  const requested = member.exitRequestedEpoch
  const phase = requested === null ? null : epochs.data?.items.find((e) => e.epoch === requested)?.phase ?? null
  const finalized = phase === 'finalized'

  if (member.status === 'exited') {
    return (
      <section aria-label="Leave the circle">
        <h2>Leave the circle</h2>
        <p className="state">This account has already left and the stake has been withdrawn. Claims from past epochs can still be collected on the settlement page.</p>
      </section>
    )
  }
  if (member.status === 'pending') return null

  return (
    <section aria-label="Leave the circle">
      <h2>Leave the circle</h2>
      {owes && (
        <p className="state state-error" role="alert">
          An obligation of {formatCredit(member.outstandingDebt)} credit remains (a <code className="plain">due</code> position or a current-epoch obligation).
          Settle it first: <code className="plain">withdraw_stake</code> is rejected with <code className="plain">ERR_HAS_DUE</code> while the obligation exists.
        </p>
      )}
      {requested === null ? (
        <>
          <p className="state">
            After requesting to leave, vouchers for the next epoch and additional stake are rejected. Vouchers for this epoch stay valid until the cutoff.
          </p>
          <button type="button" disabled={signing} onClick={() => void sign(requestExitTx())}>
            {signing ? 'Waiting for wallet…' : 'Request exit'}
          </button>
        </>
      ) : (
        <>
          <p className="state" role="status">
            Exit requested in epoch {requested}.{' '}
            {finalized ? 'That epoch is already finalized.' : `Waiting for epoch ${requested} to become finalized${phase ? ` (now ${phase})` : ''}.`}
          </p>
          <button type="button" disabled={signing || !finalized || owes} onClick={() => void sign(withdrawStakeTx())}>
            {signing ? 'Waiting for wallet…' : `Withdraw stake (${formatCredit(member.stake)})`}
          </button>
        </>
      )}
      <TxResult state={state} />
    </section>
  )
}
