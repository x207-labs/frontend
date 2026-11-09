// FE-068: small account settings: display name, email and deadline reminder. Each save is one wallet signature; opening the page asks for nothing.
// "Load from my account" reads what the server holds (one signature, only when the person asks).
import { useState } from 'react'
import { readCache } from '../account/cache'
import { UNSUPPORTED_MESSAGE, applyAccountData, describeAccountFailure, useAccountActions, useSigning } from '../account/useAccount'
import { useCachedAccount } from '../account/cache'
import type { AccountAction } from '../account/client'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function Settings() {
  const { account, call } = useAccountActions()
  const signing = useSigning()
  const cached = useCachedAccount(account)
  const [name, setName] = useState(() => readCache(account).displayName ?? '')
  const [email, setEmail] = useState(() => readCache(account).email ?? '')
  const [reminder, setReminder] = useState(() => readCache(account).deadlineReminder ?? false)
  const [busy, setBusy] = useState<AccountAction | null>(null)
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const trimmed = name.trim()
  const nameOk = trimmed.length >= 1 && trimmed.length <= 40
  const emailOk = email.trim() === '' || (email.trim().length <= 254 && EMAIL.test(email.trim()))

  async function run(action: AccountAction, data: Record<string, unknown>, done: string, after?: (r: Awaited<ReturnType<typeof call>>) => void) {
    setBusy(action)
    setNote(null)
    try {
      const result = await call(action, data)
      after?.(result)
      setNote({ kind: 'ok', text: done })
    } catch (e) {
      setNote({ kind: 'error', text: describeAccountFailure(e) })
    } finally {
      setBusy(null)
    }
  }

  if (signing === 'no') {
    return (
      <>
        <h2>Settings</h2>
        <p className="state" role="status">{UNSUPPORTED_MESSAGE}</p>
      </>
    )
  }
  return (
    <>
      <h2>Settings</h2>
      <p className="state">
        Your name, email and reminder are saved to your account. Each save asks your wallet for one signature; the signature proves the account and moves no funds.
      </p>
      <p>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            void run('get', {}, 'Loaded from your account.', (r) => {
              applyAccountData(r)
              setName(r.profile?.display_name ?? '')
              setEmail(r.prefs?.email ?? '')
              setReminder(r.prefs?.deadline_reminder ?? false)
            })
          }
        >
          {busy === 'get' ? 'Waiting for wallet…' : 'Load from my account'}
        </button>
      </p>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void run('upsert_profile', { display_name: trimmed }, 'Name saved.')
        }}
      >
        <label>
          <span>Display name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="nickname" />
          {name !== '' && !nameOk && <small className="state-error" role="alert">Use 1 to 40 characters.</small>}
        </label>
        <div>
          <button type="submit" disabled={!nameOk || busy !== null || trimmed === (cached.displayName ?? '')}>
            {busy === 'upsert_profile' ? 'Waiting for wallet…' : 'Save name'}
          </button>
        </div>
      </form>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void run('upsert_prefs', { email: email.trim() === '' ? null : email.trim(), deadline_reminder: reminder }, 'Preferences saved.')
        }}
      >
        <label>
          <span>Email (optional)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="email" />
          {!emailOk && <small className="state-error" role="alert">That does not look like an email address.</small>}
        </label>
        <label className="check">
          <input type="checkbox" checked={reminder} onChange={(e) => setReminder(e.target.checked)} />
          <span>Remind me before a payment deadline{reminder && email.trim() === '' ? ' (add an email so there is somewhere to send it)' : ''}</span>
        </label>
        <div>
          <button type="submit" disabled={!emailOk || busy !== null}>
            {busy === 'upsert_prefs' ? 'Waiting for wallet…' : 'Save preferences'}
          </button>
        </div>
      </form>
      {note && (
        <p className={note.kind === 'ok' ? 'state' : 'state-error'} role={note.kind === 'ok' ? 'status' : 'alert'}>
          {note.text}
        </p>
      )}
    </>
  )
}
