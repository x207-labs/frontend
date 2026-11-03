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
      <section aria-label="Pangkas epoch">
        <h3>Pangkas epoch</h3>
        <p className="state">Epoch {epoch} belum <code className="plain">finalized</code>; <code className="plain">prune_epoch</code> menolaknya (<code className="plain">ERR_NOT_FINALIZED</code>).</p>
      </section>
    )
  }
  return (
    <section aria-label="Pangkas epoch">
      <h3>Pangkas epoch</h3>
      <p className="state" role="status" data-testid="prune-status">
        {pairsLeft === null
          ? 'Memeriksa pasangan epoch…'
          : pairsLeft
            ? `Epoch ${epoch} belum dipangkas: pasangan kewajiban masih tersimpan di kontrak.`
            : `Pasangan kewajiban epoch ${epoch} sudah dihapus dari kontrak. Panggil lagi sampai transaksi mengembalikan 0 untuk total peserta dan bundle.`}
      </p>
      <p className="state">
        Satu panggilan menghapus paling banyak {PRUNE_MAX_ITEMS_PER_CALL} entri (sekitar 70 Tgas untuk 196 entri; tombol memakai 100 Tgas). Posisi settlement,
        klaim, dan laporan 207 tidak berubah.
      </p>
      <button type="button" disabled={!account || signing} onClick={() => void prune()}>
        {signing ? 'Menunggu wallet…' : `Pangkas epoch ${epoch}`}
      </button>
      {!account && <p className="state">Masuk dengan wallet untuk menandatangani.</p>}
      <TxResult state={state} />
    </section>
  )
}
