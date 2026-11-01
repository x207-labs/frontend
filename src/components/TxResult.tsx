import { NEAR_NETWORK } from '../config'
import type { SignState } from '../wallet/WalletContext'

const EXPLORER = NEAR_NETWORK === 'mainnet' ? 'https://nearblocks.io/txns/' : 'https://testnet.nearblocks.io/txns/'

export function TxResult({ state }: { state: SignState }) {
  switch (state.kind) {
    case 'idle':
      return null
    case 'signing':
      return <p className="state" role="status"><span className="spinner" aria-hidden="true" />Menunggu tanda tangan di wallet…</p>
    case 'cancelled':
      return <p className="state" role="status">Dibatalkan pengguna. Tidak ada transaksi yang dikirim.</p>
    case 'failed':
      return <p className="state state-error" role="alert">Transaksi gagal: {state.message}</p>
    case 'done':
      return (
        <p className="state" role="status">
          Transaksi terkirim:{' '}
          <a href={`${EXPLORER}${state.hash}`} target="_blank" rel="noreferrer">{state.hash}</a>
        </p>
      )
  }
}
