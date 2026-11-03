import { useQueryClient } from '@tanstack/react-query'
import { MAX_OPEN_INTENTS_PER_MEMBER } from '@x207/core'
import { useOwnIntents, usePostedIntents } from '../api/queries'
import { QueryState } from './QueryState'
import { TxResult } from './TxResult'
import { shortAccount } from '../lib/format'
import { useSignTransaction, useWallet } from '../wallet/WalletContext'
import { removeIntentTx } from '../wallet/transactions'

// Interface 0.0.8 (ADR-40): satu anggota menahan paling banyak 64 intent terbuka di kontrak, dan hanya `remove_intent` membebaskan slotnya.
// Yang terpasang di kontrak dibaca dari read API (`/intents/hashes?status=posted`, event `intent_posted` dikurangi `intent_removed`); teks tawaran dan
// kebutuhan dari buku intent off-chain, bila ada.
export function OwnIntents() {
  const { account } = useWallet()
  const posted = usePostedIntents(account)
  const book = useOwnIntents(account)
  const { state, sign } = useSignTransaction()
  const client = useQueryClient()
  const signing = state.kind === 'signing'
  const described = new Map((book.data?.items ?? []).map((i) => [i.intentHashBase58, i]))

  async function remove(hash: string) {
    if (await sign(removeIntentTx(hash))) await client.invalidateQueries({ queryKey: ['posted-intents', account] })
  }

  return (
    <section aria-label="Intent barter saya">
      <h2>Intent barter saya</h2>
      {!account ? (
        <p className="state">Masuk dengan wallet untuk melihat intent Anda.</p>
      ) : (
        <QueryState query={posted} loadingLabel="Memuat intent" isEmpty={(d) => d.items.length === 0} empty="Tidak ada intent terpasang di kontrak. Batas: 64 intent terbuka per anggota.">
          {(data) => (
            <>
              <p className="state" role="status" data-testid="intent-count">
                {data.items.length} dari {MAX_OPEN_INTENTS_PER_MEMBER} intent terbuka di kontrak. Batas ini tetap: intent baru ditolak{' '}
                <code className="plain">ERR_INTENT_LIMIT</code> sampai satu dihapus.
              </p>
              <ul className="intents">
                {data.items.map((item) => {
                  const text = described.get(item.intentHash)
                  return (
                    <li key={item.intentHash}>
                      <p>
                        {text ? (
                          <>
                            Tawar {text.offer.calls} panggilan <code className="plain">{text.offer.service}</code>, butuh {text.need.calls} panggilan{' '}
                            <code className="plain">{text.need.service}</code>.{' '}
                          </>
                        ) : (
                          'Tanpa catatan di buku intent off-chain. '
                        )}
                        Hash <code className="plain">{shortAccount(item.intentHash)}</code>
                      </p>
                      <button type="button" disabled={signing} onClick={() => void remove(item.intentHash)}>
                        {signing ? 'Menunggu wallet…' : 'Hapus dari kontrak'}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <TxResult state={state} />
            </>
          )}
        </QueryState>
      )}
    </section>
  )
}
