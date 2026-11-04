import { useQueryClient } from '@tanstack/react-query'
import { useIntentWithdrawals, useIntentsBalance } from '../api/queries'
import { QueryState } from './QueryState'
import { TxResult } from './TxResult'
import { formatCredit } from '../lib/format'
import { useSignTransaction, useWallet } from '../wallet/WalletContext'
import { withdrawIntentsBalanceTx } from '../wallet/transactions'

// Interface 0.0.9 (BE-034, spec 18): USDT arriving via `mt_on_transfer` stays a multi-token balance of the contract in Intents. `claim` to a
// NEAR account pays with `ft_transfer` from the contract's NEP-141 balance, so a claim can fail until this balance is withdrawn. Anyone may withdraw.
export function IntentsBalancePanel() {
  const balance = useIntentsBalance()
  const history = useIntentWithdrawals()
  const { account } = useWallet()
  const { state, sign } = useSignTransaction()
  const client = useQueryClient()
  const signing = state.kind === 'signing'

  async function withdraw() {
    if (await sign(withdrawIntentsBalanceTx())) {
      await client.invalidateQueries({ queryKey: ['chain', 'intents_balance'] })
      await client.invalidateQueries({ queryKey: ['intent-withdrawals'] })
    }
  }

  return (
    <section aria-label="Unwithdrawn Intents balance">
      <h3>Unwithdrawn Intents balance</h3>
      <QueryState query={balance} loadingLabel="Loading Intents balance">
        {(raw) => {
          const waiting = BigInt(raw) > 0n
          return (
            <>
              <p className="state" role="status">
                Contract balance on Intents: <strong>{formatCredit(raw)}</strong> USDT
                {waiting ? ' waiting to be withdrawn to the contract NEP-141 account.' : '. Nothing is waiting.'}
              </p>
              <p className="state">
                Residuals paid through NEAR Intents (<code className="plain">mt_on_transfer</code>) arrive as a multi-token balance on Intents. Claims to a
                NEAR account are paid with <code className="plain">ft_transfer</code> from the contract USDT balance, so a claim can fail until this balance
                is withdrawn. A failed claim is not lost: retry after the withdrawal. Anyone may press this button; the transaction uses 150 Tgas
                prepaid and no deposit.
              </p>
              <button type="button" disabled={!account || !waiting || signing} onClick={() => void withdraw()}>
                {signing ? 'Waiting for wallet…' : 'Withdraw Intents balance to the contract'}
              </button>
              {!account && <p className="state">Sign in with a wallet to sign.</p>}
              <TxResult state={state} />
            </>
          )
        }}
      </QueryState>
      {history.data && history.data.withdrawals > 0 && (
        <p className="state" data-testid="withdrawal-history">
          Withdrawn {history.data.withdrawals} times, total <strong>{formatCredit(history.data.totalWithdrawn)}</strong> USDT. Latest{' '}
          {formatCredit(history.data.items[0]?.amount)} USDT at block {history.data.items[0]?.changedBlock}.
        </p>
      )}
    </section>
  )
}
