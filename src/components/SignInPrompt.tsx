import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '../wallet/WalletContext'

/**
 * FE-069: the one sign-in card of the app. A form that needs an account shows it in place of a grey line of text, with the button right there,
 * what signing in unlocks, and a way to keep exploring without a wallet.
 */
export function SignInPrompt({ action, detail }: { action: string; detail?: string }) {
  const { busy, error, login } = useWallet()
  const { search } = useLocation()
  return (
    <div className="signin-card" role="group" aria-label={`Sign in to ${action}`}>
      <div>
        <strong>Sign in to {action}</strong>
        <p>{detail ?? 'It takes one click with a NEAR wallet. Nothing is sent or signed until you confirm it.'}</p>
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
