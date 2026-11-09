import { useState } from 'react'
import { JOIN_GUIDE_URL } from '../config'
import { useMember, useMembers } from '../api/queries'
import { DepositBranch } from '../components/DepositBranch'
import { ExitPanel } from '../components/ExitPanel'
import { ErrorNotice, Loading, QueryState } from '../components/QueryState'
import { TxResult } from '../components/TxResult'
import { CIRCLE } from '../config'
import { ApiError } from '../api/client'
import { toAtomic } from '../lib/amount'
import { formatCredit } from '../lib/format'
import { OnboardingSteps } from '../onboarding/OnboardingSteps'
import type { MemberState } from '../onboarding/steps'
import { useSignTransaction, useWallet } from '../wallet/WalletContext'
import { JOIN_STORAGE_DEPOSIT, formatNear } from '@x207/core'
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
    // One at a time: each transaction waits for the owner's signature (the wallet rejects a batch across receivers).
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
      <p className="state">
        New to x207? <a href={JOIN_GUIDE_URL} target="_blank" rel="noreferrer">Join the circle step by step</a>, from the account to the first paid call.
      </p>
      {!account && <p className="state">Sign in with a wallet to join the circle.</p>}
      {account && registered && <p className="state">Account {account} is already registered; just add stake.</p>}
      {needsJoin && (
        <>
          <label>
            <span>
              Voucher key (<code className="plain">pubkey_voucher</code>)
            </span>
            <input value={pubkey} onChange={(e) => setPubkey(e.target.value)} placeholder="ed25519:…" disabled={!account} />
            {pubkey && !pubkeyOk && <small className="state-error" role="alert">Must have the format ed25519: followed by base58.</small>}
          </label>
          <label>
            <span>
              Circle terms hash (<code className="plain">terms_hash</code>)
            </span>
            <input value={termsHash} onChange={(e) => setTermsHash(e.target.value)} disabled={!account} />
            {termsHash && !hashOk && <small className="state-error" role="alert">Must be 64 lowercase hexadecimal characters.</small>}
          </label>
          <label className="check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={!account} />
            <span>I agree to the circle terms with the hash above.</span>
          </label>
          {!agreed && account && <small className="state-error" data-hint>Agreement to the terms is required.</small>}
        </>
      )}
      <label>
        <span>Stake amount (USDT)</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" disabled={!account} />
        {amount && atomic === null && <small className="state-error" role="alert">Amount must be greater than 0.</small>}
      </label>
      <label>
        <span>USDT source</span>
        <select value={source} onChange={(e) => setSource(e.target.value as Source)} disabled={!account}>
          <option value="near">USDT in the NEAR account</option>
          <option value="intents">USDT in the Intents balance</option>
          <option value="other">Other asset via 1Click</option>
        </select>
      </label>
      {source === 'other' && account && atomic && (
        <DepositBranch purpose="stake" account={account} amount={atomic} onReady={setWithdrawReady} />
      )}
      {needsJoin && (
        <p className="state" role="note" data-testid="join-deposit">
          <code className="plain">join</code> attaches a deposit of <strong>{formatNear(JOIN_STORAGE_DEPOSIT)} NEAR</strong> from your NEAR account for member storage on the contract.
          The deposit is <strong>not refunded when you leave</strong> the circle (ADR-29): the member entry stays stored as history. Only the excess above
          this amount is refunded. Make sure the account has a NEAR balance of at least {formatNear(JOIN_STORAGE_DEPOSIT + 80_000_000_000_000_000_000_000n)} NEAR for the deposit and gas.
        </p>
      )}
      <div>
        <button type="submit" disabled={!canSend}>
          {signing ? 'Waiting for wallet…' : source === 'near' ? 'Sign join and stake' : 'Sign withdraw, join, and stake'}
        </button>
      </div>
      {step && <p className="state" role="status">Step: {step}</p>}
      <TxResult state={state} />
    </form>
  )
}

// FE-005: onboarding status from the read API; updated by QueryClient polling without a manual reload.
function StatusPanel({ account }: { account: string }) {
  const member = useMember(account)
  if (member.data === undefined) {
    if (member.error instanceof ApiError && member.error.code === 'member_not_found') {
      return (
        <p className="state">
          Account {account} is not registered yet. <a href="#join">Fill in the join form below</a>.
        </p>
      )
    }
    if (member.isError) return <ErrorNotice error={member.error} onRetry={() => member.refetch()} />
  }
  const m = member.data
  const cell = (value: string | undefined) => (m ? formatCredit(value) : <Loading label="Loading" />)
  return (
    <dl className="status-panel" aria-label="Onboarding status">
      <dt>Status</dt>
      <dd>{m ? <code>{m.status}</code> : <Loading label="Loading" />}</dd>
      <dt>Stake</dt>
      <dd>{cell(m?.stake)}</dd>
      <dt>Credit limit</dt>
      <dd>{cell(m?.limit)}</dd>
      <dt>Headroom</dt>
      <dd>{cell(m?.headroom)}</dd>
    </dl>
  )
}

export function Onboarding() {
  const members = useMembers()
  const { account } = useWallet()
  const memberQuery = useMember(account)
  const registered = Boolean(memberQuery.data)
  // FE-060: what the read API says about this account feeds the wizard (member_not_found = not a member yet; any other error = unknown, treated as loading).
  const memberState: MemberState = memberQuery.data
    ? { kind: 'member', member: memberQuery.data }
    : memberQuery.error instanceof ApiError && memberQuery.error.code === 'member_not_found'
      ? { kind: 'none' }
      : { kind: 'loading' }
  return (
    <>
      <QueryState query={members} loadingLabel="Loading members">
        {(data) => (
          <p>
            {data.items.length} members registered in circle {CIRCLE}.
          </p>
        )}
      </QueryState>
      <OnboardingSteps account={account} member={memberState}>
        {account && <StatusPanel account={account} />}
        {memberQuery.data && <ExitPanel member={memberQuery.data} />}
        <h4 id="join">Join and stake</h4>
        <JoinForm registered={registered} />
      </OnboardingSteps>
    </>
  )
}
