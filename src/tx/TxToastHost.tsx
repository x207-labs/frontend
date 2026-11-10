import { useEffect } from 'react'
import './toasts.css'
import { explorerTxUrl } from './explorer'
import { txToasts, useTxToasts, type TxToast } from './toastStore'

const AUTO_DISMISS_MS = 15_000

// FE-074: the toast is a soft card with a tinted icon tile, a title line, one detail line and a pill action, the shape of the notification cards in the reference dashboards.
// The state is told by the icon and the title, not by a coloured edge.
const TITLE: Record<TxToast['kind'], string> = { pending: 'Waiting for your wallet', confirmed: 'Transaction confirmed', failed: 'Transaction failed', cancelled: 'Transaction cancelled' }

function Icon({ kind }: { kind: TxToast['kind'] }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (kind === 'confirmed') return <svg {...common}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
  if (kind === 'failed') return <svg {...common}><path d="M12 7v6" /><path d="M12 17h.01" /></svg>
  if (kind === 'cancelled') return <svg {...common}><path d="M6 12h12" /></svg>
  return <svg {...common} className="tx-toast-spin"><path d="M12 4a8 8 0 1 0 8 8" /></svg>
}

function Toast({ toast }: { toast: TxToast }) {
  const { id, kind } = toast
  useEffect(() => {
    if (kind !== 'confirmed' && kind !== 'cancelled') return
    const timer = setTimeout(() => txToasts.dismiss(id), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [id, kind])

  return (
    <li className={`tx-toast tx-toast-${kind}`} role={kind === 'failed' ? 'alert' : 'status'}>
      <span className="tx-toast-icon"><Icon kind={kind} /></span>
      <div className="tx-toast-body">
        <p className="tx-toast-title">{TITLE[kind]}</p>
        <p className="tx-toast-label">{toast.label}</p>
        {toast.kind === 'pending' && <p className="tx-toast-detail">Confirm in your wallet, then the network adds it to a block.</p>}
        {toast.kind === 'failed' && <p className="tx-toast-detail">{toast.message}</p>}
        {toast.kind === 'cancelled' && <p className="tx-toast-detail">No transaction was sent.</p>}
        {toast.kind === 'confirmed' && (
          <a className="tx-toast-action" href={explorerTxUrl(toast.hash)} target="_blank" rel="noreferrer">View on explorer</a>
        )}
      </div>
      {toast.kind !== 'pending' && (
        <button type="button" className="tx-toast-close" aria-label="Dismiss" onClick={() => txToasts.dismiss(id)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
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
