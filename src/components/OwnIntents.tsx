import { useQueryClient } from '@tanstack/react-query'
import { MAX_OPEN_INTENTS_PER_MEMBER } from '@x207/core'
import { useChainIntents, useOwnIntents } from '../api/queries'
import { QueryState } from './QueryState'
import { TxResult } from './TxResult'
import { shortAccount } from '../lib/format'
import { useSignTransaction, useWallet } from '../wallet/WalletContext'
import { removeIntentTx } from '../wallet/transactions'

// Interface 0.0.8 (ADR-40): satu anggota menahan paling banyak 64 intent terbuka di kontrak, dan hanya `remove_intent` membebaskan slotnya.
// Daftar dari read API (intent yang dipasang akun ini); ada atau tidaknya di kontrak dibaca dari view `get_intent`, bukan dari event.
export function OwnIntents() {
  const { account } = useWallet()
  const intents = useOwnIntents(account)
  const { state, sign } = useSignTransaction()
  const client = useQueryClient()
  const signing = state.kind === 'signing'
  const posted = (intents.data?.items ?? []).filter((i) => i.onchain.posted)
  const onchain = useChainIntents(posted.map((i) => i.intentHashBase58))
  const open = posted.filter((_, i) => onchain[i]?.data)
  const unknown = onchain.some((q) => q.data === undefined)

  async function remove(hash: string) {
    if (await sign(removeIntentTx(hash))) {
      await client.invalidateQueries({ queryKey: ['chain', 'intent', hash] })
      await client.invalidateQueries({ queryKey: ['own-intents', account] })
    }
  }

  return (
    <section aria-label="Intent barter saya">
      <h2>Intent barter saya</h2>
      {!account ? (
        <p className="state">Masuk dengan wallet untuk melihat intent Anda.</p>
      ) : (
        <QueryState query={intents} loadingLabel="Memuat intent" isEmpty={(d) => d.items.length === 0} empty="Anda belum memasang intent.">
          {(data) => (
            <>
              <p className="state" role="status" data-testid="intent-count">
                {unknown ? 'Menghitung intent terbuka…' : `${open.length} dari ${MAX_OPEN_INTENTS_PER_MEMBER} intent terbuka di kontrak.`}{' '}
                Batas ini tetap: intent baru ditolak <code className="plain">ERR_INTENT_LIMIT</code> sampai satu dihapus.
              </p>
              <ul className="intents">
                {data.items.map((item) => {
                  const index = posted.findIndex((p) => p.intentHashBase58 === item.intentHashBase58)
                  const stillOnchain = index >= 0 && Boolean(onchain[index]?.data)
                  const checked = index >= 0 && onchain[index]?.data !== undefined
                  return (
                    <li key={item.intentHashBase58}>
                      <p>
                        Tawar {item.offer.calls} panggilan <code className="plain">{item.offer.service}</code>, butuh {item.need.calls} panggilan{' '}
                        <code className="plain">{item.need.service}</code> (status {item.status}). Hash <code className="plain">{shortAccount(item.intentHashBase58)}</code>
                      </p>
                      {index < 0 ? (
                        <p className="state">Belum dipasang di kontrak (<code className="plain">post_intent</code>), tidak ada slot yang terpakai.</p>
                      ) : !checked ? (
                        <p className="state">Memeriksa kontrak…</p>
                      ) : stillOnchain ? (
                        <button type="button" disabled={signing} onClick={() => void remove(item.intentHashBase58)}>
                          {signing ? 'Menunggu wallet…' : 'Hapus dari kontrak'}
                        </button>
                      ) : (
                        <p className="state">Sudah dihapus dari kontrak; slot bebas.</p>
                      )}
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
