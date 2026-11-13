import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api/client'
import { useMember, useMembers, useParams } from '../api/queries'
import { NavIcon } from '../components/icons'
import { Mascot } from '../components/Mascot'
import { MascotCrowd } from '../components/MascotCrowd'
import { EmptyHint } from '../components/EmptyHint'
import { LoopMotif } from '../components/LoopMotif'
import { ErrorNotice, Loading } from '../components/QueryState'
import { CONTRACT_ID, CIRCLE } from '../config'
import { Button, Kpi, Num } from '../ds/components'
import { formatCredit, formatTime } from '../lib/format'
import { epochLengthText, epochOutcome, formatCredit2, homeActions, memberTotals, sumAmounts, type HomeAction } from '../lib/home'
import { useProgress } from '../onboarding/progress'
import { computeSteps, type MemberState, type StepId } from '../onboarding/steps'
import { useWallet } from '../wallet/WalletContext'
import { useCachedAccount } from '../account/cache'
import { displayAccount } from '../lib/account'
import { MONEY, NETWORK_NAME } from '../lib/network'
import { HomeEyebrow, HomeStatement } from './HomeLead'
import { phaseWord, useVoucherScan, type VoucherScan } from './voucherScan'

type Ready = Extract<VoucherScan, { state: 'ready' }>

/** A link drawn as a design-system button. Only one glowing primary per screen; every other action is quiet. */
function LinkButton({ to, variant = 'quiet', icon, children }: { to: { pathname: string; search?: string }; variant?: 'glow' | 'quiet'; icon?: string; children: ReactNode }) {
  return (
    <Link className="ds-btn" data-variant={variant} to={to}>
      {icon && <NavIcon name={icon} size={17} />}
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
    <LinkButton key="statement" icon="/reports" variant={signedIn && member && !due ? 'glow' : 'quiet'} to={{ pathname: '/reports', search: withEpoch(search, latest.epoch) }}>
      Read the epoch {latest.epoch} statement
    </LinkButton>
  ) : (
    <LinkButton key="statement" icon="/stats" variant={signedIn && member && !due ? 'glow' : 'quiet'} to={{ pathname: '/stats', search }}>
      See the clearing results
    </LinkButton>
  )
  return (
    <div className="home-cta">
      {join && <LinkButton variant="glow" icon="/onboarding" to={{ pathname: '/onboarding', search }}>Join the circle</LinkButton>}
      {signedIn && member && due && <LinkButton variant="glow" icon="/settlement" to={{ pathname: '/settlement', search }}>Pay what is due</LinkButton>}
      {statement}
      {!latest && <LinkButton icon="/help" to={{ pathname: '/help', search }}>How it works</LinkButton>}
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
        icon={<NavIcon name="account" size={18} />}
        label="Members"
        value={totals ? totals.total : members.isError ? 'n/a' : '…'}
        note={totals ? `${totals.active} active · ${formatCredit2(totals.staked)} credit staked` : members.isError ? 'The member list could not be read.' : undefined}
      />
      {latest ? (
        <>
          <Kpi badge="V" icon={<NavIcon name="/reports" size={18} />} label={`Vouchers, epoch ${latest.epoch}`} value={latest.vouchers.toLocaleString('en-US')} note={`Signed among ${latest.participants.toLocaleString('en-US')} members.`} />
        </>
      ) : (
        null
      )}
    </section>
  )
}

/** The split of what was owed in an epoch: cancelled in loops, netted between pairs, moved as cash. Amounts in the smallest unit. */
function split(v: { owed: string; cancelled: string | null; moved: string | null }) {
  try {
    const owed = BigInt(v.owed)
    if (owed <= 0n || v.cancelled === null || v.moved === null) return null
    const cancelled = BigInt(v.cancelled)
    const moved = BigInt(v.moved)
    const netted = owed - cancelled - moved > 0n ? owed - cancelled - moved : 0n
    const pct = (x: bigint) => Number((x * 1000n) / owed) / 10
    return [
      { key: 'loops', label: 'Cancelled in loops', raw: cancelled.toString(), pct: pct(cancelled) },
      { key: 'pairs', label: 'Netted between pairs', raw: netted.toString(), pct: pct(netted) },
      { key: 'moved', label: `Moved as ${MONEY}`, raw: moved.toString(), pct: pct(moved) },
    ]
  } catch {
    return null
  }
}

/** v6.3 (2026-11-12), after the balance card of an iOS finance app: the epoch as a chip, what was owed as one large figure, one sentence, the actions as
 * pills with icons, and the split of that figure as one bar with a legend. */
function HomeHero({ scan, cta }: { scan: VoucherScan; cta: ReactNode }) {
  const latest = scan.state === 'ready' ? scan.rows[0] : undefined
  const figure = latest ? formatCredit2(latest.owed) : null
  const [whole, cents] = figure ? figure.split('.') : ['', '']
  const parts = latest ? split(latest) : null
  return (
    <section className="home-hero" aria-label="Latest epoch">
      <div className="hero-main">
        <HomeEyebrow />
        {latest && (
          <>
            <p className="hero-label">Owed between members</p>
            <p className="hero-figure">
              {whole}
              <span className="hero-cents">.{cents}</span>
              <small>credit</small>
            </p>
          </>
        )}
        <HomeStatement />
        {cta}
      </div>
      {!parts && scan.state !== 'loading' && <MascotCrowd />}
      {parts && (
        <div className="hero-split">
          <p className="hero-label">Where it went</p>
          <div className="split-bar" role="img" aria-label={parts.map((p) => `${p.label} ${p.pct}%`).join(', ')}>
            {parts.map((p) => (
              <i key={p.key} data-part={p.key} style={{ flexGrow: Math.max(p.pct, 0.5) }} />
            ))}
          </div>
          <ul className="split-legend">
            {parts.map((p) => (
              <li key={p.key} data-part={p.key}>
                <i aria-hidden="true" />
                <span>{p.label}</span>
                <b>{formatCredit2(p.raw)}</b>
                <small>{p.pct}%</small>
              </li>
            ))}
          </ul>
        </div>
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
  // v6.3 (KISS): with no epoch to show, the balance card already says "No trades yet", so the timeline stays out
  if (ready && rows.length === 0) return null
  return (
    <section className="home-epochs" aria-labelledby="home-epochs-h">
      <div className="sechead">
        <h2 id="home-epochs-h">Timeline</h2>
        {ready && (
          <p>
            Every epoch with trades, oldest first.
            {ready.older !== null ? ` The newest ${ready.scanned} epochs were checked, and epoch ${ready.older}, the latest with clearing.` : ''}
          </p>
        )}
      </div>
      {scan.state === 'loading' && <Loading label="Reading the newest epochs" />}
      {scan.state === 'error' && <ErrorNotice error={scan.error} onRetry={scan.retry} />}
      {ready && rows.length === 0 && (
        <p className="state">
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
                  {v.cancelled === null || v.moved === null
                    ? `${formatCredit2(v.owed)} credit owed. Not cleared yet.`
                    : `${formatCredit2(v.owed)} credit owed, only ${formatCredit2(v.moved)} ${MONEY} ${v.phase === 'finalized' ? 'moved' : 'to move'}.`}
                </p>
                <div className="tl-card">
                  <div className="tl-card-head">
                    <h3>Settle epoch {v.epoch}</h3>
                    <span className="tl-pill" data-tone={outcome ? OUTCOME_TONE[outcome.code] : 'quiet'}>
                      <i aria-hidden="true" />
                      {outcome ? outcome.label : phaseWord(v.phase)}
                    </span>
                  </div>
                  <p className="tl-actions">
                    <Link className="tl-btn" to={{ pathname: '/reports', search: withEpoch(search, v.epoch) }} aria-label={`Read the statement of epoch ${v.epoch}`}>
                      Read the statement
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
      <HomeHero scan={scan} cta={<Cta ready={ready} search={search} signedIn={signedIn} member={member} due={due} />} />
      {personal}
      {/* the epochs on the left, the circle in numbers beside them (one column on a phone) */}
      {/* with no trade yet the balance card says all there is; an empty timeline or a lone tile would only leave a hole */}
      {(scan.state !== 'ready' || scan.rows.length > 0) && (
        <div className="home-split">
          <EpochTimeline scan={scan} />
          <Kpis ready={ready} />
        </div>
      )}
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
  const { error } = useWallet()
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
          {/* v6.4: the sign-in lives in the top bar and in Start here; one more here only made three of the same button */}
          <p className="cta-row">
            <LinkButton icon="/help" to={{ pathname: '/help', search }}>How it works</LinkButton>
          </p>
        </div>
        <LoopMotif />
      </section>
      <StartHere account={null} member={{ kind: 'loading' }} />
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

function Row({ label, children, note }: { label: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
      {note && <dd className="kv-note">{note}</dd>}
    </div>
  )
}

const ACTION_BADGE = (key: string): { tone: 'todo' | 'bad'; label: string } | null =>
  key.startsWith('due-') ? { tone: 'todo', label: 'Due' } : key.startsWith('default-') ? { tone: 'bad', label: 'Defaulted' } : key.startsWith('claim-') ? { tone: 'todo', label: 'Claimable' } : key === 'suspended' ? { tone: 'bad', label: 'Suspended' } : null

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
              {badge && (
                <span className="tl-pill" data-tone={badge.tone}>
                  <i aria-hidden="true" />
                  {badge.label}
                </span>
              )}
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
  const scan = useVoucherScan()
  // the greeting is read once, when the page opens
  const [hello] = useState(() => greeting(new Date()))
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
  const dues = rows.filter((s) => s.status === 'due')
  const claimable = sumAmounts(rows.filter((s) => s.status === 'claimable'))
  const actions = homeActions(member.data, rows)
  const memberState: MemberState = member.data ? { kind: 'member', member: member.data } : { kind: 'none' }
  const used = member.data ? usedPercent(member.data.outstandingDebt, member.data.limit) : 0

  // What is yours comes right after the balance card: a payment that is due must not sit below the fold. v6.3 (KISS): one card on you, one card on what to do.
  const personal = (
    <div className="home-personal">
      {member.data && (
        <section className="ds-panel home-you" aria-labelledby="home-numbers">
          <header>
            <Mascot id={account} size={44} mood={dues.length > 0 ? 'surprised' : 'smile'} />
            <div>
              {/* FE-069: a greeting, so the page says whose it is at a glance */}
              <p className="greet">
                {hello}, <strong title={account}>{name}</strong>
              </p>
              <h2 id="home-numbers">Your account</h2>
            </div>
            <Link className="see-all" to={{ pathname: '/settings', search }}>Settings</Link>
          </header>
          <dl className="kv">
            <Row label="Remaining limit" note={`Credit limit ${formatCredit(member.data.limit)} credit, ${used}% used.`}><Num>{formatCredit(member.data.headroom)}</Num> <span className="unit">credit</span></Row>
            <Row label="Debt outstanding"><Num>{formatCredit(member.data.outstandingDebt)}</Num> <span className="unit">credit</span></Row>
            <Row label="Stake"><Num>{formatCredit(member.data.stake)}</Num> <span className="unit">credit</span></Row>
            <Row label="Claimable"><Num>{formatCredit(claimable)}</Num> <span className="unit">credit</span></Row>
          </dl>
        </section>
      )}
      {/* FE-073: for an account outside the circle the only action was "Join the circle", the join step the top button and Start here already show, so the panel is left out */}
      {!notMember && <Actions actions={actions} failed={settlements.isError} />}
      {notMember && (
        <p className="greet">
          {hello}, <strong title={account}>{name}</strong>
        </p>
      )}
    </div>
  )

  return (
    <div className="home">
      <Overview scan={scan} signedIn member={!notMember} due={dues.length > 0} personal={personal} />
      <StartHere account={account} member={memberState} />
    </div>
  )
}

// FE-056: the page a member lands on from the landing page. It reads only the existing read API; without a wallet it asks for a sign-in and makes no account call.
export function Home() {
  const { account } = useWallet()
  return account ? <Dashboard account={account} /> : <SignedOut />
}
