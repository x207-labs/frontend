import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMember, useMembers } from '../api/queries'
import { DepositBranch } from '../components/DepositBranch'
import { ExitPanel } from '../components/ExitPanel'
import { ErrorNotice, Loading, QueryState } from '../components/QueryState'
import { SignInPrompt } from '../components/SignInPrompt'
import { TxResult } from '../components/TxResult'
import { CIRCLE } from '../config'
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
        New to x207? <Link to="/help">Join the circle step by step</Link>, from the account to the first paid call.
      </p>
      {!account && <SignInPrompt action="join the circle" />}
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
          {/* FE-089: a registered member only adds stake, so the button names only what will be signed */}
          {signing
            ? 'Waiting for wallet…'
            : needsJoin
              ? source === 'near' ? 'Sign join and stake' : 'Sign withdraw, join, and stake'
              : source === 'near' ? 'Sign stake' : 'Sign withdraw and stake'}
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
  if (member.data === null) {
    return (
      <p className="state">
        Account {account} is not registered yet. <a href="#join">Fill in the join form</a> in step 3.
      </p>
    )
  }
  if (member.data === undefined && member.isError) return <ErrorNotice error={member.error} onRetry={() => member.refetch()} />
  const m = member.data
  const cell = (value: string | undefined) =>
    m ? (
      <>
        <strong>{formatCredit(value)}</strong> USDT
      </>
    ) : (
      <Loading label="Loading" />
    )
  // FE-089: the membership as four figures, a small label over each large number, no boxes.
  return (
    <dl className="onboard-sum" aria-label="Onboarding status">
      <div>
        <dt>Status</dt>
        <dd>{m ? <span className="pill" data-tone={MEMBER_TONE[m.status] ?? 'info'}>{m.status}</span> : <Loading label="Loading" />}</dd>
      </div>
      <div>
        <dt>Stake</dt>
        <dd>{cell(m?.stake)}</dd>
      </div>
      <div>
        <dt>Credit limit</dt>
        <dd>{cell(m?.limit)}</dd>
      </div>
      <div>
        <dt>Headroom</dt>
        <dd>{cell(m?.headroom)}</dd>
      </div>
    </dl>
  )
}

const MEMBER_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'info'> = { active: 'ok', pending: 'info', suspended: 'bad', exited: 'warn' }

export function Onboarding() {
  const members = useMembers()
  const { account } = useWallet()
  const memberQuery = useMember(account)
  const registered = Boolean(memberQuery.data)
  // FE-060: what the read API says about this account feeds the wizard (member_not_found = not a member yet; any other error = unknown, treated as loading).
  const memberState: MemberState = memberQuery.data
    ? { kind: 'member', member: memberQuery.data }
    : memberQuery.data === null
      ? { kind: 'none' }
      : { kind: 'loading' }
  // FE-089: on a wide screen the steps on the left and the membership beside them; on a phone the membership first, then the steps.
  // Leaving the circle is its own block under the steps, not part of the join step.
  return (
    <div className="onboard">
      <aside className="onboard-me" aria-labelledby="onboard-me">
        <h2 id="onboard-me">Your membership</h2>
        {account && <StatusPanel account={account} />}
        <QueryState query={members} loadingLabel="Loading members">
          {(data) => (
            <p className="onboard-circle">
              {data.items.length} members registered in circle {CIRCLE}.
            </p>
          )}
        </QueryState>
      </aside>
      <div className="onboard-main">
        <OnboardingSteps account={account} member={memberState}>
          <JoinForm registered={registered} />
        </OnboardingSteps>
        {memberQuery.data && (
          <div className="onboard-exit">
            <ExitPanel member={memberQuery.data} />
          </div>
        )}
      </div>
    </div>
  )
}
