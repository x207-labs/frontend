import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../api/client'
import { useEpochSettlements } from '../api/queries'
import type { SettlementItem } from '../api/types'
import { DepositBranch } from '../components/DepositBranch'
import { IntentsBalancePanel } from '../components/IntentsBalancePanel'
import { NoEpoch } from '../components/NoEpoch'
import { QueryState } from '../components/QueryState'
import { SignInPrompt } from '../components/SignInPrompt'
import { WithdrawPanel } from '../components/WithdrawPanel'
import { TxResult } from '../components/TxResult'
import { CIRCLE, NEAR_NETWORK } from '../config'
import { Button, Kpi, Num, StatusBadge, type StatusCode } from '../ds/components'
import { useEpochSelection, useSelectedEpoch } from '../epoch'
import { formatCredit2, formatNumber, shortAccount } from '../lib/format'
import { MONEY, NETWORK_NAME } from '../lib/network'
import { useSignTransaction, useWallet } from '../wallet/WalletContext'
import { resolveCircleTokens } from '../wallet/circleTokens'
import { claimTx, settleTx } from '../wallet/transactions'

// FE-088: the page reads like a bill. On top, the two numbers a member comes for (what I owe now, what I can claim).
// Under them, one bill per epoch: the amount, its state, the deadline and the buttons, in two columns (pay, claim) on a wide screen.
// Then the Intents balance and the withdrawal side by side, and last the positions of every member in the epoch.
// v4: a statement first (one sentence with the figures, the four totals as cards), the bills as quiet panels, and one glowing primary: the next payment, or the first claim when nothing is due.

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
}

const phaseWord = (phase: string): string => phase.replace(/_/g, ' ')

/** The result code and the word of a settlement status (src/ds: 200 settled, 202 claimable, 402 due, 409 defaulted). */
const BADGE: Record<string, { code: StatusCode; label: string }> = {
  due: { code: 402, label: 'Due' },
  defaulted: { code: 409, label: 'Defaulted' },
  paid: { code: 200, label: 'Paid' },
  settled: { code: 200, label: 'Settled' },
  claimable: { code: 202, label: 'Claimable' },
  claimed: { code: 200, label: 'Claimed' },
}

function SettlementBadge({ status, expired = false }: { status: string; expired?: boolean }) {
  if (expired && status === 'due') return <StatusBadge code={409} label="Expired" />
  const badge = BADGE[status]
  return badge ? <StatusBadge code={badge.code} label={badge.label} /> : <span className="ds-status">{status}</span>
}

function sum(items: SettlementItem[]): bigint {
  return items.reduce((total, i) => total + BigInt(i.amount ?? '0'), 0n)
}

/** What the member owes, can claim, has paid and has claimed, over every epoch where there is a position. */
function duesOf(items: SettlementItem[]) {
  const debts = items.filter((i) => i.role === 'debtor')
  const credits = items.filter((i) => i.role === 'creditor')
  const open = debts.filter((i) => i.status === 'due' || i.status === 'defaulted')
  return {
    debts,
    credits,
    owed: sum(open),
    openCount: open.length,
    toClaim: sum(credits.filter((i) => i.status === 'claimable')),
    paid: sum(debts.filter((i) => i.status === 'paid')),
    claimed: sum(credits.filter((i) => i.status === 'claimed')),
  }
}

/** The dues of the signed-in member over every epoch (one query, shared by the statement and the bills). */
function useMyDues(account: string | null) {
  return useQuery({
    queryKey: ['member-settlements', account],
    queryFn: () => api.memberSettlements(account!),
    enabled: account !== null,
    retry: false,
  })
}

function DueRow({ item, account, primary }: { item: SettlementItem; account: string; primary: boolean }) {
  const now = useNow()
  const { state, sign } = useSignTransaction()
  const client = useQueryClient()
  const [ready, setReady] = useState(false)
  const [other, setOther] = useState(false)
  const deadline = item.due ? Date.parse(item.due) : null
  const expired = item.status === 'defaulted' || (item.status === 'due' && deadline !== null && now >= deadline)
  const payable = item.status === 'due' && !expired
  const signing = state.kind === 'signing'

  async function pay() {
    // FE-110: pay in the token the circle contract accepts (`get_circle`), not a fixed account.
    const { usdt } = await resolveCircleTokens()
    if (await sign(settleTx(item.epoch, item.amount, usdt))) {
      await client.invalidateQueries({ queryKey: ['member-settlements', account] })
    }
  }

  return (
    <li className="bill" data-tone={expired ? 'default' : payable ? 'due' : 'settled'}>
      <div className="bill-head">
        <div className="bill-id">
          <strong>Epoch {item.epoch}</strong>
          <span>Amount owed</span>
        </div>
        <SettlementBadge status={item.status} expired={expired} />
      </div>
      <p className="bill-amount">
        <Num>{formatCredit2(item.amount)}</Num> <small>credit</small>
      </p>
      <p className="bill-line">
        Epoch {item.epoch}: net position <strong>{formatCredit2(item.net)}</strong>, amount owed{' '}
        <strong>{formatCredit2(item.amount)}</strong> credit, status <code>{item.status}</code>
      </p>
      {item.status === 'due' && deadline !== null && !expired && (
        <p className="bill-line">
          Payment deadline {item.due}, remaining <span className="bill-clock" data-testid="countdown">{countdown(deadline - now)}</span>
        </p>
      )}
      {expired && <p className="state state-error" role="alert">Payment window expired.</p>}
      {(item.status === 'due' || item.status === 'defaulted') && (
        <div className="bill-actions">
          <Button type="button" variant={primary && payable ? 'glow' : 'quiet'} onClick={() => void pay()} disabled={!payable || signing}>
            {signing ? 'Waiting for wallet…' : 'Pay residual'}
          </Button>
          <Button type="button" variant="quiet" aria-expanded={other} onClick={() => setOther((v) => !v)} disabled={!payable}>
            Pay with another asset
          </Button>
        </div>
      )}
      {other && payable && <DepositBranch purpose="settle" account={account} epoch={item.epoch} onReady={setReady} />}
      {other && payable && ready && <p className="state" role="status">Intents balance ready; continue with ft_withdraw, then pay the residual.</p>}
      <TxResult state={state} />
    </li>
  )
}

const EXPLORER = NEAR_NETWORK === 'mainnet' ? 'https://nearblocks.io/txns/' : 'https://testnet.nearblocks.io/txns/'

// FE-010: creditor balance per epoch; claim only after finalize_epoch (ADR-24).
function ClaimRow({ item, account, primary }: { item: SettlementItem; account: string; primary: boolean }) {
  const { state, sign } = useSignTransaction()
  const client = useQueryClient()
  const [claimed, setClaimed] = useState(false)
  const signing = state.kind === 'signing'
  const claimable = item.status === 'claimable'

  async function claim(destination: 'near' | 'intents') {
    if (await sign(claimTx(item.epoch, destination))) {
      await client.invalidateQueries({ queryKey: ['member-settlements', account] })
      setClaimed(true)
    }
  }

  return (
    <li className="bill" data-tone={claimable ? 'claim' : 'settled'}>
      <div className="bill-head">
        <div className="bill-id">
          <strong>Epoch {item.epoch}</strong>
          <span>Balance to claim</span>
        </div>
        <SettlementBadge status={item.status} />
      </div>
      <p className="bill-amount">
        <Num>{formatCredit2(item.amount)}</Num> <small>credit</small>
      </p>
      <p className="bill-line">
        Epoch {item.epoch}: balance <strong>{formatCredit2(item.amount)}</strong> credit, status <code>{item.status}</code>
        {item.status === 'claimed' && item.destination && <> to <code>{item.destination}</code></>}
        {item.status === 'claimed' && item.txHash && (
          <> (<a href={`${EXPLORER}${item.txHash}`} target="_blank" rel="noreferrer">{item.txHash}</a>)</>
        )}
      </p>
      {claimable && item.claimableNow === false && <p className="state">Waiting for finalize_epoch before it can be claimed.</p>}
      {claimable && (
        <div className="bill-actions">
          <Button type="button" variant={primary ? 'glow' : 'quiet'} onClick={() => void claim('near')} disabled={!item.claimableNow || signing}>
            Claim to NEAR account
          </Button>
          <Button type="button" variant="quiet" onClick={() => void claim('intents')} disabled={!item.claimableNow || signing}>
            Claim to Intents balance
          </Button>
        </div>
      )}
      {claimable && claimed && item.claimableNow && state.kind === 'done' && (
        <p className="state state-error" role="alert">Transfer failed, balance restored. You can claim again.</p>
      )}
      <TxResult state={state} />
    </li>
  )
}

function MyDues() {
  const { account } = useWallet()
  const query = useMyDues(account)
  if (!account) return <SignInPrompt action="see your dues" />
  // FE-097: an account that has not joined gets member_not_found (404); that is an answer, not an error to retry (as on Home).
  const e = query.error
  if (query.data === undefined && e instanceof ApiError && (e.status === 404 || e.code === 'member_not_found'))
    return (
      <p className="state" role="status" data-testid="not-member">
        This account has not joined the circle, so it has no dues and nothing to claim. <Link to="/onboarding">Join the circle</Link> to stake and start trading on credit.
      </p>
    )
  return (
    <QueryState
      query={query}
      loadingLabel="Loading dues"
      isEmpty={(d) => d.items.length === 0}
      empty="No dues."
    >
      {(data) => {
        const { debts, credits } = duesOf(data.items)
        // one glowing primary on the page: the first bill that can still be paid; when nothing is due, the first balance that can be claimed
        const firstDue = debts.findIndex((i) => i.status === 'due')
        const firstClaim = firstDue === -1 ? credits.findIndex((i) => i.status === 'claimable') : -1
        return (
          <div className="settle-cols">
            <section className="settle-col" aria-labelledby="settle-pay">
              <h3 id="settle-pay">To pay</h3>
              {debts.length === 0 ? (
                <p className="state">No dues.</p>
              ) : (
                <ul className="bills">
                  {debts.map((item, i) => (
                    <DueRow key={`${item.epoch}`} item={item} account={account} primary={i === firstDue} />
                  ))}
                </ul>
              )}
            </section>
            <section className="settle-col" aria-labelledby="settle-claim">
              <h3 id="settle-claim">Balance to claim</h3>
              {credits.length === 0 ? (
                <p className="state">No balance to claim.</p>
              ) : (
                <ul className="bills">
                  {credits.map((item, i) => (
                    <ClaimRow key={`${item.epoch}`} item={item} account={account} primary={i === firstClaim} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        )
      }}
    </QueryState>
  )
}

export function Settlement() {
  const epoch = useSelectedEpoch()
  const selected = useEpochSelection().selected
  const settlements = useEpochSettlements(epoch)
  const { account } = useWallet()
  const dues = useMyDues(account)
  if (epoch === null) return <NoEpoch />
  const totals = dues.data ? duesOf(dues.data.items) : null
  return (
    <div className="settle ep cl">
      <header className="ep-head">
        <p className="ep-eyebrow">
          {CIRCLE}
          {account ? ` · ${shortAccount(account)}` : ''} · epoch {epoch}
          {selected ? ` · ${phaseWord(selected.phase)}` : ''}
        </p>
        {/* the page title is the h1 of the shell; this one names what the page is about */}
        <h2 className="ep-title">What you owe and can claim</h2>
        {totals && (
          <>
            <p className="ep-lede">
              You owe {formatCredit2(totals.owed.toString())} credit and can claim {formatCredit2(totals.toClaim.toString())} credit.
            </p>
            <p className="ep-sub">
              The totals cover every epoch where you have a position, not only epoch {epoch}. Amounts are in credit; payments and claims move as {MONEY} on {NETWORK_NAME}.
            </p>
          </>
        )}
      </header>
      {totals && (
        <section className="ep-section" aria-label="Headline figures">
          <div className="ds-kpis ep-kpis cl-kpis">
            <Kpi
              badge="402"
              label="You owe"
              value={formatCredit2(totals.owed.toString())}
              unit="credit"
              tone={totals.owed > 0n ? 'due' : 'ink'}
              note={totals.openCount > 0 ? `${formatNumber(totals.openCount, 0)} ${totals.openCount === 1 ? 'epoch' : 'epochs'} with a bill` : 'Nothing due'}
            />
            <Kpi
              badge="202"
              label="You can claim"
              value={formatCredit2(totals.toClaim.toString())}
              unit="credit"
              tone={totals.toClaim > 0n ? 'claim' : 'ink'}
              note={totals.toClaim > 0n ? 'Claim once its epoch is finalized' : 'Nothing to claim'}
            />
            <Kpi badge="200" label="Paid" value={formatCredit2(totals.paid.toString())} unit="credit" note="Settled by you" />
            <Kpi badge="200" label="Claimed" value={formatCredit2(totals.claimed.toString())} unit="credit" note="Collected by you" />
          </div>
        </section>
      )}
      <section className="ep-section" aria-labelledby="settle-dues">
        <h2 id="settle-dues" className="ep-h2">Your dues</h2>
        <MyDues />
      </section>
      <section className="ep-section" aria-labelledby="settle-intents">
        <h2 id="settle-intents" className="ep-h2">Intents balance</h2>
        <div className="settle-cols">
          <IntentsBalancePanel />
          {account && <WithdrawPanel account={account} />}
        </div>
      </section>
      <section className="ep-section" aria-labelledby="settle-all">
        <h2 id="settle-all" className="ep-h2">All positions in epoch {epoch}</h2>
        <p className="ep-sechint">Amounts in credit. A negative net position is what the member owes; a positive one is what it can claim.</p>
        <QueryState
          query={settlements}
          loadingLabel="Loading settlement"
          isEmpty={(d) => d.items.length === 0}
          empty="No settlement positions in this epoch."
        >
          {(data) => (
            <div className="table-wrap ep-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Member</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="num">Net position</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.account}>
                      <td>
                        <span className="cl-party" title={item.account}>
                          {shortAccount(item.account ?? '')}
                          {item.account === account && <span className="you-tag">you</span>}
                        </span>
                      </td>
                      <td><SettlementBadge status={item.status} /></td>
                      <td className="num">{formatCredit2(item.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </section>
    </div>
  )
}
