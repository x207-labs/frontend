import { useQueryClient } from '@tanstack/react-query'
import { PRUNE_MAX_ITEMS_PER_CALL } from '@x207/core'
import { useEpochPairsLeft, useEpochs } from '../api/queries'
import { TxResult } from './TxResult'
import { useSignTransaction, useWallet } from '../wallet/WalletContext'
import { pruneEpochTx } from '../wallet/transactions'

// Interface 0.0.8 (ADR-31 c): `prune_epoch` mengembalikan storage epoch `finalized` (pasangan, indeks edge, total peserta, bundle). Posisi D5, record
// epoch, dan proposal kliring tetap, jadi `claim` dan laporan 207 tidak berubah. Siapa pun boleh memanggil; tombol ini untuk keeper atau siapa saja.
export function PrunePanel({ epoch }: { epoch: number }) {
  const epochs = useEpochs()
  const finalized = epochs.data?.items.find((e) => e.epoch === epoch)?.phase === 'finalized'
  const left = useEpochPairsLeft(epoch, finalized)
  const { account } = useWallet()
  const { state, sign } = useSignTransaction()
  const client = useQueryClient()
  const signing = state.kind === 'signing'
  const pairsLeft = left.data === undefined ? null : left.data.length > 0

  async function prune() {
    if (await sign(pruneEpochTx(epoch))) await client.invalidateQueries({ queryKey: ['chain', 'pairs-left', epoch] })
  }

  if (!finalized) {
    return (
      <section aria-label="Prune epoch">
        <h3>Prune epoch</h3>
        <p className="state">Epoch {epoch} is not <code className="plain">finalized</code> yet; <code className="plain">prune_epoch</code> rejects it (<code className="plain">ERR_NOT_FINALIZED</code>).</p>
      </section>
    )
  }
  return (
    <section aria-label="Prune epoch">
      <h3>Prune epoch</h3>
      <p className="state" role="status" data-testid="prune-status">
        {pairsLeft === null
          ? 'Checking epoch pairs…'
          : pairsLeft
            ? `Epoch ${epoch} is not pruned yet: obligation pairs are still stored on the contract.`
            : `Obligation pairs of epoch ${epoch} have been removed from the contract. Call again until the transaction returns 0 for the participant total and bundle.`}
      </p>
      <p className="state">
        One call removes at most {PRUNE_MAX_ITEMS_PER_CALL} entries (about 70 Tgas for 196 entries; the button uses 100 Tgas). Settlement positions,
        claims, and the 207 report are unchanged.
      </p>
      <button type="button" disabled={!account || signing} onClick={() => void prune()}>
        {signing ? 'Waiting for wallet…' : `Prune epoch ${epoch}`}
      </button>
      {!account && <p className="state">Sign in with a wallet to sign.</p>}
      <TxResult state={state} />
    </section>
  )
}
