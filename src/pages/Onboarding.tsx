import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useMembers } from '../api/queries'
import { DepositBranch } from '../components/DepositBranch'
import { QueryState } from '../components/QueryState'
import { TxResult } from '../components/TxResult'
import { CIRCLE } from '../config'
import { useSignTransaction, useWallet } from '../wallet/WalletContext'
import { ftWithdrawTx, joinTx, stakeTx } from '../wallet/transactions'
import type { FunctionCallTx } from '../wallet/types'

const PUBKEY = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,}$/
const TERMS_HASH = /^[0-9a-f]{64}$/
const DECIMALS = 6

type Source = 'near' | 'intents' | 'other'

/** "12.5" -> "12500000" (6 desimal); null bila bukan angka > 0. */
export function toAtomic(input: string): string | null {
  const match = input.trim().match(/^(\d+)(?:\.(\d{1,6}))?$/)
  if (!match) return null
  const atomic = BigInt(match[1] + (match[2] ?? '').padEnd(DECIMALS, '0'))
  return atomic > 0n ? atomic.toString() : null
}

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

function useRegistered(account: string | null): boolean {
  const query = useQuery({
    queryKey: ['member', account],
    queryFn: () => api.member(account!),
    enabled: account !== null,
    retry: false,
  })
  return Boolean(query.data)
}

export function Onboarding() {
  const members = useMembers()
  const { account } = useWallet()
  const registered = useRegistered(account)
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
      <JoinForm registered={registered} />
    </>
  )
}
