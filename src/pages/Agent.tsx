import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useMember } from '../api/queries'
import type { MemberResponse, SettlementItem } from '../api/types'
import { shortName, useAgents, type Tone } from '../components/agents'
import { NavIcon } from '../components/icons'
import { Mascot } from '../components/Mascot'
import { ErrorNotice, Loading } from '../components/QueryState'
import { formatTime } from '../lib/format'
import { formatCredit2 } from '../lib/home'
import { agentPath } from '../routes'
import { useWallet } from '../wallet/WalletContext'

// v6 (2026-11-12): one agent of the circle as Grok Bot shows a bot. Its mascot and name on top; in the middle its epochs as a timeline, a plain sentence and a
// card with the result and the one thing to do; on the right a panel on the agent (stake, limit, history); at the bottom one quick action.

const withEpoch = (search: string, epoch: number) => {
  const params = new URLSearchParams(search)
  params.set('epoch', String(epoch))
  return `?${params.toString()}`
}

const RESULT: Record<SettlementItem['status'], { word: string; tone: Tone }> = {
  due: { word: 'Due', tone: 'todo' },
  paid: { word: 'Paid', tone: 'ok' },
  defaulted: { word: 'Closed from stake', tone: 'bad' },
  claimable: { word: 'Ready to claim', tone: 'todo' },
  claimed: { word: 'Claimed', tone: 'ok' },
}

/** What happened to the agent in one epoch, in one sentence. */
export function settlementSentence(s: SettlementItem, who: string): string {
  const amount = `${formatCredit2(s.amount)} credit`
  const owes = who === 'You' ? 'owe' : 'owes'
  const is = who === 'You' ? 'are' : 'is'
  switch (s.status) {
    case 'due':
      return `${who} ${owes} ${amount} for epoch ${s.epoch}, what is left after the loops cancelled.${s.due ? ` Due ${formatTime(s.due)}.` : ''}`
    case 'paid':
      return `${who} paid ${amount} for epoch ${s.epoch}. All settled.`
    case 'defaulted':
      return `${who} did not pay ${amount} for epoch ${s.epoch}, so it was covered from the stake${s.stakeSlashed ? ` (${formatCredit2(s.stakeSlashed)} credit)` : ''}.`
    case 'claimable':
      return `${who} ${is} owed ${amount} from epoch ${s.epoch}. It is ready to claim.`
    case 'claimed':
      return `${who} claimed ${amount} from epoch ${s.epoch}.`
  }
}

function Pill({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span className="tl-pill" data-tone={tone}>
      <i aria-hidden="true" />
      {children}
    </span>
  )
}

function Timeline({ account, name, mine, rows }: { account: string; name: string; mine: boolean; rows: SettlementItem[] }) {
  const { search } = useLocation()
  const who = mine ? 'You' : name
  if (rows.length === 0) {
    return (
      <div className="tl">
        <p className="tl-time">No epochs yet</p>
        <p className="tl-bubble">{mine ? 'You have' : `${name} has`} no epoch with a result yet. Trades show up here once an epoch clears.</p>
      </div>
    )
  }
  return (
    <ol className="tl" aria-label={`Epochs of ${account}`}>
      {rows.map((s) => {
        const r = RESULT[s.status]
        const act = mine && (s.status === 'due' || s.status === 'claimable')
        return (
          <li key={`${s.epoch}-${s.role}`}>
            <p className="tl-time">Epoch {s.epoch}</p>
            <p className="tl-bubble">{settlementSentence(s, who)}</p>
            <div className="tl-card">
              <div className="tl-card-head">
                <h3>Settle epoch {s.epoch}</h3>
                <Pill tone={r.tone}>{r.word}</Pill>
              </div>
              <p className="tl-meta">
                {s.role === 'debtor' ? 'Pays' : 'Receives'} {formatCredit2(s.amount)} credit
                {s.txHash ? ' · on chain' : ''}
              </p>
              <p className="tl-actions">
                {act && (
                  <Link className="tl-btn" to={{ pathname: '/settlement', search: withEpoch(search, s.epoch) }}>
                    {s.status === 'due' ? 'Pay' : 'Claim'} {formatCredit2(s.amount)}
                  </Link>
                )}
                <Link className="tl-btn" data-variant="quiet" to={{ pathname: '/reports', search: withEpoch(search, s.epoch) }}>
                  View the report
                </Link>
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Panel({ member, rows, line }: { member: MemberResponse | null; rows: SettlementItem[]; line?: { line: string; tone: Tone } }) {
  const [open, setOpen] = useState(true)
  return (
    <aside className="agent-panel" data-open={open || undefined} aria-label="About this agent">
      <div className="agent-panel-head">
        <h2>Agent</h2>
        <button type="button" className="quiet" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open && (
        <>
          {member ? (
            <>
              <p className="agent-state">
                <Pill tone={member.status === 'active' ? 'ok' : member.status === 'suspended' ? 'bad' : 'quiet'}>{member.status === 'active' ? 'Active' : member.status[0].toUpperCase() + member.status.slice(1)}</Pill>
                {line && <span>{line.line}</span>}
              </p>
              <dl className="agent-facts">
                <div><dt>Stake</dt><dd>{formatCredit2(member.stake)}</dd></div>
                <div><dt>Credit limit</dt><dd>{formatCredit2(member.limit)}</dd></div>
                <div><dt>Free credit</dt><dd>{formatCredit2(member.headroom)}</dd></div>
                <div><dt>Owes now</dt><dd>{formatCredit2(member.outstandingDebt)}</dd></div>
                <div><dt>Joined</dt><dd>{formatTime(member.joinedAt)}</dd></div>
              </dl>
            </>
          ) : (
            <p className="agent-state">Not a member of this circle.</p>
          )}
          <h3 className="agent-sub">History</h3>
          {rows.length === 0 ? (
            <p className="agent-none">No epochs yet</p>
          ) : (
            <ul className="agent-history">
              {[...rows].reverse().map((s) => (
                <li key={`${s.epoch}-${s.role}`}>
                  <span>Epoch {s.epoch}</span>
                  <Pill tone={RESULT[s.status].tone}>{RESULT[s.status].word}</Pill>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </aside>
  )
}

/** The quick action at the bottom, where Grok Bot has its message box: pay or claim on your own page, a trade offer on anyone else's. */
function Composer({ mine, name, rows }: { mine: boolean; name: string; rows: SettlementItem[] }) {
  const { search } = useLocation()
  const due = rows.some((s) => s.status === 'due')
  const claim = rows.some((s) => s.status === 'claimable')
  const to = mine ? { pathname: '/settlement', search } : { pathname: '/marketplace', search }
  const text = mine ? (due ? 'Pay what is due' : claim ? 'Claim what you are owed' : 'Pay or claim your net amount') : `Offer a trade to ${name}`
  return (
    <Link className="composer" to={to}>
      <span className="composer-plus" aria-hidden="true">
        <NavIcon name="plus" size={18} />
      </span>
      <span className="composer-text">{text}…</span>
      <span className="composer-send" aria-hidden="true">
        <NavIcon name="up" size={18} />
      </span>
    </Link>
  )
}

export function Agent() {
  const { account: raw = '' } = useParams()
  const account = decodeURIComponent(raw)
  const { account: me } = useWallet()
  const mine = account === me
  const member = useMember(account)
  const settlements = useQuery({ queryKey: ['member-settlements', account], queryFn: () => api.memberSettlements(account), retry: false })
  const { agents } = useAgents(me)
  const agent = agents.find((a) => a.account === account)
  const name = shortName(account)
  const rows = [...(settlements.data?.items ?? [])].sort((a, b) => a.epoch - b.epoch).slice(-12)
  return (
    <div className="agent-page">
      <header className="agent-head">
        <Mascot id={account} size={44} />
        <div>
          <h1>
            {name}
            {mine && <span className="you-mark"> · you</span>}
          </h1>
          <p className="agent-account" title={account}>{account}</p>
        </div>
      </header>
      <div className="agent-body">
        <section className="agent-feed" aria-label="Timeline">
          {settlements.isPending && <Loading label="Reading the epochs" />}
          {settlements.isError && member.data !== null && <ErrorNotice error={settlements.error} onRetry={() => settlements.refetch()} />}
          {!settlements.isPending && <Timeline account={account} name={name} mine={mine} rows={settlements.isError ? [] : rows} />}
          <Composer mine={mine} name={name} rows={rows} />
        </section>
        {member.isPending ? <Loading label="Reading the agent" /> : member.isError ? <ErrorNotice error={member.error} onRetry={() => member.refetch()} /> : <Panel member={member.data ?? null} rows={rows} line={agent} />}
      </div>
    </div>
  )
}

/** Every agent of the circle, as the Members group of the sidebar shows the first ones, with a filter. */
export function Agents() {
  const { search } = useLocation()
  const { account: me } = useWallet()
  const { agents, loading, error } = useAgents(me)
  const [query, setQuery] = useState('')
  const shown = agents.filter((a) => a.account.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    <div className="agent-page">
      <header className="agent-head">
        <div>
          <h1>Members</h1>
          <p className="agent-account">{agents.length ? `${agents.length} agents in this circle` : 'The agents of this circle'}</p>
        </div>
      </header>
      <input className="agents-filter" type="search" placeholder="Search members" aria-label="Search members" value={query} onChange={(e) => setQuery(e.target.value)} />
      {loading && <Loading label="Reading members" />}
      {error && <p className="state state-error" role="alert">The member list could not be read.</p>}
      <ul className="agents-list" aria-label="Members">
        {shown.map((a) => (
          <li key={a.account}>
            <Link to={{ pathname: agentPath(a.account), search }} title={a.account}>
              <Mascot id={a.account} size={36} />
              <span>
                <b>
                  {a.name}
                  {a.account === me && <span className="you-mark"> · you</span>}
                </b>
                <span data-tone={a.tone}>{a.line}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {!loading && shown.length === 0 && <p className="agent-none">No member matches.</p>}
    </div>
  )
}
