// FE-068: small account settings: display name, email and deadline reminder. Each save is one wallet signature; opening the page asks for nothing.
// "Load from my account" reads what the server holds (one signature, only when the person asks).
// FE-087: laid out like the settings of a consumer app: who you are on top (photo, name, account), then one group per subject, each with its own
// save button and its own result line, in one centred column. The photo is new and stays in this browser (photo.ts says why).
import { useState } from 'react'
import { Mascot } from '../components/Mascot'
import { readCache, useCachedAccount, writeCache } from '../account/cache'
import { PhotoError, photoFromFile } from '../account/photo'
import { UNSUPPORTED_MESSAGE, applyAccountData, describeAccountFailure, useAccountActions, useSigning } from '../account/useAccount'
import type { AccountAction } from '../account/client'
import { Button } from '../ds/components'
import { displayAccount } from '../lib/account'

// FE-101: the same rules as the account service (backend/supabase/functions/x207-account/handler.ts `EMAIL`, `CONTROL`), so a value the form accepts is never
// refused after the wallet has signed: at most 64 characters before the @, 190 between it and the last dot, and a domain end of 2 or more.
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/
const hasControl = (text: string) => [...text].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f)

type Note = { at: AccountAction | 'photo'; kind: 'ok' | 'error'; text: string }

function NoteLine({ note, at }: { note: Note | null; at: Note['at'] }) {
  if (!note || note.at !== at) return null
  return (
    <p className={note.kind === 'ok' ? 'state settings-note' : 'state-error'} role={note.kind === 'ok' ? 'status' : 'alert'}>
      {note.text}
    </p>
  )
}

export function Settings() {
  const { account, call } = useAccountActions()
  const signing = useSigning()
  const cached = useCachedAccount(account)
  const [name, setName] = useState(() => readCache(account).displayName ?? '')
  const [email, setEmail] = useState(() => readCache(account).email ?? '')
  const [reminder, setReminder] = useState(() => readCache(account).deadlineReminder ?? false)
  const [busy, setBusy] = useState<AccountAction | null>(null)
  const [note, setNote] = useState<Note | null>(null)

  const trimmed = name.trim()
  const nameOk = trimmed.length >= 1 && trimmed.length <= 40 && !hasControl(trimmed)
  const emailOk = email.trim() === '' || (email.trim().length <= 254 && EMAIL.test(email.trim()))
  const who = account ?? ''
  // v4: one glowing primary on the page, the save that has something to save (the name first); the others are quiet
  const nameDirty = trimmed !== (cached.displayName ?? '')
  const prefsDirty = email.trim() !== (cached.email ?? '') || reminder !== (cached.deadlineReminder ?? false)
  const primary: 'name' | 'prefs' | null = nameDirty && nameOk ? 'name' : prefsDirty && emailOk ? 'prefs' : null

  async function run(action: AccountAction, data: Record<string, unknown>, done: string, after?: (r: Awaited<ReturnType<typeof call>>) => void) {
    setBusy(action)
    setNote(null)
    try {
      const result = await call(action, data)
      after?.(result)
      setNote({ at: action, kind: 'ok', text: done })
    } catch (e) {
      setNote({ at: action, kind: 'error', text: describeAccountFailure(e) })
    } finally {
      setBusy(null)
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file || !account) return
    setNote(null)
    try {
      writeCache(account, { photo: await photoFromFile(file) })
      setNote({ at: 'photo', kind: 'ok', text: 'Photo updated.' })
    } catch (e) {
      setNote({ at: 'photo', kind: 'error', text: e instanceof PhotoError ? e.message : 'This photo could not be saved. Try another JPG, PNG or WebP.' })
    }
  }

  if (signing === 'no') {
    return <p className="state" role="status">{UNSUPPORTED_MESSAGE}</p>
  }
  return (
    <div className="settings cl">
      <section className="settings-hero" aria-label="Profile">
        <span className="settings-photo" data-photo={cached.photo ? 'true' : undefined}>
          {cached.photo ? <img src={cached.photo} alt="Your profile photo" /> : <Mascot id={who} size={64} mood="happy" />}
        </span>
        <div className="settings-who">
          <h2>{cached.displayName || displayAccount(who)}</h2>
          <p className="settings-account" title={who}>{cached.displayName ? who : 'No display name yet. Members see your account name.'}</p>
          <div className="photo-actions">
            <label className="photo-pick">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  void pickPhoto(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <span>{cached.photo ? 'Change photo' : 'Add a photo'}</span>
            </label>
            {cached.photo && (
              <Button
                type="button"
                variant="quiet"
                onClick={() => {
                  if (!account) return
                  writeCache(account, { photo: undefined })
                  setNote({ at: 'photo', kind: 'ok', text: 'Photo removed.' })
                }}
              >
                Remove photo
              </Button>
            )}
          </div>
          <NoteLine note={note} at="photo" />
        </div>
      </section>

      <section className="settings-group" aria-labelledby="settings-profile">
        <div className="settings-group-head">
          <h3 id="settings-profile">Profile</h3>
          <p>How other members see you. The photo stays in this browser; the name is saved to your account.</p>
        </div>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            void run('upsert_profile', { display_name: trimmed }, 'Name saved.')
          }}
        >
          <label>
            <span>Display name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="nickname" placeholder="Ana" />
            {name !== '' && !nameOk && <small className="state-error" role="alert">Use 1 to 40 characters, with no tabs or line breaks.</small>}
          </label>
          <div className="settings-actions">
            <Button type="submit" variant={primary === 'name' ? 'glow' : 'quiet'} disabled={!nameOk || busy !== null || !nameDirty}>
              {busy === 'upsert_profile' ? 'Waiting for wallet…' : 'Save name'}
            </Button>
            <NoteLine note={note} at="upsert_profile" />
          </div>
        </form>
      </section>

      <section className="settings-group" aria-labelledby="settings-notify">
        <div className="settings-group-head">
          <h3 id="settings-notify">Notifications</h3>
          <p>Where a reminder goes before a payment is due.</p>
        </div>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            void run('upsert_prefs', { email: email.trim() === '' ? null : email.trim(), deadline_reminder: reminder }, 'Preferences saved.')
          }}
        >
          <label>
            <span>Email (optional)</span>
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
            />
            {!emailOk && <small className="state-error" role="alert">That does not look like an email address.</small>}
          </label>
          <label className="check">
            <input type="checkbox" checked={reminder} onChange={(e) => setReminder(e.target.checked)} />
            <span>Remind me before a payment deadline{reminder && email.trim() === '' ? ' (add an email so there is somewhere to send it)' : ''}</span>
          </label>
          <div className="settings-actions">
            <Button type="submit" variant={primary === 'prefs' ? 'glow' : 'quiet'} disabled={!emailOk || busy !== null}>
              {busy === 'upsert_prefs' ? 'Waiting for wallet…' : 'Save preferences'}
            </Button>
            <NoteLine note={note} at="upsert_prefs" />
          </div>
        </form>
      </section>

      <section className="settings-group" aria-labelledby="settings-sync">
        <div className="settings-group-head">
          <h3 id="settings-sync">Signatures and sync</h3>
          <p>
            Each save asks your wallet for one signature. The signature proves the account and moves no funds. Signed in on another device? Load what your account holds.
          </p>
        </div>
        <div className="settings-actions">
          <Button
            type="button"
            variant="quiet"
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
          </Button>
          <NoteLine note={note} at="get" />
        </div>
      </section>
    </div>
  )
}
