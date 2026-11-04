import type { ReactNode } from 'react'
import { useWallet } from '../wallet/WalletContext'

/** A page that works on the member's own account: without a wallet it shows how to sign in instead of an empty form. */
export function RequireWallet({ title, children }: { title: string; children: ReactNode }) {
  const { account, busy, error, login } = useWallet()
  if (account) return <>{children}</>
  return (
    <section aria-label={`${title}: sign in`}>
      <p className="state">{title} works on your own account. Sign in with a NEAR wallet to continue.</p>
      {error && (
        <p className="wallet-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" onClick={login} disabled={busy}>
        {busy ? 'Opening wallet…' : 'Sign in with wallet'}
      </button>
    </section>
  )
}
