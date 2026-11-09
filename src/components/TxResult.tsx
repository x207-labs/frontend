import { NEAR_NETWORK } from '../config'
import type { SignState } from '../wallet/WalletContext'
import { CopyButton } from './CopyButton'

const EXPLORER = NEAR_NETWORK === 'mainnet' ? 'https://nearblocks.io/txns/' : 'https://testnet.nearblocks.io/txns/'

export function TxResult({ state }: { state: SignState }) {
  switch (state.kind) {
    case 'idle':
      return null
    case 'signing':
      return <p className="state" role="status"><span className="spinner" aria-hidden="true" />Waiting for signature in wallet…</p>
    case 'cancelled':
      return <p className="state" role="status">Cancelled by user. No transaction was sent.</p>
    case 'failed':
      return <p className="state state-error" role="alert">Transaction failed: {state.message}</p>
    case 'done':
      return (
        <p className="state" role="status">
          Transaction sent:{' '}
          <a href={`${EXPLORER}${state.hash}`} target="_blank" rel="noreferrer">{state.hash}</a>
          <CopyButton value={state.hash} label="transaction hash" />
        </p>
      )
  }
}
