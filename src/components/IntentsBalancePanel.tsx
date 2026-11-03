import { useQueryClient } from '@tanstack/react-query'
import { useIntentWithdrawals, useIntentsBalance } from '../api/queries'
import { QueryState } from './QueryState'
import { TxResult } from './TxResult'
import { formatCredit } from '../lib/format'
import { useSignTransaction, useWallet } from '../wallet/WalletContext'
import { withdrawIntentsBalanceTx } from '../wallet/transactions'

// Interface 0.0.9 (BE-034, spec 18): USDT yang masuk lewat `mt_on_transfer` tetap berupa saldo multi-token kontrak di Intents. `claim` ke
// akun NEAR membayar dengan `ft_transfer` dari saldo NEP-141 kontrak, jadi klaim bisa gagal sampai saldo ini ditarik. Siapa pun boleh menarik.
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
    <section aria-label="Saldo Intents yang belum ditarik">
      <h3>Saldo Intents yang belum ditarik</h3>
      <QueryState query={balance} loadingLabel="Memuat saldo Intents">
        {(raw) => {
          const waiting = BigInt(raw) > 0n
          return (
            <>
              <p className="state" role="status">
                Saldo kontrak di Intents: <strong>{formatCredit(raw)}</strong> USDT
                {waiting ? ' menunggu ditarik ke akun NEP-141 kontrak.' : '. Tidak ada yang menunggu.'}
              </p>
              <p className="state">
                Residual yang dibayar lewat NEAR Intents (<code className="plain">mt_on_transfer</code>) masuk sebagai saldo multi-token di Intents. Klaim ke
                akun NEAR dibayar dengan <code className="plain">ft_transfer</code> dari saldo USDT kontrak, jadi klaim bisa gagal sampai saldo ini
                ditarik. Klaim yang gagal tidak hilang: ulangi setelah penarikan. Siapa pun boleh menekan tombol ini; transaksinya memakai 150 Tgas
                prepaid dan tanpa deposit.
              </p>
              <button type="button" disabled={!account || !waiting || signing} onClick={() => void withdraw()}>
                {signing ? 'Menunggu wallet…' : 'Tarik saldo Intents ke kontrak'}
              </button>
              {!account && <p className="state">Masuk dengan wallet untuk menandatangani.</p>}
              <TxResult state={state} />
            </>
          )
        }}
      </QueryState>
      {history.data && history.data.withdrawals > 0 && (
        <p className="state" data-testid="withdrawal-history">
          Sudah ditarik {history.data.withdrawals} kali, total <strong>{formatCredit(history.data.totalWithdrawn)}</strong> USDT. Terakhir{' '}
          {formatCredit(history.data.items[0]?.amount)} USDT di blok {history.data.items[0]?.changedBlock}.
        </p>
      )}
    </section>
  )
}
