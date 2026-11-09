import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { pages } from '../routes'
import { useWallet } from '../wallet/WalletContext'
import { NavIcon } from './icons'

// FE-072: what each private page unlocks, as three icons with two or three words each, instead of a sentence.
const UNLOCKS: Record<string, { icon: string; text: string }[]> = {
  'Join the circle': [
    { icon: '/settlement', text: 'Free test funds' },
    { icon: '/access', text: 'Put down a stake' },
    { icon: '/stats', text: 'Get a credit limit' },
  ],
  'Pay and claim': [
    { icon: '/reports', text: 'See what you owe' },
    { icon: '/settlement', text: 'Pay the net once' },
    { icon: '/transfers', text: 'Claim what is yours' },
  ],
  Settings: [
    { icon: 'account', text: 'Display name' },
    { icon: '/invoices', text: 'Email' },
    { icon: '/risk', text: 'Payment reminders' },
  ],
}

// Pages anyone can open, offered as a way to keep going without a wallet.
const PUBLIC = ['/stats', '/marketplace', '/help']

/**
 * A page that works on the member's own account. Without a wallet it shows a sign-in screen instead of an empty form:
 * the page's own icon, what signing in unlocks, one button, and public pages to look at first.
 */
export function RequireWallet({ title, children }: { title: string; children: ReactNode }) {
  const { account, busy, error, login } = useWallet()
  const { search } = useLocation()
  if (account) return <>{children}</>
  const page = pages.find((p) => p.title === title)
  const unlocks = UNLOCKS[title] ?? []
  return (
    <section className="gate" aria-label={`${title}: sign in`}>
      <div className="gate-art" aria-hidden="true">
        <span className="gate-tile">
          <NavIcon name={page?.path ?? 'account'} size={44} />
        </span>
        <span className="gate-lock">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" />
          </svg>
        </span>
      </div>
      <p className="gate-lead">{title} works on your own account.</p>
      {unlocks.length > 0 && (
        <ul className="gate-unlocks" aria-label="Signing in unlocks">
          {unlocks.map((u) => (
            <li key={u.text}>
              <span className="gate-dot">
                <NavIcon name={u.icon} size={18} />
              </span>
              {u.text}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="wallet-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="gate-cta" onClick={login} disabled={busy}>
        {busy ? 'Opening wallet…' : 'Sign in with wallet'}
      </button>
      {title === 'Join the circle' && (
        <Link className="gate-guide" to={{ pathname: '/help', search }}>
          Join the circle step by step
        </Link>
      )}
      <nav className="gate-explore" aria-label="Explore without signing in">
        <span>Or look around first</span>
        {PUBLIC.map((path) => {
          const p = pages.find((x) => x.path === path)
          if (!p) return null
          return (
            <Link key={path} to={{ pathname: path, search }}>
              <NavIcon name={path} size={16} />
              {p.title}
            </Link>
          )
        })}
      </nav>
    </section>
  )
}
