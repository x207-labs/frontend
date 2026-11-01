import { useState } from 'react'
import { useMembers } from '../api/queries'
import { QueryState } from '../components/QueryState'
import { TxResult } from '../components/TxResult'
import { CIRCLE } from '../config'
import { useSignTransaction, useWallet } from '../wallet/WalletContext'
import { joinTx } from '../wallet/transactions'

const PUBKEY = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,}$/
const TERMS_HASH = /^[0-9a-f]{64}$/

function JoinForm() {
  const { account } = useWallet()
  const { state, sign } = useSignTransaction()
  const [pubkey, setPubkey] = useState('')
  const [termsHash, setTermsHash] = useState('')
  const valid = PUBKEY.test(pubkey) && TERMS_HASH.test(termsHash)
  const signing = state.kind === 'signing'

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        void sign(joinTx(pubkey, termsHash))
      }}
    >
      {!account && <p className="state">Masuk dengan wallet untuk bergabung ke lingkaran.</p>}
      <label>
        <span>
          Kunci voucher (<code className="plain">pubkey_voucher</code>)
        </span>
        <input value={pubkey} onChange={(e) => setPubkey(e.target.value)} placeholder="ed25519:…" disabled={!account} />
      </label>
      <label>
        <span>
          Hash syarat lingkaran (<code className="plain">terms_hash</code>)
        </span>
        <input value={termsHash} onChange={(e) => setTermsHash(e.target.value)} disabled={!account} />
      </label>
      <div>
        <button type="submit" disabled={!account || !valid || signing}>
          Tanda tangani join
        </button>
      </div>
      <TxResult state={state} />
    </form>
  )
}

export function Onboarding() {
  const members = useMembers()
  return (
    <>
      <QueryState query={members} loadingLabel="Memuat anggota">
        {(data) => (
          <p>
            {data.items.length} anggota terdaftar di lingkaran {CIRCLE}.
          </p>
        )}
      </QueryState>
      <h2>Bergabung</h2>
      <JoinForm />
    </>
  )
}
