import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useEpochSettlements } from '../api/queries'
import type { SettlementItem } from '../api/types'
import { DepositBranch } from '../components/DepositBranch'
import { QueryState } from '../components/QueryState'
import { TxResult } from '../components/TxResult'
import { useSelectedEpoch } from '../epoch'
import { formatCredit, shortAccount } from '../lib/format'
import { NEAR_NETWORK } from '../config'
import { useSignTransaction, useWallet } from '../wallet/WalletContext'
import { claimTx, settleTx } from '../wallet/transactions'

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
  return `${h}j ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}d`
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
    <li className="due">
      <p>
        Epoch {item.epoch}: posisi bersih <strong>{formatCredit(item.net)}</strong>, tagihan{' '}
        <strong>{formatCredit(item.amount)}</strong> credit, status <code>{item.status}</code>
      </p>
      {item.status === 'due' && deadline !== null && !expired && (
        <p>
          Batas bayar {item.due}, sisa <span data-testid="countdown">{countdown(deadline - now)}</span>
        </p>
      )}
      {expired && <p className="state state-error" role="alert">Payment window habis.</p>}
      {(item.status === 'due' || item.status === 'defaulted') && (
        <div>
          <button type="button" onClick={() => void pay()} disabled={!payable || signing}>
            {signing ? 'Menunggu wallet…' : 'Bayar residual'}
          </button>{' '}
          <button type="button" onClick={() => setOther((v) => !v)} disabled={!payable}>
            Bayar dengan aset lain
          </button>
        </div>
      )}
      {other && payable && <DepositBranch purpose="settle" account={account} epoch={item.epoch} onReady={setReady} />}
      {other && payable && ready && <p className="state" role="status">Saldo Intents siap; lanjutkan ft_withdraw lalu bayar residual.</p>}
      <TxResult state={state} />
    </li>
  )
}

const EXPLORER = NEAR_NETWORK === 'mainnet' ? 'https://nearblocks.io/txns/' : 'https://testnet.nearblocks.io/txns/'

// FE-010: saldo kreditor per epoch; klaim hanya setelah finalize_epoch (ADR-24).
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
    <li className="claim">
      <p>
        Epoch {item.epoch}: saldo <strong>{formatCredit(item.amount)}</strong> credit, status <code>{item.status}</code>
        {item.status === 'claimed' && item.destination && <> ke <code>{item.destination}</code></>}
        {item.status === 'claimed' && item.txHash && (
          <> (<a href={`${EXPLORER}${item.txHash}`} target="_blank" rel="noreferrer">{item.txHash}</a>)</>
        )}
      </p>
      {claimable && item.claimableNow === false && <p className="state">Menunggu finalize_epoch sebelum bisa diklaim.</p>}
      {claimable && (
        <div>
          <button type="button" onClick={() => void claim('near')} disabled={!item.claimableNow || signing}>
            Klaim ke akun NEAR
          </button>{' '}
          <button type="button" onClick={() => void claim('intents')} disabled={!item.claimableNow || signing}>
            Klaim ke saldo Intents
          </button>
        </div>
      )}
      {claimable && claimed && item.claimableNow && state.kind === 'done' && (
        <p className="state state-error" role="alert">Transfer gagal, saldo dipulihkan. Anda bisa mengklaim lagi.</p>
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
  if (!account) return <p className="state">Masuk dengan wallet untuk melihat tagihan Anda.</p>
  return (
    <QueryState
      query={query}
      loadingLabel="Memuat tagihan"
      isEmpty={(d) => d.items.length === 0}
      empty="Tidak ada tagihan."
    >
      {(data) => {
        const debts = data.items.filter((i) => i.role === 'debtor')
        const credits = data.items.filter((i) => i.role === 'creditor')
        return (
          <>
            {debts.length === 0 ? (
              <p className="state">Tidak ada tagihan.</p>
            ) : (
              <ul className="dues">
                {debts.map((item) => (
                  <DueRow key={`${item.epoch}`} item={item} account={account} />
                ))}
              </ul>
            )}
            <h3>Saldo untuk diklaim</h3>
            {credits.length === 0 ? (
              <p className="state">Tidak ada saldo untuk diklaim.</p>
            ) : (
              <ul className="claims">
                {credits.map((item) => (
                  <ClaimRow key={`${item.epoch}`} item={item} account={account} />
                ))}
              </ul>
            )}
          </>
        )
      }}
    </QueryState>
  )
}

export function Settlement() {
  const epoch = useSelectedEpoch()
  const settlements = useEpochSettlements(epoch)
  if (epoch === null) return null
  return (
    <>
      <h2>Tagihan Anda</h2>
      <MyDues />
      <h2>Semua posisi epoch {epoch}</h2>
      <QueryState
        query={settlements}
        loadingLabel="Memuat settlement"
        isEmpty={(d) => d.items.length === 0}
        empty="Tidak ada posisi settlement di epoch ini."
      >
        {(data) => (
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th scope="col">Anggota</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">Posisi bersih</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.account}>
                  <td>{shortAccount(item.account ?? '')}</td>
                  <td>{item.status}</td>
                  <td className="num">{formatCredit(item.net)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </QueryState>
    </>
  )
}
