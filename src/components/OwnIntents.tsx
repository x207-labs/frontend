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
    <section aria-label="My barter intents">
      <h2>My barter intents</h2>
      {!account ? (
        <p className="state">Sign in with a wallet to see your intents.</p>
      ) : (
        <QueryState query={posted} loadingLabel="Loading intents" isEmpty={(d) => d.items.length === 0} empty="No intent posted on the contract. Limit: 64 open intents per member.">
          {(data) => (
            <>
              <p className="state" role="status" data-testid="intent-count">
                {data.items.length} of {MAX_OPEN_INTENTS_PER_MEMBER} open intents on the contract. This limit is fixed: a new intent is rejected with{' '}
                <code className="plain">ERR_INTENT_LIMIT</code> until one is removed.
              </p>
              <ul className="intents">
                {data.items.map((item) => {
                  const text = described.get(item.intentHash)
                  return (
                    <li key={item.intentHash}>
                      <p>
                        {text ? (
                          <>
                            Offering {text.offer.calls} calls of <code className="plain">{text.offer.service}</code>, needing {text.need.calls} calls of{' '}
                            <code className="plain">{text.need.service}</code>.{' '}
                          </>
                        ) : (
                          'No record in the off-chain intent book. '
                        )}
                        Hash <code className="plain">{shortAccount(item.intentHash)}</code>
                      </p>
                      <button type="button" disabled={signing} onClick={() => void remove(item.intentHash)}>
                        {signing ? 'Waiting for wallet…' : 'Remove from contract'}
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
