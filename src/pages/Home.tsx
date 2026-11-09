import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { useEpochs, useMember } from '../api/queries'
import type { EpochItem, SettlementItem } from '../api/types'
import { ErrorNotice, Loading } from '../components/QueryState'
import { formatCredit, formatTime } from '../lib/format'
import { currentEpoch, homeActions, sumAmounts } from '../lib/home'
import { useWallet } from '../wallet/WalletContext'

function Stat({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>
        <strong>{value}</strong>
        {unit && <span> {unit}</span>}
      </dd>
      {note && <dd className="stat-note">{note}</dd>}
    </div>
  )
}

function SignedOut() {
  const { busy, error, login } = useWallet()
  return (
    <section className="connect" aria-label="Home: sign in">
      <h2>Your credit position, in one place</h2>
      <p>Sign in with a NEAR wallet to see your credit limit, what you owe or can claim this epoch, and the next payment deadline.</p>
      {error && (
        <p className="wallet-error" role="alert">
          {error}
        </p>
      )}
      <p>
        <button type="button" onClick={login} disabled={busy}>
          {busy ? 'Opening wallet…' : 'Sign in with wallet'}
        </button>
      </p>
      <p className="state">
        No wallet? <Link to="/stats">Look at the clearing results</Link> first, no account needed.
      </p>
    </section>
  )
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
  const settlements = useQuery({
    queryKey: ['member-settlements', account],
    queryFn: () => api.memberSettlements(account),
    retry: false,
  })

  const notMember = member.error instanceof ApiError && member.error.status === 404
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

  return (
    <>
      <section aria-labelledby="home-actions">
        <h2 id="home-actions">Actions to take</h2>
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

      {member.data && (
        <section aria-labelledby="home-numbers">
          <h2 id="home-numbers">Your account</h2>
          <dl className="stats">
            <Stat label="Credit limit" value={formatCredit(member.data.limit)} unit="credit" />
            <Stat label="Remaining limit" value={formatCredit(member.data.headroom)} unit="credit" note={`Debt outstanding: ${formatCredit(member.data.outstandingDebt)} credit.`} />
            <Stat label="Claimable balance" value={formatCredit(claimable)} unit="credit" note="Owed to you and not claimed yet." />
            <Stat label="Stake" value={formatCredit(member.data.stake)} unit="credit" />
          </dl>
        </section>
      )}

      <section aria-labelledby="home-epoch">
        <h2 id="home-epoch">This epoch</h2>
        <dl className="stats">
          <Position epoch={current} rows={rows} />
          <Stat label="Payment deadline" value={next ? formatTime(next) : 'none set'} note={next ? undefined : 'No payment is due right now.'} />
        </dl>
      </section>
    </>
  )
}

// FE-056: the page a member lands on from the landing page. It reads only the existing read API; without a wallet it asks for a sign-in and makes no account call.
export function Home() {
  const { account } = useWallet()
  return account ? <Dashboard account={account} /> : <SignedOut />
}
