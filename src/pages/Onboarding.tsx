import { useState } from 'react'
import { useMember, useMembers } from '../api/queries'
import { DepositBranch } from '../components/DepositBranch'
import { ErrorNotice, Loading, QueryState } from '../components/QueryState'
import { TxResult } from '../components/TxResult'
import { CIRCLE } from '../config'
import { ApiError } from '../api/client'
import { toAtomic } from '../lib/amount'
import { formatCredit } from '../lib/format'
import { useSignTransaction, useWallet } from '../wallet/WalletContext'
import { ftWithdrawTx, joinTx, stakeTx } from '../wallet/transactions'
import type { FunctionCallTx } from '../wallet/types'

const PUBKEY = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,}$/
const TERMS_HASH = /^[0-9a-f]{64}$/
type Source = 'near' | 'intents' | 'other'

function JoinForm({ registered }: { registered: boolean }) {
  const { account } = useWallet()
  const { state, sign } = useSignTransaction()
  const [pubkey, setPubkey] = useState('')
  const [termsHash, setTermsHash] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [amount, setAmount] = useState('')
  const [source, setSource] = useState<Source>('near')
  const [withdrawReady, setWithdrawReady] = useState(false)
  const [step, setStep] = useState<string | null>(null)

  const atomic = toAtomic(amount)
  const pubkeyOk = PUBKEY.test(pubkey)
  const hashOk = TERMS_HASH.test(termsHash)
  const signing = state.kind === 'signing'
  const needsJoin = !registered
  const valid = (!needsJoin || (pubkeyOk && hashOk && agreed)) && atomic !== null
  const canSend = Boolean(account) && valid && !signing && (source !== 'other' || withdrawReady)

  async function run() {
    if (!atomic || !account) return
    const txs: Array<[string, FunctionCallTx]> = []
    if (source !== 'near') txs.push(['ft_withdraw', ftWithdrawTx(account, atomic)])
    if (needsJoin) txs.push(['join', joinTx(pubkey, termsHash)])
    txs.push(['stake', stakeTx(atomic)])
    // Satu per satu: tiap transaksi menunggu tanda tangan pemilik (wallet menolak batch lintas receiver).
    for (const [name, tx] of txs) {
      setStep(name)
      if (!(await sign(tx))) break
    }
    setStep(null)
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        void run()
      }}
    >
      {!account && <p className="state">Masuk dengan wallet untuk bergabung ke lingkaran.</p>}
      {account && registered && <p className="state">Akun {account} sudah terdaftar; tambah stake saja.</p>}
      {needsJoin && (
        <>
          <label>
            <span>
              Kunci voucher (<code className="plain">pubkey_voucher</code>)
            </span>
            <input value={pubkey} onChange={(e) => setPubkey(e.target.value)} placeholder="ed25519:…" disabled={!account} />
            {pubkey && !pubkeyOk && <small className="state-error">Harus berformat ed25519: diikuti base58.</small>}
          </label>
          <label>
            <span>
              Hash syarat lingkaran (<code className="plain">terms_hash</code>)
            </span>
            <input value={termsHash} onChange={(e) => setTermsHash(e.target.value)} disabled={!account} />
            {termsHash && !hashOk && <small className="state-error">Harus 64 karakter heksadesimal huruf kecil.</small>}
          </label>
          <label className="check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={!account} />
            <span>Saya menyetujui syarat lingkaran dengan hash di atas.</span>
          </label>
          {!agreed && account && <small className="state-error">Persetujuan syarat diperlukan.</small>}
        </>
      )}
      <label>
        <span>Jumlah stake (USDT)</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" disabled={!account} />
        {amount && atomic === null && <small className="state-error">Jumlah harus lebih dari 0.</small>}
      </label>
      <label>
        <span>Sumber USDT</span>
        <select value={source} onChange={(e) => setSource(e.target.value as Source)} disabled={!account}>
          <option value="near">USDT di akun NEAR</option>
          <option value="intents">USDT di saldo Intents</option>
          <option value="other">Aset lain lewat 1Click</option>
        </select>
      </label>
      {source === 'other' && account && atomic && (
        <DepositBranch purpose="stake" account={account} amount={atomic} onReady={setWithdrawReady} />
      )}
      <div>
        <button type="submit" disabled={!canSend}>
          {signing ? 'Menunggu wallet…' : source === 'near' ? 'Tanda tangani join dan stake' : 'Tanda tangani withdraw, join, dan stake'}
        </button>
      </div>
      {step && <p className="state" role="status">Langkah: {step}</p>}
      <TxResult state={state} />
    </form>
  )
}

// FE-005: status onboarding dari read API; diperbarui oleh polling QueryClient tanpa reload manual.
function StatusPanel({ account }: { account: string }) {
  const member = useMember(account)
  if (member.data === undefined) {
    if (member.error instanceof ApiError && member.error.code === 'member_not_found') {
      return (
        <p className="state">
          Akun {account} belum terdaftar. <a href="#bergabung">Isi form bergabung di bawah</a>.
        </p>
      )
    }
    if (member.isError) return <ErrorNotice error={member.error} onRetry={() => member.refetch()} />
  }
  const m = member.data
  const cell = (value: string | undefined) => (m ? formatCredit(value) : <Loading label="Memuat" />)
  return (
    <dl className="status-panel" aria-label="Status onboarding">
      <dt>Status</dt>
      <dd>{m ? <code>{m.status}</code> : <Loading label="Memuat" />}</dd>
      <dt>Stake</dt>
      <dd>{cell(m?.stake)}</dd>
      <dt>Limit kredit</dt>
      <dd>{cell(m?.limit)}</dd>
      <dt>Headroom</dt>
      <dd>{cell(m?.headroom)}</dd>
    </dl>
  )
}

export function Onboarding() {
  const members = useMembers()
  const { account } = useWallet()
  const registered = Boolean(useMember(account).data)
  return (
    <>
      <QueryState query={members} loadingLabel="Memuat anggota">
        {(data) => (
          <p>
            {data.items.length} anggota terdaftar di lingkaran {CIRCLE}.
          </p>
        )}
      </QueryState>
      {account && <StatusPanel account={account} />}
      <h2 id="bergabung">Bergabung</h2>
      <JoinForm registered={registered} />
    </>
  )
}
