import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api/client'
import { useEpochs, useInvoices, useMember, useMembers, useOrders, useParams } from '../api/queries'
import type { EpochItem, SettlementItem } from '../api/types'
import { CircleMap } from '../components/CircleMap'
import { EmptyHint } from '../components/EmptyHint'
import { LoopMotif } from '../components/LoopMotif'
import { PhaseStrip } from '../components/PhaseStrip'
import { ErrorNotice, Loading } from '../components/QueryState'
import { CONTRACT_ID, CIRCLE } from '../config'
import { Button, Kpi, Num, StatusBadge, type StatusCode } from '../ds/components'
import { formatCredit, formatTime } from '../lib/format'
import { currentEpoch, epochLengthText, epochOutcome, formatCredit2, homeActions, memberTotals, sumAmounts, type HomeAction } from '../lib/home'
import { useProgress } from '../onboarding/progress'
import { computeSteps, type MemberState, type StepId } from '../onboarding/steps'
import { useWallet } from '../wallet/WalletContext'
import { useCachedAccount } from '../account/cache'
import { displayAccount } from '../lib/account'
import { MONEY, NETWORK_NAME } from '../lib/network'
import { phaseWord, useVoucherScan, type VoucherScan } from './voucherScan'

type Ready = Extract<VoucherScan, { state: 'ready' }>

/** A link drawn as a design-system button. Only one glowing primary per screen; every other action is quiet. */
function LinkButton({ to, variant = 'quiet', children }: { to: { pathname: string; search?: string }; variant?: 'glow' | 'quiet'; children: ReactNode }) {
  return (
    <Link className="ds-btn" data-variant={variant} to={to}>
      {children}
    </Link>
  )
}

/** The same query string with the epoch set, so the circle in `?circle=` is kept when a row opens an epoch. */
function withEpoch(search: string, epoch: number): string {
  const params = new URLSearchParams(search)
  params.set('epoch', String(epoch))
  return `?${params.toString()}`
}

// FE-069: the four steps from a first visit to a first trade, shown on Home for everyone. The state of each step comes from computeSteps (the same
// logic as Join the circle), so Home and onboarding never disagree. Each step has one button that goes where the step is done.
const START: Record<StepId, { title: string; text: string; to: string; cta: string }> = {
  login: { title: 'Sign in', text: 'Use a NEAR wallet, or email or Google. Signing in only shows who you are.', to: '/onboarding', cta: 'Sign in' },
  funds: { title: 'Get free test funds', text: 'Test NEAR pays the network fees and test USDT is your stake. Free, one click.', to: '/onboarding', cta: 'Get test funds' },
  join: { title: 'Join the circle', text: 'Register and put down your stake. You get a credit limit to trade with.', to: '/onboarding', cta: 'Register and stake' },
  payment: { title: 'Make a first trade', text: 'Buy a service or a file from another member with a voucher. You pay only the net later.', to: '/marketplace', cta: 'Open the marketplace' },
}

// Quiet and low on the page: a hairline row of four numbered steps; the step to do now carries the lime mark.
function StartHere({ account, member }: { account: string | null; member: MemberState }) {
  const { search } = useLocation()
  const { busy, login } = useWallet()
  const { acknowledged } = useProgress(account)
  const steps = computeSteps({ account, member, acknowledged })
  const done = steps.filter((s) => s.status === 'done').length
  return (
    // FE-077: once every step is done the section folds into one row of ticked chips, so a finished checklist no longer takes a screen
    <section className={done === steps.length ? 'home-start is-done' : 'home-start'} aria-labelledby="home-start">
      <div className="sechead">
        <h2 id="home-start">Start here</h2>
        <p>{done === steps.length ? 'All steps done.' : `${done} of ${steps.length} steps done.`}</p>
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
                <Button type="button" onClick={login} disabled={busy}>{busy ? 'Opening wallet…' : 'Sign in with wallet'}</Button>
              ) : (
                <LinkButton to={{ pathname: step.to, search }}>{step.cta}</LinkButton>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// The public part of Home: the same for everyone. It leads with the latest epoch that carried vouchers (the sentence under the title is in HomeLead).

function Cta({ ready, search, signedIn, member, due }: { ready: Ready | null; search: string; signedIn: boolean; member: boolean; due: boolean }) {
  const latest = ready?.rows[0]
  // The sign-in in the top bar is the glowing primary while nobody is signed in; once someone is, the most urgent thing on this page takes it.
  const join = signedIn && !member
  const statement = latest ? (
    <LinkButton key="statement" variant={signedIn && member && !due ? 'glow' : 'quiet'} to={{ pathname: '/reports', search: withEpoch(search, latest.epoch) }}>
      Read the epoch {latest.epoch} statement
    </LinkButton>
  ) : (
    <LinkButton key="statement" variant={signedIn && member && !due ? 'glow' : 'quiet'} to={{ pathname: '/stats', search }}>
      See the clearing results
    </LinkButton>
  )
  return (
    <div className="home-cta">
      {join && <LinkButton variant="glow" to={{ pathname: '/onboarding', search }}>Join the circle</LinkButton>}
      {signedIn && member && due && <LinkButton variant="glow" to={{ pathname: '/settlement', search }}>Pay what is due</LinkButton>}
      {statement}
      {latest && <LinkButton to={{ pathname: '/stats', search: withEpoch(search, latest.epoch) }}>See how it cleared</LinkButton>}
      <LinkButton to={{ pathname: '/help', search }}>How it works</LinkButton>
    </div>
  )
}

function Facts({ ready }: { ready: Ready | null }) {
  const params = useParams()
  const live = ready?.live ?? null
  const liveItem = live ? ready?.items.find((e) => e.epoch === live.epoch) : undefined
  const cutoff = liveItem?.phase === 'open' ? liveItem.cutoffAt : null
  return (
    <dl className="home-facts" aria-label="This circle">
      <div>
        <dt>Contract</dt>
        <dd><Num>{CONTRACT_ID}</Num></dd>
      </div>
      <div>
        <dt>Network id</dt>
        <dd><Num>x207:{CIRCLE}</Num></dd>
      </div>
      <div>
        <dt>Epoch length</dt>
        <dd>{params.data ? epochLengthText(params.data.active.epoch_length) : params.isError ? 'not available' : '…'}</dd>
      </div>
      <div>
        <dt>Live epoch</dt>
        <dd>{live ? <><Num>{live.epoch}</Num>, {phaseWord(live.phase)}</> : ready ? 'none' : '…'}</dd>
      </div>
      {cutoff && (
        <div>
          <dt>Next cutoff</dt>
          <dd>{formatTime(cutoff)}</dd>
        </div>
      )}
    </dl>
  )
}

function Kpis({ ready }: { ready: Ready | null }) {
  const members = useMembers()
  const totals = members.data ? memberTotals(members.data.items) : null
  const latest = ready?.rows[0]
  return (
    <section className="home-kpis" aria-label="Circle in numbers">
      <Kpi
        badge="M"
        label="Members"
        value={totals ? totals.total : members.isError ? 'n/a' : '…'}
        note={totals ? `${totals.active} active, ${totals.suspended} suspended. ${formatCredit2(totals.staked)} credit staked.` : members.isError ? 'The member list could not be read.' : undefined}
      />
      {latest ? (
        <>
          <Kpi badge="V" label={`Vouchers, epoch ${latest.epoch}`} value={latest.vouchers.toLocaleString('en-US')} note={`Signed among ${latest.participants.toLocaleString('en-US')} members.`} />
          <Kpi
            badge="%"
            label="Cancelled in loops"
            value={latest.clearedRatio === null ? '-' : Math.round(latest.clearedRatio * 100)}
            unit={latest.clearedRatio === null ? undefined : '%'}
            note={latest.cancelled === null ? 'No clearing result yet.' : `${formatCredit2(latest.cancelled)} of ${formatCredit2(latest.owed)} credit.`}
          />
          <Kpi
            badge="$"
            label="Moved"
            value={latest.moved === null ? '-' : formatCredit2(latest.moved)}
            unit={latest.moved === null ? undefined : MONEY}
            note={latest.movedPercent === null ? 'Nothing has moved yet.' : `${latest.movedPercent.toLocaleString('en-US')}% of what was owed.`}
          />
        </>
      ) : (
        <Kpi badge="E" label="Epochs checked" value={ready ? ready.scanned : '…'} note={ready ? `None of them carried vouchers.${ready.live ? ` The live epoch is ${ready.live.epoch}.` : ''}` : undefined} />
      )}
    </section>
  )
}

const OUTCOME_TONE = { 200: 'ok', 402: 'todo', 409: 'bad' } as const

/** v6 (2026-11-12): the epochs as a timeline, after the Grok Bot app: the oldest first, the live one last. Each epoch is a time, one plain sentence and a card
 * with its result and the two things to read. */
function EpochTimeline({ scan }: { scan: VoucherScan }) {
  const { search } = useLocation()
  const ready = scan.state === 'ready' ? scan : null
  const rows = ready ? [...ready.rows].reverse() : []
  const live = ready?.live && !ready.rows.some((r) => r.epoch === ready.live!.epoch) ? ready.live : null
  return (
    <section className="home-epochs" aria-labelledby="home-epochs-h">
      <div className="sechead">
        <h2 id="home-epochs-h">Timeline</h2>
        {ready && <p>The epochs with vouchers among the newest {ready.scanned}. Amounts in credit; what moves is paid in {MONEY}.</p>}
      </div>
      {scan.state === 'loading' && <Loading label="Reading the newest epochs" />}
      {scan.state === 'error' && <ErrorNotice error={scan.error} onRetry={scan.retry} />}
      {ready && rows.length === 0 && (
        <p className="state">
          None of the newest {ready.scanned} epochs carried vouchers.
          <EmptyHint what="vouchers" />
        </p>
      )}
      {(rows.length > 0 || live) && (
        <ol className="tl" aria-label="Epochs with vouchers">
          {rows.map((v) => {
            const outcome = epochOutcome(v)
            return (
              <li key={v.epoch}>
                <p className="tl-time">Epoch {v.epoch} · {phaseWord(v.phase)}</p>
                <p className="tl-bubble">
                  {v.vouchers.toLocaleString('en-US')} {v.vouchers === 1 ? 'voucher' : 'vouchers'} among {v.participants.toLocaleString('en-US')} members, {formatCredit2(v.owed)} credit owed.{' '}
                  {v.cancelled === null || v.moved === null
                    ? 'Clearing has no result yet.'
                    : `Loops cancelled ${formatCredit2(v.cancelled)} (${Math.round((v.clearedRatio ?? 0) * 100)}%), so only ${formatCredit2(v.moved)} ${MONEY} ${v.phase === 'finalized' ? 'moved' : 'is due to move'}.`}
                </p>
                <div className="tl-card">
                  <div className="tl-card-head">
                    <h3>Settle epoch {v.epoch}</h3>
                    <span className="tl-pill" data-tone={outcome ? OUTCOME_TONE[outcome.code] : 'quiet'}>
                      <i aria-hidden="true" />
                      {outcome ? outcome.label : phaseWord(v.phase)}
                    </span>
                  </div>
                  <p className="tl-meta">
                    {formatCredit2(v.owed)} owed · {formatCredit2(v.cancelled)} cancelled · {formatCredit2(v.moved)} moved{v.movedPercent === null ? '' : ` (${v.movedPercent.toFixed(1)}%)`}
                  </p>
                  <p className="tl-actions">
                    <Link className="tl-btn" to={{ pathname: '/reports', search: withEpoch(search, v.epoch) }} aria-label={`Epoch ${v.epoch} statement`}>
                      Read the statement
                    </Link>
                    <Link className="tl-btn" data-variant="quiet" to={{ pathname: '/stats', search: withEpoch(search, v.epoch) }}>
                      How it cleared
                    </Link>
                  </p>
                </div>
              </li>
            )
          })}
          {live && (
            <li>
              <p className="tl-time">Now · epoch {live.epoch}</p>
              <p className="tl-bubble">
                Epoch {live.epoch} is {phaseWord(live.phase)}.{live.empty ? ' No vouchers yet.' : ''} Vouchers signed now are settled when it ends.
              </p>
            </li>
          )}
        </ol>
      )}
    </section>
  )
}

function Overview({ scan, signedIn, member, due, personal }: { scan: VoucherScan; signedIn: boolean; member: boolean; due: boolean; personal?: ReactNode }) {
  const { search } = useLocation()
  const ready = scan.state === 'ready' ? scan : null
  return (
    <>
      <Cta ready={ready} search={search} signedIn={signedIn} member={member} due={due} />
      {personal}
      <EpochTimeline scan={scan} />
      <Kpis ready={ready} />
      {/* v6: the technical facts of the circle (contract, epoch length) fold away; the timeline says what matters */}
      <details className="home-more">
        <summary>About this circle</summary>
        <Facts ready={ready} />
      </details>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// The signed-out Home: the public part, then the way in.

function SignedOut() {
  const { search } = useLocation()
  const { busy, error, login } = useWallet()
  const scan = useVoucherScan()
  return (
    <div className="home">
      <Overview scan={scan} signedIn={false} member={false} due={false} />
      <section className="ds-panel home-welcome" aria-label="Home: sign in">
        <div className="home-welcome-copy">
          <h2>Trade with other members now. Pay only the difference later.</h2>
          <p>Sign vouchers as you trade. Loops cancel. Each epoch you pay or claim one net amount, in {MONEY} on {NETWORK_NAME}.</p>
          {error && (
            <p className="wallet-error" role="alert">
              {error}
            </p>
          )}
          <p className="cta-row">
            <Button type="button" onClick={login} disabled={busy}>{busy ? 'Opening wallet…' : 'Sign in with wallet'}</Button>
            <LinkButton to={{ pathname: '/help', search }}>How it works</LinkButton>
          </p>
        </div>
        <LoopMotif />
      </section>
      <StartHere account={null} member={{ kind: 'loading' }} />
      <section className="ds-panel home-explore" aria-labelledby="home-explore">
        <header>
          <h2 id="home-explore">Explore without signing in</h2>
          <LinkButton to={{ pathname: '/help', search }}>Help</LinkButton>
        </header>
        <CircleMap signedIn={false} />
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// The signed-in Home: the same public part, with what is yours (actions, account, position in the live epoch) in between.

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

// FE-077: the deadline as time left, not only a date.
function untilText(iso: string, now: number): string {
  const ms = Date.parse(iso) - now
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'passed'
  const h = Math.floor(ms / 3_600_000)
  return h >= 48 ? `in ${Math.floor(h / 24)} days` : h >= 1 ? `in ${h} h` : `in ${Math.max(1, Math.floor(ms / 60_000))} min`
}

function Row({ label, children, note }: { label: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
      {note && <dd className="kv-note">{note}</dd>}
    </div>
  )
}

function Position({ epoch, rows }: { epoch: EpochItem | null; rows: SettlementItem[] }) {
  if (epoch === null) return <Row label="Position this epoch">not available</Row>
  const mine = rows.find((s) => s.epoch === epoch.epoch)
  if (!mine) return <Row label={`Position in epoch ${epoch.epoch}`} note={`The epoch is ${epoch.phase.replace('_', ' ')}. A position appears once clearing has run.`}>none yet</Row>
  return (
    <Row label={`Position in epoch ${epoch.epoch}`} note={`${mine.role === 'debtor' ? 'You owe' : 'You are owed'} ${formatCredit(mine.amount)} credit, status ${mine.status}.`}>
      <Num>{formatCredit(mine.net)}</Num> <span className="unit">credit</span>
    </Row>
  )
}

const ACTION_BADGE = (key: string): { code: StatusCode; label: string } | null =>
  key.startsWith('due-') ? { code: 402, label: 'Due' } : key.startsWith('default-') ? { code: 409, label: 'Defaulted' } : key.startsWith('claim-') ? { code: 202, label: 'Claimable' } : key === 'suspended' ? { code: 409, label: 'Suspended' } : null

function Actions({ actions, failed }: { actions: HomeAction[]; failed: boolean }) {
  const { search } = useLocation()
  return (
    <section className="ds-panel" aria-labelledby="home-actions">
      <header>
        <h2 id="home-actions">Actions to take</h2>
      </header>
      {failed && <p className="state state-error" role="alert">Settlements could not be read, so this list may be incomplete.</p>}
      <ul className="actions">
        {actions.map((a) => {
          const badge = ACTION_BADGE(a.key)
          return (
            <li key={a.key} className={`action action-${a.tone}`}>
              {badge && <StatusBadge code={badge.code} label={badge.label} />}
              <span>{a.text}</span>
              <Link to={{ pathname: a.to, search }}>{a.cta}</Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Dashboard({ account }: { account: string }) {
  const { search } = useLocation()
  const member = useMember(account)
  const epochs = useEpochs()
  const scan = useVoucherScan()
  // FE-082: the same queries (and cache) as the Invoices and Service orders pages, for the counts on the trade map
  const invoices = useInvoices({ party: account })
  const orders = useOrders({ party: account })
  // the greeting is read once, when the page opens
  const [hello] = useState(() => greeting(new Date()))
  const [now] = useState(() => Date.now())
  // FE-073: the name the person saved in Settings, else the short account, as the account menu shows it; a 64-hex implicit account in full ran off the line
  const cached = useCachedAccount(account)
  const name = cached.displayName || displayAccount(account)
  const settlements = useQuery({
    queryKey: ['member-settlements', account],
    queryFn: () => api.memberSettlements(account),
    retry: false,
  })

  // FE-069: the read API says member_not_found (status 404) for an account that has not joined; both are read, as on Join the circle.
  const notMember = member.data === null
  if (member.data === undefined) {
    if (member.isError) return <ErrorNotice error={member.error} onRetry={() => member.refetch()} />
    return <Loading label="Loading your account" />
  }
  const rows = settlements.data?.items ?? []
  const current = currentEpoch(epochs.data?.items ?? [])
  const dues = rows.filter((s) => s.status === 'due')
  const next = dues.map((s) => s.due).filter((d): d is string => Boolean(d)).sort()[0] ?? current?.paymentDeadline ?? null
  const claimable = sumAmounts(rows.filter((s) => s.status === 'claimable'))
  const actions = homeActions(member.data, rows)
  const memberState: MemberState = member.data ? { kind: 'member', member: member.data } : { kind: 'none' }
  const used = member.data ? usedPercent(member.data.outstandingDebt, member.data.limit) : 0

  // What is yours comes right after the buttons, ahead of the facts of the circle: a payment that is due must not sit below the fold.
  const personal = (
    <>
      {/* FE-069: a greeting line, so the page says whose it is at a glance */}
      <div className="home-personal">
        <p className="greet">
          {hello}, <strong title={account}>{name}</strong>
        </p>
        {/* FE-073: for an account outside the circle the only action was "Join the circle", the join step the top button and Start here already show, so the panel is left out */}
        {!notMember && <Actions actions={actions} failed={settlements.isError} />}

        {member.data && (
          <section className="ds-panel" aria-labelledby="home-numbers">
            <header>
              <h2 id="home-numbers">Your account</h2>
              <Link className="see-all" to={{ pathname: '/settings', search }}>Settings</Link>
            </header>
            <dl className="kv">
              <Row label="Remaining limit"><Num>{formatCredit(member.data.headroom)}</Num> <span className="unit">credit</span></Row>
              <Row label="Credit limit"><Num>{formatCredit(member.data.limit)}</Num> <span className="unit">credit</span></Row>
              <Row label="Debt outstanding" note={`${used}% used of the limit.`}><Num>{formatCredit(member.data.outstandingDebt)}</Num> <span className="unit">credit</span></Row>
              <Row label="Stake"><Num>{formatCredit(member.data.stake)}</Num> <span className="unit">credit</span></Row>
              <Row label="Claimable balance" note="Owed to you and not claimed yet."><Num>{formatCredit(claimable)}</Num> <span className="unit">credit</span></Row>
            </dl>
            <div className="meter" role="img" aria-label={`${used}% of the credit limit used`}>
              <span style={{ width: `${used}%` }} />
            </div>
            <p className="panel-actions">
              <LinkButton to={{ pathname: '/settlement', search }}>Pay and claim</LinkButton>
              <LinkButton to={{ pathname: '/marketplace', search }}>Trade in the marketplace</LinkButton>
            </p>
          </section>
        )}

        <section className="ds-panel" aria-labelledby="home-epoch">
          <header>
            <h2 id="home-epoch">This epoch</h2>
            <Link className="see-all" to={{ pathname: '/reports', search }}>Epoch report</Link>
          </header>
          {current && <PhaseStrip phase={current.phase} />}
          <dl className="kv">
            <Position epoch={current} rows={rows} />
            <Row label="Payment deadline" note={next ? formatTime(next) : 'No payment is due right now.'}>
              {next ? <strong>{untilText(next, now)}</strong> : <strong>none set</strong>}
            </Row>
          </dl>
        </section>
      </div>
    </>
  )

  return (
    <div className="home">
      <Overview scan={scan} signedIn member={!notMember} due={dues.length > 0} personal={personal} />

      <StartHere account={account} member={memberState} />

      <section className="ds-panel home-explore" aria-labelledby="home-explore">
        <header>
          <h2 id="home-explore">Where to trade</h2>
          <Link className="see-all" to={{ pathname: '/help', search }}>Help</Link>
        </header>
        <CircleMap signedIn counts={{ '/invoices': invoices.data?.items.length, '/orders': orders.data?.items.length }} />
      </section>
    </div>
  )
}

// FE-056: the page a member lands on from the landing page. It reads only the existing read API; without a wallet it asks for a sign-in and makes no account call.
export function Home() {
  const { account } = useWallet()
  return account ? <Dashboard account={account} /> : <SignedOut />
}
