import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '../wallet/WalletContext'

/**
 * FE-069: the one sign-in card of the app. A form that needs an account shows it in place of a grey line of text, with the button right there,
 * what signing in unlocks, and a way to keep exploring without a wallet.
 * FE-072: a lock tile and one short line, like an iOS inline banner, instead of a paragraph.
 */
export function SignInPrompt({ action, detail }: { action: string; detail?: string }) {
  const { busy, error, login } = useWallet()
  const { search } = useLocation()
  return (
    <div className="signin-card" role="group" aria-label={`Sign in to ${action}`}>
      <span className="signin-lock" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2" />
        </svg>
      </span>
      <div>
        <strong>Sign in to {action}</strong>
        <p>{detail ?? 'One click. Nothing is signed until you confirm.'}</p>
        {error && (
          <p className="wallet-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <button type="button" onClick={login} disabled={busy}>
        {busy ? 'Opening wallet…' : 'Sign in with wallet'}
      </button>
      <Link className="help-link" to={{ pathname: '/help', search }}>What is this?</Link>
    </div>
  )
}
