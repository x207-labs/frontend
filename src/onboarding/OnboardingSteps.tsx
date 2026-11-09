// FE-060: the four-step stepper of the Onboarding page. Every step stays open (a visitor with funds can skip ahead); the status badge and the
// "current" mark come from computeSteps, which reads the chain state through the read API, and from two saved answers.
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { JOIN_GUIDE_URL, NEAR_NETWORK } from '../config'
import './onboarding.css'
import { useProgress } from './progress'
import { computeSteps, type MemberState, type StepId, type StepStatus } from './steps'

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

function FundsBody({ account, onDone, done }: { account: string; onDone: () => void; done: boolean }) {
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
          An automatic faucet for mock USDT is being added; until then this command is the way.
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
            {s.id === 'funds' && account && <FundsBody account={account} done={done('funds')} onDone={() => mark('funds')} />}
            {s.id === 'join' && children}
            {s.id === 'payment' && account && <PaymentBody account={account} done={done('payment')} onDone={() => mark('payment')} />}
          </li>
        ))}
      </ol>
    </section>
  )
}
