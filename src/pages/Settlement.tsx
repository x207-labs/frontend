import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useEpochSettlements } from '../api/queries'
import type { SettlementItem } from '../api/types'
import { DepositBranch } from '../components/DepositBranch'
import { IntentsBalancePanel } from '../components/IntentsBalancePanel'
import { ItemTitle, Party } from '../components/ListBits'
import { NoEpoch } from '../components/NoEpoch'
import { QueryState } from '../components/QueryState'
import { SignInPrompt } from '../components/SignInPrompt'
import { WithdrawPanel } from '../components/WithdrawPanel'
import { TxResult } from '../components/TxResult'
import { useSelectedEpoch } from '../epoch'
import { formatCredit } from '../lib/format'
import { NEAR_NETWORK } from '../config'
import { useSignTransaction, useWallet } from '../wallet/WalletContext'
import { claimTx, settleTx } from '../wallet/transactions'

// FE-088: the page reads like a bill. On top, the two numbers a member comes for (what I owe now, what I can claim), large and unboxed.
// Under them, one bill per epoch: the amount, its state, the deadline and the buttons, in two columns (pay, claim) on a wide screen.
// Then the Intents balance and the withdrawal side by side, and last the positions of every member in the epoch.

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

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'info'> = { due: 'warn', defaulted: 'bad', paid: 'ok', settled: 'ok', claimable: 'info', claimed: 'ok' }

function sum(items: SettlementItem[]): string {
  return items.reduce((total, i) => total + BigInt(i.amount ?? '0'), 0n).toString()
}

function DueRow({ item, account }: { item: SettlementItem; account: string }) {
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
    if (await sign(settleTx(item.epoch, item.amount))) {
      await client.invalidateQueries({ queryKey: ['member-settlements', account] })
    }
  }

  return (
    <li className="bill" data-tone={expired ? 'bad' : payable ? 'warn' : 'ok'}>
      <div className="bill-head">
        <ItemTitle icon="/settlement" hue={expired ? '#e25a4f' : '#e2801f'} title={`Epoch ${item.epoch}`} sub="Amount owed" />
        <span className="pill" data-tone={expired ? 'bad' : STATUS_TONE[item.status] ?? 'info'}>{expired && item.status === 'due' ? 'expired' : item.status}</span>
      </div>
      <p className="bill-amount">
        <strong>{formatCredit(item.amount)}</strong> credit
      </p>
      <p className="bill-line">
        Epoch {item.epoch}: net position <strong>{formatCredit(item.net)}</strong>, amount owed{' '}
        <strong>{formatCredit(item.amount)}</strong> credit, status <code>{item.status}</code>
      </p>
      {item.status === 'due' && deadline !== null && !expired && (
        <p className="bill-line">
          Payment deadline {item.due}, remaining <span className="bill-clock" data-testid="countdown">{countdown(deadline - now)}</span>
        </p>
      )}
      {expired && <p className="state state-error" role="alert">Payment window expired.</p>}
      {(item.status === 'due' || item.status === 'defaulted') && (
        <div className="bill-actions">
          <button type="button" onClick={() => void pay()} disabled={!payable || signing}>
            {signing ? 'Waiting for wallet…' : 'Pay residual'}
          </button>
          <button type="button" className="quiet" aria-expanded={other} onClick={() => setOther((v) => !v)} disabled={!payable}>
            Pay with another asset
          </button>
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
function ClaimRow({ item, account }: { item: SettlementItem; account: string }) {
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
    <li className="bill" data-tone={claimable ? 'info' : 'ok'}>
      <div className="bill-head">
        <ItemTitle icon="/settlement" hue="#2f9e8f" title={`Epoch ${item.epoch}`} sub="Balance to claim" />
        <span className="pill" data-tone={STATUS_TONE[item.status] ?? 'info'}>{item.status}</span>
      </div>
      <p className="bill-amount">
        <strong>{formatCredit(item.amount)}</strong> credit
      </p>
      <p className="bill-line">
        Epoch {item.epoch}: balance <strong>{formatCredit(item.amount)}</strong> credit, status <code>{item.status}</code>
        {item.status === 'claimed' && item.destination && <> to <code>{item.destination}</code></>}
        {item.status === 'claimed' && item.txHash && (
          <> (<a href={`${EXPLORER}${item.txHash}`} target="_blank" rel="noreferrer">{item.txHash}</a>)</>
        )}
      </p>
      {claimable && item.claimableNow === false && <p className="state">Waiting for finalize_epoch before it can be claimed.</p>}
      {claimable && (
        <div className="bill-actions">
          <button type="button" onClick={() => void claim('near')} disabled={!item.claimableNow || signing}>
            Claim to NEAR account
          </button>
          <button type="button" className="quiet" onClick={() => void claim('intents')} disabled={!item.claimableNow || signing}>
            Claim to Intents balance
          </button>
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
  const query = useQuery({
    queryKey: ['member-settlements', account],
    queryFn: () => api.memberSettlements(account!),
    enabled: account !== null,
    retry: false,
  })
  if (!account) return <SignInPrompt action="see your dues" />
  return (
    <QueryState
      query={query}
      loadingLabel="Loading dues"
      isEmpty={(d) => d.items.length === 0}
      empty="No dues."
    >
      {(data) => {
        const debts = data.items.filter((i) => i.role === 'debtor')
        const credits = data.items.filter((i) => i.role === 'creditor')
        const owed = sum(debts.filter((i) => i.status === 'due' || i.status === 'defaulted'))
        const toClaim = sum(credits.filter((i) => i.status === 'claimable'))
        return (
          <>
            <dl className="settle-sum">
              <div data-tone={owed !== '0' ? 'warn' : undefined}>
                <dt>You owe</dt>
                <dd><strong>{formatCredit(owed)}</strong> credit</dd>
              </div>
              <div data-tone={toClaim !== '0' ? 'ok' : undefined}>
                <dt>You can claim</dt>
                <dd><strong>{formatCredit(toClaim)}</strong> credit</dd>
              </div>
            </dl>
            <div className="settle-cols">
              <section className="settle-col" aria-labelledby="settle-pay">
                <h3 id="settle-pay">To pay</h3>
                {debts.length === 0 ? (
                  <p className="state">No dues.</p>
                ) : (
                  <ul className="bills">
                    {debts.map((item) => (
                      <DueRow key={`${item.epoch}`} item={item} account={account} />
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
                    {credits.map((item) => (
                      <ClaimRow key={`${item.epoch}`} item={item} account={account} />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )
      }}
    </QueryState>
  )
}

export function Settlement() {
  const epoch = useSelectedEpoch()
  const settlements = useEpochSettlements(epoch)
  const { account } = useWallet()
  if (epoch === null) return <NoEpoch />
  return (
    <div className="settle">
      <section className="settle-block" aria-labelledby="settle-dues">
        <h2 id="settle-dues">Your dues</h2>
        <MyDues />
      </section>
      <section className="settle-block" aria-labelledby="settle-intents">
        <h2 id="settle-intents">Intents balance</h2>
        <div className="settle-cols">
          <IntentsBalancePanel />
          {account && <WithdrawPanel account={account} />}
        </div>
      </section>
      <section className="settle-block" aria-labelledby="settle-all">
        <h2 id="settle-all">All positions in epoch {epoch}</h2>
        <QueryState
          query={settlements}
          loadingLabel="Loading settlement"
          isEmpty={(d) => d.items.length === 0}
          empty="No settlement positions in this epoch."
        >
          {(data) => (
            <div className="table-wrap"><table>
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
                    <td><Party account={item.account ?? ''} you={item.account === account} /></td>
                    <td><span className="pill" data-tone={STATUS_TONE[item.status] ?? 'info'}>{item.status}</span></td>
                    <td className="num">{formatCredit(item.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </QueryState>
      </section>
    </div>
  )
}
