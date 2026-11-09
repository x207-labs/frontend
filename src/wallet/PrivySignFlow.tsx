import { useEffect, useState, type ComponentType, type FormEvent } from 'react'
import './privy.css'
import { ensureNearWallet, loginErrorMessage, readOAuthReturn, type LoginStep, type PrivyLike, type PrivyUser } from './privyLogin'

export type PluginProps = { origin: string }

type Phase = { kind: 'loading' } | { kind: 'login' } | { kind: 'ready' } | { kind: 'error'; message: string }

/**
 * FE-059: the content of the `/sign` page that NEAR Connect opens in a popup. If the visitor is not logged in to Privy yet it shows the login (email code or Google), then hands over to
 * the signing screen (`Plugin`). The login is on this page, in the popup, on this origin: the Privy session it creates is the one the signing screen then uses.
 */
export function PrivySignFlow({ privy, createNearWallet, Plugin, search = window.location.search }: {
  privy: PrivyLike
  createNearWallet: () => Promise<unknown>
  Plugin: ComponentType<PluginProps>
  search?: string
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [step, setStep] = useState<LoginStep>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function finish(user: PrivyUser) {
    const ensured = await ensureNearWallet(privy, user, createNearWallet)
    setPhase(ensured ? { kind: 'ready' } : { kind: 'error', message: 'Your login worked, but the NEAR wallet could not be created. Close this window and try again.' })
  }

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        await privy.initialize?.() // as the Privy README asks: it matters when the app uses a custom Privy domain
        const back = readOAuthReturn(search)
        if (back) {
          const { user } = await privy.auth.oauth.loginWithCode(back.code, back.state, 'google')
          if (live) await finish(user)
          return
        }
        const { user } = await privy.user.get()
        if (!live) return
        if (user) await finish(user)
        else setPhase({ kind: 'login' })
      } catch (e) {
        if (live) setPhase(readOAuthReturn(search) ? { kind: 'error', message: loginErrorMessage(e) } : { kind: 'login' })
      }
    })()
    return () => {
      live = false
    }
    // The client and the query are fixed for the life of the popup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(loginErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const sendCode = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await privy.auth.email.sendCode(email.trim())
      setStep('code')
    })
  }
  const verify = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const { user } = await privy.auth.email.loginWithCode(email.trim(), code.trim())
      await finish(user)
    })
  }
  const google = () =>
    void run(async () => {
      const { url } = await privy.auth.oauth.generateURL('google', `${window.location.origin}/sign`)
      window.location.assign(url)
    })

  if (phase.kind === 'ready') return <Plugin origin={window.location.origin} />

  return (
    <main className="privy-sign">
      <h1>Sign in to x207</h1>
      {phase.kind === 'loading' && <p role="status">Checking your session…</p>}
      {phase.kind === 'error' && <p role="alert" className="privy-error">{phase.message}</p>}
      {phase.kind === 'login' && (
        <>
          <p>Use your email or Google account. A NEAR testnet account is created for you the first time.</p>
          <button type="button" onClick={google} disabled={busy}>Continue with Google</button>
          <p className="privy-or" aria-hidden="true">or</p>
          {step === 'email' ? (
            <form onSubmit={sendCode}>
              <label>
                <span>Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required disabled={busy} />
              </label>
              <button type="submit" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send code'}</button>
            </form>
          ) : (
            <form onSubmit={verify}>
              <label>
                <span>Code sent to {email}</span>
                <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" required disabled={busy} />
              </label>
              <div className="privy-actions">
                <button type="submit" disabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Verify'}</button>
                <button type="button" onClick={() => { setStep('email'); setCode(''); setError(null) }} disabled={busy}>Back</button>
              </div>
            </form>
          )}
          {error && <p role="alert" className="privy-error">{error}</p>}
        </>
      )}
    </main>
  )
}
