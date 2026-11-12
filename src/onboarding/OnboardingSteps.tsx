// FE-060: the four-step stepper of the Onboarding page. Every step stays open (a visitor with funds can skip ahead); the status badge and the
// "current" mark come from computeSteps, which reads the chain state through the read API, and from two saved answers.
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { onboardingPayload } from '../account/onboardingSync'
import { describeAccountFailure, useAccountActions, useSigning } from '../account/useAccount'
import { NEAR_NETWORK, NETWORK_TOKENS } from '../config'
import { Button } from '../ds/components'
import './onboarding.css'
import { FaucetPanel } from './FaucetPanel'
import { useProgress } from './progress'
import { STEP_IDS, computeSteps, type Acknowledged, type MemberState, type StepId, type StepStatus } from './steps'

export const FAUCET_URL = 'https://near-faucet.io/'
/** The USDT of the testnet deployments is a mock token anyone can `mint` (Deployment Testnet note); the real USDT is not on testnet. */
// FE-110: one source with the transaction builders (`NETWORK_TOKENS` in config.ts).
export const MOCK_USDT_ID = NETWORK_TOKENS.testnet.usdt

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
        <Button type="button" variant="glow" onClick={onDone}>
          I have the funds
        </Button>
      )}
    </>
  )
}

function PaymentBody({ account, onDone, done }: { account: string; onDone: () => void; done: boolean }) {
  return (
    <>
      <p>
        With stake in the circle your agent can pay and be paid on credit. Pick a listing in the <Link to="/marketplace">marketplace</Link>, or follow the{' '}
        <Link to="/help#term-agents">guide</Link> to make a paid call from {account}. The payment shows up in your credit panel and in the next 207 report.
      </p>
      {!done && (
        <Button type="button" variant="glow" onClick={onDone}>
          I made a payment
        </Button>
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
  // FE-089: only the current step is open. A done step folds to one line with a check, a later step shows its name; any step opens on a click
  // (someone who already has funds can go straight to joining). `toggled` holds only what the person changed, so when the current step moves on,
  // the new current step opens and the finished one folds by itself.
  const [toggled, setToggled] = useState<Partial<Record<StepId, boolean>>>({})
  // The "Fill in the join form" link of the membership summary points at #join: open that step when the address asks for it.
  useEffect(() => {
    const onHash = () => {
      const id = window.location.hash.slice(1) as StepId
      if ((STEP_IDS as readonly string[]).includes(id)) setToggled((t) => ({ ...t, [id]: true }))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const done = (id: StepId) => steps.find((s) => s.id === id)?.status === 'done'
  const finished = steps.every((s) => s.status === 'done')
  const at = steps.findIndex((s) => s.status === 'current')
  const doneCount = steps.filter((s) => s.status === 'done').length
  return (
    <section className="onboarding" aria-label="Onboarding steps">
      <div className="onboarding-progress">
        {finished ? (
          <p className="onboarding-ready" role="status">All four steps are done. Your account is ready.</p>
        ) : (
          <p>{at >= 0 ? `Step ${at + 1} of ${steps.length}` : `${doneCount} of ${steps.length} done`}</p>
        )}
        <span className="onboarding-bar" aria-hidden="true">
          {steps.map((s) => (
            <span key={s.id} data-status={s.status} />
          ))}
        </span>
      </div>
      <ol className="onboarding-steps">
        {steps.map((s, i) => {
          const open = toggled[s.id] ?? s.status === 'current'
          return (
            <li
              key={s.id}
              id={s.id}
              className="onboarding-step"
              data-status={s.status}
              aria-current={s.status === 'current' ? 'step' : undefined}
              data-testid={`step-${s.id}`}
            >
              <details open={open}>
                <summary
                  onClick={(e) => {
                    e.preventDefault()
                    setToggled((t) => ({ ...t, [s.id]: !open }))
                  }}
                >
                  <span className="step-mark" aria-hidden="true">
                    {s.status === 'done' ? (
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="step-text">
                    <h3>{TITLES[s.id]}</h3>
                    <span className="step-note">{s.note}</span>
                  </span>
                  {/* the check and the faded name already say done or later; the words stay for screen readers */}
                  <span className={s.status === 'current' ? 'step-badge' : 'sr-only'}>{BADGE[s.status]}</span>
                  <svg className="step-chevron" aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <div className="step-body">
                  {s.id === 'login' && <p className="step-copy">Your account is the one in the menu at the top right. Every step below works on it.</p>}
                  {s.id === 'funds' && account && <FundsBody account={account} done={done('funds')} onDone={() => mark('funds')} onConfirm={() => void markAndSave('funds')} />}
                  {s.id === 'join' && children}
                  {s.id === 'payment' && account && <PaymentBody account={account} done={done('payment')} onDone={() => void markAndSave('payment')} />}
                </div>
              </details>
            </li>
          )
        })}
      </ol>
      {saved && <p className="state" role="status" data-testid="onboarding-saved">{saved}</p>}
    </section>
  )
}
