import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { useEpochs, useMember } from '../api/queries'
import type { EpochItem, SettlementItem } from '../api/types'
import { ExploreGrid } from '../components/ExploreGrid'
import { NavIcon } from '../components/icons'
import { LoopMotif } from '../components/LoopMotif'
import { ErrorNotice, Loading } from '../components/QueryState'
import { useProgress } from '../onboarding/progress'
import { computeSteps, type MemberState, type StepId } from '../onboarding/steps'
import { formatCredit, formatTime } from '../lib/format'
import { currentEpoch, homeActions, sumAmounts } from '../lib/home'
import { useWallet } from '../wallet/WalletContext'

function Stat({ label, value, unit, note, icon, tone }: { label: string; value: string; unit?: string; note?: string; icon?: string; tone?: string }) {
  return (
    <div className="stat" data-tone={tone}>
      <dt>
        {icon && (
          <span className="stat-icon">
            <NavIcon name={icon} size={18} />
          </span>
        )}
        {label}
      </dt>
      <dd>
        <strong>{value}</strong>
        {unit && <span> {unit}</span>}
      </dd>
      {note && <dd className="stat-note">{note}</dd>}
    </div>
  )
}

// FE-069: the four steps from a first visit to a first trade, shown on Home for everyone. The state of each step comes from computeSteps (the same
// logic as Join the circle), so Home and onboarding never disagree. Each step has one button that goes where the step is done.
const START: Record<StepId, { title: string; text: string; to: string; cta: string }> = {
  login: { title: 'Sign in', text: 'Use a NEAR wallet, or email or Google. Signing in only shows who you are.', to: '/onboarding', cta: 'Sign in' },
  funds: { title: 'Get free test funds', text: 'Test NEAR pays the network fees and test USDT is your stake. Free, one click.', to: '/onboarding', cta: 'Get test funds' },
  join: { title: 'Join the circle', text: 'Register and put down your stake. You get a credit limit to trade with.', to: '/onboarding', cta: 'Register and stake' },
  payment: { title: 'Make a first trade', text: 'Buy a service or a file from another member with a voucher. You pay only the net later.', to: '/marketplace', cta: 'Open the marketplace' },
}

function StartHere({ account, member }: { account: string | null; member: MemberState }) {
  const { search } = useLocation()
  const { busy, login } = useWallet()
  const { acknowledged } = useProgress(account)
  const steps = computeSteps({ account, member, acknowledged })
  const done = steps.filter((s) => s.status === 'done').length
  return (
    <section className="card span-all" aria-labelledby="home-start">
      <div className="card-head">
        <h2 id="home-start">Start here</h2>
        <p className="section-eyebrow">{done === steps.length ? 'All steps done' : `${done} of ${steps.length} steps done`}</p>
      </div>
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="steps">
        {steps.map((s) => {
          const step = START[s.id]
          return (
            <li key={s.id} className={`step${s.status === 'done' ? ' is-done' : s.status === 'current' ? ' is-next' : ''}`} aria-current={s.status === 'current' ? 'step' : undefined}>
              <h3>{step.title}</h3>
              <p>{s.status === 'done' ? s.note : step.text}</p>
              {s.status === 'done' ? (
                <span className="step-state">Done</span>
              ) : s.id === 'login' ? (
                <button type="button" onClick={login} disabled={busy}>{busy ? 'Opening wallet…' : 'Sign in with wallet'}</button>
              ) : (
                <Link className={s.status === 'current' ? 'btn' : 'btn quiet'} to={{ pathname: step.to, search }}>{step.cta}</Link>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function SignedOut() {
  const { search } = useLocation()
  const { busy, error, login } = useWallet()
  return (
    <div className="home-grid bento">
      <section className="welcome welcome-visual span-all" aria-label="Home: sign in">
        <LoopMotif className="welcome-motif" />
        <p className="eyebrow">Welcome to x207</p>
        <h2>Trade with other members now. Pay only the difference later.</h2>
        <p>Sign vouchers as you trade. Loops cancel. Each epoch you pay or claim one net amount.</p>
        {error && (
          <p className="wallet-error" role="alert">
            {error}
          </p>
        )}
        <p className="cta-row">
          <button type="button" onClick={login} disabled={busy}>
            {busy ? 'Opening wallet…' : 'Sign in with wallet'}
          </button>
          <Link className="btn quiet" to={{ pathname: '/help', search }}>How it works</Link>
          <span className="state">
            No wallet? <Link to={{ pathname: '/stats', search }}>Look at the clearing results</Link> first, no account needed.
          </span>
        </p>
      </section>
      <StartHere account={null} member={{ kind: 'loading' }} />
      <section className="card span-all" aria-labelledby="home-explore">
        <div className="card-head">
          <h2 id="home-explore">Explore without signing in</h2>
          <Link className="see-all" to={{ pathname: '/help', search }}>Help</Link>
        </div>
        <ExploreGrid groups={['Overview', 'Marketplace', 'Governance', 'Help']} skip={['/app']} />
      </section>
    </div>
  )
}

function greeting(now: Date): string {
  const h = now.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** Share of the credit limit already owed, 0 to 100 (whole percent). The amounts are integer strings in the smallest unit. */
function usedPercent(debt: string, limit: string): number {
  try {
    const l = BigInt(limit)
    if (l <= 0n) return 0
    const pct = Number((BigInt(debt) * 100n) / l)
    return Math.max(0, Math.min(100, pct))
  } catch {
    return 0
  }
}

function Position({ epoch, rows }: { epoch: EpochItem | null; rows: SettlementItem[] }) {
  if (epoch === null) return <Stat label="Position this epoch" value="not available" />
  const mine = rows.find((s) => s.epoch === epoch.epoch)
  if (!mine) return <Stat label={`Position in epoch ${epoch.epoch}`} value="none yet" note={`The epoch is ${epoch.phase.replace('_', ' ')}. A position appears once clearing has run.`} />
  return <Stat label={`Position in epoch ${epoch.epoch}`} value={formatCredit(mine.net)} unit="credit" note={`${mine.role === 'debtor' ? 'You owe' : 'You are owed'} ${formatCredit(mine.amount)} credit, status ${mine.status}.`} />
}

function Dashboard({ account }: { account: string }) {
  const { search } = useLocation()
  const member = useMember(account)
  const epochs = useEpochs()
  // the greeting is read once, when the page opens
  const [hello] = useState(() => greeting(new Date()))
  const settlements = useQuery({
    queryKey: ['member-settlements', account],
    queryFn: () => api.memberSettlements(account),
    retry: false,
  })

  // FE-069: the read API says member_not_found (status 404) for an account that has not joined; both are read, as on Join the circle.
  const notMember = member.error instanceof ApiError && (member.error.status === 404 || member.error.code === 'member_not_found')
  if (member.data === undefined && !notMember) {
    if (member.isError) return <ErrorNotice error={member.error} onRetry={() => member.refetch()} />
    return <Loading label="Loading your account" />
  }
  const rows = settlements.data?.items ?? []
  const current = currentEpoch(epochs.data?.items ?? [])
  const dues = rows.filter((s) => s.status === 'due')
  const next = dues.map((s) => s.due).filter((d): d is string => Boolean(d)).sort()[0] ?? current?.paymentDeadline ?? null
  const claimable = sumAmounts(rows.filter((s) => s.status === 'claimable'))
  const actions = homeActions(notMember ? null : (member.data ?? null), rows)
  const memberState: MemberState = member.data ? { kind: 'member', member: member.data } : { kind: 'none' }

  const used = member.data ? usedPercent(member.data.outstandingDebt, member.data.limit) : 0

  return (
    <div className="home-grid bento">
      {/* FE-069: a greeting line as in the reference dashboards, with the epoch it is about, so the page says whose it is and when at a glance */}
      <p className="greet span-all">
        {hello}, <strong>{account}</strong>
        {current && <span> · epoch {current.epoch}, {current.phase.replace('_', ' ')}</span>}
      </p>
      {notMember && <StartHere account={account} member={memberState} />}

      {member.data && (
        <section className="account-block" aria-labelledby="home-numbers">
          <div className="hero-card">
            <div className="card-head">
              <h2 id="home-numbers">Your account</h2>
              <Link className="see-all" to={{ pathname: '/settings', search }}>Settings</Link>
            </div>
            <p className="hero-label">Remaining limit</p>
            <p className="hero-figure">
              <strong>{formatCredit(member.data.headroom)}</strong> credit
            </p>
            <div className="progress" aria-hidden="true">
              <span style={{ width: `${used}%` }} />
            </div>
            <p className="hero-note">
              Debt outstanding: {formatCredit(member.data.outstandingDebt)} of {formatCredit(member.data.limit)} credit ({used}% used).
            </p>
            <p className="cta-row">
              <Link className="btn light" to={{ pathname: '/marketplace', search }}>Trade in the marketplace</Link>
              <Link className="btn ghost" to={{ pathname: '/settlement', search }}>Pay and claim</Link>
            </p>
          </div>
          <dl className="stats kpis">
            <Stat icon="/onboarding" tone="blue" label="Credit limit" value={formatCredit(member.data.limit)} unit="credit" />
            <Stat icon="/settlement" tone="green" label="Claimable balance" value={formatCredit(claimable)} unit="credit" note="Owed to you and not claimed yet." />
            <Stat icon="/access" tone="amber" label="Stake" value={formatCredit(member.data.stake)} unit="credit" />
          </dl>
        </section>
      )}

      <div className={member.data ? 'bento-side' : 'bento-side span-all'}>
        <section className="card" aria-labelledby="home-actions">
          <div className="card-head">
            <h2 id="home-actions">Actions to take</h2>
          </div>
          {settlements.isError && !notMember && <p className="state state-error" role="alert">Settlements could not be read, so this list may be incomplete.</p>}
          <ul className="actions">
            {actions.map((a) => (
              <li key={a.key} className={`action action-${a.tone}`}>
                <span>{a.text}</span>
                <Link to={{ pathname: a.to, search }}>{a.cta}</Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" aria-labelledby="home-epoch">
          <div className="card-head">
            <h2 id="home-epoch">This epoch</h2>
            <Link className="see-all" to={{ pathname: '/reports', search }}>Epoch report</Link>
          </div>
          <dl className="stats">
            <Position epoch={current} rows={rows} />
            <Stat label="Payment deadline" value={next ? formatTime(next) : 'none set'} note={next ? undefined : 'No payment is due right now.'} />
          </dl>
        </section>
      </div>

      {!notMember && <StartHere account={account} member={memberState} />}

      <section className="card span-all" aria-labelledby="home-explore">
        <div className="card-head">
          <h2 id="home-explore">Go somewhere</h2>
          <Link className="see-all" to={{ pathname: '/help', search }}>Help</Link>
        </div>
        <ExploreGrid groups={['Overview', 'My account', 'Marketplace', 'Governance', 'Help']} skip={['/app']} />
      </section>
    </div>
  )
}

// FE-056: the page a member lands on from the landing page. It reads only the existing read API; without a wallet it asks for a sign-in and makes no account call.
export function Home() {
  const { account } = useWallet()
  return account ? <Dashboard account={account} /> : <SignedOut />
}
