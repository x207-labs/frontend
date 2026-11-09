import { useEffect } from 'react'
import './toasts.css'
import { explorerTxUrl } from './explorer'
import { txToasts, useTxToasts, type TxToast } from './toastStore'

const AUTO_DISMISS_MS = 15_000

function Toast({ toast }: { toast: TxToast }) {
  const { id, kind } = toast
  useEffect(() => {
    if (kind !== 'confirmed' && kind !== 'cancelled') return
    const timer = setTimeout(() => txToasts.dismiss(id), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [id, kind])

  return (
    <li className={`tx-toast tx-toast-${kind}`} role={kind === 'failed' ? 'alert' : 'status'}>
      <div className="tx-toast-body">
        <strong>
          {toast.kind === 'pending' && 'Pending'}
          {toast.kind === 'confirmed' && 'Confirmed'}
          {toast.kind === 'failed' && 'Failed'}
          {toast.kind === 'cancelled' && 'Cancelled'}
        </strong>{' '}
        <span>{toast.label}</span>
        {toast.kind === 'pending' && <span> Waiting for your wallet and the network…</span>}
        {toast.kind === 'confirmed' && (
          <>
            {' '}
            <a href={explorerTxUrl(toast.hash)} target="_blank" rel="noreferrer">View on explorer</a>
          </>
        )}
        {toast.kind === 'failed' && <p className="tx-toast-detail">{toast.message}</p>}
        {toast.kind === 'cancelled' && <span> No transaction was sent.</span>}
      </div>
      {toast.kind !== 'pending' && (
        <button type="button" className="tx-toast-close" aria-label="Dismiss" onClick={() => txToasts.dismiss(id)}>
          ×
        </button>
      )}
    </li>
  )
}

/** Shows the pending, confirmed, and failed toasts of signed transactions. Mounted once by the wallet provider. */
export function TxToastHost() {
  const toasts = useTxToasts()
  if (toasts.length === 0) return null
  return (
    <ul className="tx-toasts" aria-label="Transaction status">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} />
      ))}
    </ul>
  )
}
