// FE-060: the four-step stepper of the Onboarding page. Every step stays open (a visitor with funds can skip ahead); the status badge and the
// "current" mark come from computeSteps, which reads the chain state through the read API, and from two saved answers.
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { onboardingPayload } from '../account/onboardingSync'
import { describeAccountFailure, useAccountActions, useSigning } from '../account/useAccount'
import { JOIN_GUIDE_URL, NEAR_NETWORK } from '../config'
import './onboarding.css'
import { FaucetPanel } from './FaucetPanel'
import { useProgress } from './progress'
import { computeSteps, type Acknowledged, type MemberState, type StepId, type StepStatus } from './steps'

export const FAUCET_URL = 'https://near-faucet.io/'
/** The USDT of the testnet deployments is a mock token anyone can `mint` (Deployment Testnet note); the real USDT is not on testnet. */
export const MOCK_USDT_ID = 'usdt.x207-deployer.testnet'

const TITLES: Record<StepId, string> = {
  login: 'Sign in',
  funds: 'Get test funds',
  join: 'Join the circle and stake',
  payment: 'Make your first payment',
}
const BADGE: Record<StepStatus, string> = { done: 'Done', current: 'Current step', upcoming: 'Up next' }

// FE-064: the faucet of the backend when it is on; otherwise (404, disabled, unreachable) the manual steps.
// onDone: the faucet delivered (kept on this device, no signature asked). onConfirm: the person says they have funds (also saved to the account, FE-068).
function FundsBody({ account, onDone, onConfirm, done }: { account: string; onDone: () => void; onConfirm: () => void; done: boolean }) {
  return <FaucetPanel account={account} onFunded={onDone} fallback={<ManualFunds account={account} onDone={onConfirm} done={done} />} />
}

function ManualFunds({ account, onDone, done }: { account: string; onDone: () => void; done: boolean }) {
  const mint = `near call ${MOCK_USDT_ID} mint '{"account_id":"${account}","amount":"100000000"}' --accountId ${account} --networkId testnet`
  return (
    <>
      {NEAR_NETWORK !== 'testnet' && <p className="state">This build points at {NEAR_NETWORK}. The faucet and the mock USDT below exist on testnet only.</p>}
      <ol className="steps-sub">
        <li>
          Get test NEAR (gas and the join deposit) from the{' '}
          <a href={FAUCET_URL} target="_blank" rel="noreferrer">testnet faucet</a>. Paste {account}.
        </li>
        <li>
          Get mock USDT. The testnet circle uses the mock token <code className="plain">{MOCK_USDT_ID}</code>, which lets anyone mint. 100 USDT with the NEAR CLI:
          <pre className="cmd"><code>{mint}</code></pre>
          This is the manual way, used when the automatic faucet is not available.
        </li>
      </ol>
      {!done && (
        <button type="button" onClick={onDone}>
          I have the funds
        </button>
      )}
    </>
  )
}

function PaymentBody({ account, onDone, done }: { account: string; onDone: () => void; done: boolean }) {
  return (
    <>
      <p>
        With stake in the circle your agent can pay and be paid on credit. Pick a listing in the <Link to="/marketplace">marketplace</Link>, or follow the{' '}
        <a href={JOIN_GUIDE_URL} target="_blank" rel="noreferrer">guide</a> to make a paid call from {account}. The payment shows up in your credit panel and in the next 207 report.
      </p>
      {!done && (
        <button type="button" onClick={onDone}>
          I made a payment
        </button>
      )}
    </>
  )
}

export function OnboardingSteps({ account, member, children }: { account: string | null; member: MemberState; children: ReactNode }) {
  const { acknowledged, mark } = useProgress(account)
  const steps = computeSteps({ account, member, acknowledged })
  const { call } = useAccountActions()
  const signing = useSigning()
  const [saved, setSaved] = useState<string | null>(null)
  // FE-068: the two answers that the person gives are also saved to the account (one signature each); the local copy above is the cache and stays if the signature is declined.
  async function markAndSave(key: keyof Acknowledged) {
    mark(key)
    if (!account || signing === 'no') return
    try {
      await call('upsert_onboarding', onboardingPayload({ ...acknowledged, [key]: true }, member))
      setSaved('Progress saved to your account.')
    } catch (e) {
      setSaved(`Progress is saved on this device only. ${describeAccountFailure(e)}`)
    }
  }
  const done = (id: StepId) => steps.find((s) => s.id === id)?.status === 'done'
  const finished = steps.every((s) => s.status === 'done')
  return (
    <section aria-label="Onboarding steps">
      {finished && <p className="state" role="status">All four steps are done. Your account is ready.</p>}
      <ol className="onboarding-steps">
        {steps.map((s, i) => (
          <li key={s.id} className="onboarding-step" data-status={s.status} aria-current={s.status === 'current' ? 'step' : undefined} data-testid={`step-${s.id}`}>
            <h3>
              <span className="step-number" aria-hidden="true">{i + 1}</span>
              {TITLES[s.id]}
              <span className="step-badge">{BADGE[s.status]}</span>
            </h3>
            <p className="state">{s.note}</p>
            {s.id === 'funds' && account && <FundsBody account={account} done={done('funds')} onDone={() => mark('funds')} onConfirm={() => void markAndSave('funds')} />}
            {s.id === 'join' && children}
            {s.id === 'payment' && account && <PaymentBody account={account} done={done('payment')} onDone={() => void markAndSave('payment')} />}
          </li>
        ))}
      </ol>
      {saved && <p className="state" role="status" data-testid="onboarding-saved">{saved}</p>}
    </section>
  )
}
