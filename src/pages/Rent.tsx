import { GranteeProofError, RentError, buildGistContent, parseSshEd25519, checkAccessBeforeNextDay, encodeGranteeProof, granteeChallenge, parseGranteeProof, type GranteeProof } from '@x207/core'
import { useState } from 'react'
import { ApiError, api } from '../api/client'
import type { RentChallenge, RentView } from '../api/types'
import { VoucherKeyField } from '../components/VoucherKeyField'
import { PROVIDER_GLYPHS } from '../components/glyphs'
import { NavIcon, ProviderIcon } from '../components/icons'
import { PAGE_HUE } from '../components/pageHue'
import { BROKER_URL, CONTRACT_ID } from '../config'
import { signMessageWithVoucher } from '../lib/barter'
import { toAtomic, fromAtomic } from '../lib/amount'
import { formatCredit, formatTime } from '../lib/format'
import { describeMarketError } from '../lib/marketError'
import { useWallet } from '../wallet/WalletContext'

// FE-029: daily access rental (pipeline P2, ADR-47), from the broker README (BE-060). The provider prepares the scope and rental listing; the renter sees the access state, today's cost, checks
// the access before paying for the next day (the only rule is in the SDK: `checkAccessBeforeNextDay`), and stops the rental. Daily payment is made by the x402 client or agent, not this page.
// The six providers are the adapters the broker ships (ADR-47); a new kind of access needs a new broker adapter first, so the page offers exactly these.
export const PROVIDERS: Record<string, { label: string; short: string; what: string; costly: boolean; note: string }> = {
  github: { label: 'GitHub (repo collaborator or org seat)', short: 'GitHub', what: 'Repo or org seat', costly: true, note: 'GitHub terms restrict account sharing; collaborators and org seats are not password sharing. You are responsible for your own org policy.' },
  discord: { label: 'Discord (server role)', short: 'Discord', what: 'Server role', costly: false, note: 'A role is only for existing server members; Discord terms forbid selling accounts, not roles.' },
  ssh: { label: 'SSH (key with command= and expiry)', short: 'SSH', what: 'Key with expiry', costly: false, note: 'The key is valid until the end of the paid day on your own machine, even if the broker is down.' },
  's3-presigned': { label: 'S3 (presigned URL)', short: 'S3', what: 'Presigned link', costly: false, note: 'A presigned URL cannot be revoked; the loss is at most one day.' },
  'aws-sts': { label: 'AWS (role with permission boundary)', short: 'AWS', what: 'Bounded role', costly: true, note: 'A session cannot be revoked before it expires. Real costs are billed per day with a daily cap.' },
  mock: { label: 'Mock provider (demo)', short: 'Demo', what: 'Touches nothing', costly: false, note: 'Demo only; touches no real service.' },
}
/** B4-F5 (review batch 4): the reference of the lessee as the broker can prove it. An SSH key must be `ssh-ed25519` (the proof is a raw ed25519 signature); a key of another type is accepted by the contract and by the broker's first check but can never be proven, so the grant could never open. */
export function granteeRefProblem(provider: string, ref: string): string | null {
  const text = ref.trim()
  if (text === '') return null
  if (provider === 'ssh') {
    if (!text.startsWith('ssh-ed25519 ')) return `Only ssh-ed25519 keys can be proven; ${text.split(/\s+/)[0]?.slice(0, 30) || 'this key'} cannot, so this rent would never open. Create a new key with ssh-keygen -t ed25519.`
    try {
      parseSshEd25519(text)
    } catch {
      return 'Invalid ssh-ed25519 key line (blob does not match).'
    }
  }
  if (provider === 'github' && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(text)) return 'Not a GitHub login.'
  if (provider === 'discord' && !/^\d{15,21}$/.test(text)) return 'Not a Discord user id (a number of 15 to 21 digits).'
  return null
}
const STATUS_LABEL: Record<string, string> = { active: 'Active', revoke_pending: 'Revocation pending', revoked: 'Revoked' }
const STATUS_TONE: Record<string, { tone: 'ok' | 'warn' | 'bad'; hex: string }> = { active: { tone: 'ok', hex: '#2f9e5b' }, revoke_pending: { tone: 'warn', hex: '#c98a12' }, revoked: { tone: 'bad', hex: '#c4455a' } }
const now = () => Math.floor(Date.now() / 1000)
const DAY_MS = 86_400_000

/** The next seven UTC days as a strip: a day is filled as far as it is paid, and a line marks now inside today. Rent is paid by the day, so the strip is the bill. */
function PaidDays({ paidUntil }: { paidUntil: string }) {
  const [nowMs] = useState(() => Date.now())
  const end = Date.parse(paidUntil)
  if (Number.isNaN(end)) return null
  const t0 = nowMs - (nowMs % DAY_MS) // the start of today in UTC
  const nowAt = ((nowMs - t0) / DAY_MS) * 100
  const days = Array.from({ length: 7 }, (_, i) => t0 + i * DAY_MS)
  const paidDays = Math.max(0, Math.ceil((end - t0) / DAY_MS))
  return (
    <div className="paid-days" role="img" aria-label={paidDays === 0 ? 'Not paid for today' : `Paid for ${paidDays} ${paidDays === 1 ? 'day' : 'days'}, until ${formatTime(paidUntil)}`}>
      {days.map((d, i) => {
        const paid = Math.min(1, Math.max(0, (end - d) / DAY_MS))
        return (
          <span key={d} className="paid-day" data-today={i === 0 ? 'true' : undefined} aria-hidden="true">
            <span className="paid-track"><span className="paid-fill" style={{ width: `${paid * 100}%` }} />{i === 0 && <span className="paid-now" style={{ left: `${nowAt}%` }} />}</span>
            <small>{i === 0 ? 'Today' : new Date(d).toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' })}</small>
          </span>
        )
      })}
    </div>
  )
}

function Offer() {
  const [provider, setProvider] = useState('github')
  const [resource, setResource] = useState('')
  const [permission, setPermission] = useState('')
  const [price, setPrice] = useState('')
  const [cap, setCap] = useState('')
  const [ref, setRef] = useState('')
  const refProblem = granteeRefProblem(provider, ref)
  const info = PROVIDERS[provider]!
  const priceAtomic = toAtomic(price)
  const capAtomic = cap.trim() === '' ? null : toAtomic(cap)
  // An untouched price is not a mistake yet: the form asks for it instead of opening on an error.
  const noPrice = price.trim() === ''
  const problem = refProblem !== null ? refProblem : noPrice ? null : priceAtomic === null ? 'Price per day must be a credit number > 0.' : info.costly && capAtomic === null ? 'Costly access must have a daily spending cap (daily_cap) > 0.' : null
  const scope = { provider, grantee_ref: ref.trim() === '' ? '<filled in by the lessee at offer_grant>' : ref.trim(), ...(resource.trim() ? { resource: resource.trim() } : {}), ...(permission.trim() ? { permission: permission.trim() } : {}), ...(capAtomic !== null ? { daily_cap: capAtomic } : {}) }
  const detail = JSON.stringify({ kind: 'access-rent', provider, ...(resource.trim() ? { resource: resource.trim() } : {}), ...(permission.trim() ? { permission: permission.trim() } : {}), price_per_day: priceAtomic, ...(capAtomic !== null ? { daily_cap: capAtomic } : {}) })
  return (
    <section className="form" aria-label="Offer access rent">
      {/* FE-072: the provider is picked from tiles (one tap, the name and what is rented), not from a long dropdown */}
      <fieldset className="provider-tiles">
        <legend>Provider</legend>
        {Object.entries(PROVIDERS).map(([k, v]) => (
          <label key={k} className="provider-tile" title={v.label} data-costly={v.costly ? 'true' : undefined}>
            <input type="radio" name="rent-provider" value={k} checked={provider === k} onChange={() => setProvider(k)} />
            <span className="provider-glyph" aria-hidden="true" style={{ ['--tone' as string]: PROVIDER_GLYPHS[k]?.tone }}><ProviderIcon provider={k} size={22} /></span>
            <strong>{v.short}</strong>
            <small>{v.what}</small>
          </label>
        ))}
      </fieldset>
      <p className="state" role="note" data-testid="rent-provider-note">{info.note}</p>
      <div className="field-pair">
        <label><span>Resource</span><input value={resource} onChange={(e) => setResource(e.target.value)} placeholder={provider === 'github' ? 'owner/repo' : provider === 'discord' ? 'role id' : provider === 'ssh' ? 'command' : 'object'} /></label>
        <label><span>Permission</span><input value={permission} onChange={(e) => setPermission(e.target.value)} placeholder="pull" /></label>
      </div>
      <div className="field-pair">
        <label><span>Price per day (credit)</span><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" /></label>
        <label><span>Daily spending cap {info.costly ? '(required)' : '(optional)'}</span><input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" /></label>
      </div>
      <label><span>Lessee reference (optional)</span><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={provider === 'ssh' ? 'ssh-ed25519 AAAA…' : provider === 'discord' ? '123456789012345678' : 'Empty: the lessee fills it in'} /></label>
      {problem && <p className="state state-error" role="alert" data-testid="rent-offer-error">{problem}</p>}
      {!problem && noPrice && <p className="state" data-testid="rent-offer-hint">Enter a price per day to see the listing.</p>}
      {!problem && !noPrice && (
        <>
          <p className="rent-price">
            <strong>{formatCredit(priceAtomic!)}</strong> credit / day
            {capAtomic !== null && <span>cost cap {fromAtomic(capAtomic)}</span>}
          </p>
          <details className="tech">
            <summary>For your broker: scope and listing detail</summary>
            <p>Scope for <code>offer_grant</code> (<code>limits.scope</code>). The lessee fills in <code>grantee_ref</code>, locked on-chain.</p>
            <pre data-testid="rent-scope">{JSON.stringify(scope)}</pre>
            <p>Listing detail:</p>
            <pre data-testid="rent-detail">{detail}</pre>
          </details>
        </>
      )}
    </section>
  )
}

// FE-029, BE-057: the proof that the renter controls the reference `grantee_ref`. The broker is not trusted for the text that is signed: it is built again here from the circle of the
// configuration, the grant and the reference that the page shows, and only the nonce comes from the broker. The payment of the day and the field `proof` of
// `POST /grants/{id}/access` are sent by the x402 client or the agent of the renter; this panel only builds the text of the proof.
/** The three states of the reference of the lessee (batch 4, B4-F7): proven, not proven, and not applicable (the provider has no proof at all). */
export function proofKind(proof: string | null): 'verified' | 'unproven' | 'not_applicable' | 'unknown' {
  if (proof === 'verified') return 'verified'
  if (proof === 'not_applicable') return 'not_applicable'
  if (proof !== null && proof.startsWith('unproven')) return 'unproven'
  return 'unknown'
}
function ProofState({ proof, warnings }: { proof: string | null; warnings: string[] }) {
  const kind = proofKind(proof)
  const warned = warnings.includes('grantee_unproven')
  const text = {
    verified: 'Reference proven. The broker checked that you control it.',
    unproven: `Reference not yet proven (${proof}). Access opens with the grantee_unproven warning, and anyone using that name looks like you.`,
    not_applicable: 'This provider has no way to prove ownership. The grantee_unproven warning is expected; this is not a proof failure.',
    unknown: 'No proof statement from the broker yet.',
  }[kind]
  const pill = { verified: ['ok', 'Proven'], unproven: ['bad', 'Not proven'], not_applicable: ['info', 'Not applicable'], unknown: ['info', 'No statement'] }[kind]
  return (
    <p role="status" data-testid="rent-proof-state" data-proof={kind} className={kind === 'unproven' ? 'state state-error' : 'state'}>
      <span className="pill" data-tone={pill[0]}>{pill[1]}</span> {text}{warned && kind === 'verified' ? ' The broker still shows a warning.' : ''}
    </p>
  )
}

function GranteeProofPanel({ view, voucherKey, account }: { view: RentView; voucherKey: string; account: string | null }) {
  const [challenge, setChallenge] = useState<RentChallenge | null>(null)
  const [gist, setGist] = useState('')
  const [signature, setSignature] = useState('')
  const [proof, setProof] = useState<string | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const kind: GranteeProof['kind'] | null = view.provider === 'github' ? 'near-gist' : view.provider === 'ssh' ? 'ssh-signature' : view.provider === 'discord' ? 'oauth' : null

  async function fetchChallenge() {
    setError(null)
    setProof(null)
    setContent(null)
    try {
      const c = await api.rentChallenge(view.grantId)
      if (c.required) {
        if (c.grantId !== view.grantId || c.circle !== CONTRACT_ID || c.granteeRef !== view.granteeRef || typeof c.nonce !== 'string') throw new Error('The broker challenge is not for this grant, circle, or reference: not signed.')
        const expected = granteeChallenge({ circle: CONTRACT_ID, grantId: view.grantId, granteeRef: view.granteeRef, nonce: c.nonce })
        if (c.challenge !== expected) throw new Error('The challenge text from the broker differs from the one computed here: not signed.')
      }
      setChallenge(c)
    } catch (e) {
      setChallenge(null)
      setError(describeMarketError(e))
    }
  }
  const input = () => ({ circle: CONTRACT_ID, grantId: view.grantId, granteeRef: view.granteeRef, nonce: challenge!.nonce! })
  function makeContent() {
    setError(null)
    try {
      if (account === null) throw new Error('Sign in with a wallet first.')
      setContent(buildGistContent(input(), account, voucherKey))
    } catch (e) {
      setError(e instanceof GranteeProofError ? e.message : describeMarketError(e))
    }
  }
  function makeProof() {
    setError(null)
    try {
      const text = encodeGranteeProof(kind === 'near-gist' ? { kind, gist: gist.trim() } : { kind: 'ssh-signature', signature: signature.trim() })
      parseGranteeProof(text) // the broker would refuse a malformed proof and use up the challenge: fail here instead
      setProof(text)
    } catch (e) {
      setProof(null)
      setError(e instanceof GranteeProofError ? e.message : describeMarketError(e))
    }
  }
  return (
    <div className="actions" data-testid="rent-proof-panel">
      <h3>Reference ownership</h3>
      <ProofState proof={view.proof ?? null} warnings={view.warnings ?? []} />
      {kind === null && <p className="state">This provider does not use proof from this page.</p>}
      {kind === 'oauth' && <p className="state">Discord proves ownership with OAuth on the provider side. This page stores no tokens.</p>}
      {(kind === 'near-gist' || kind === 'ssh-signature') && (
        <>
          <div><button type="button" className="quiet" onClick={() => void fetchChallenge()}>Fetch challenge from broker</button></div>
          {challenge && !challenge.required && <p className="state" data-testid="rent-challenge-none">The broker asks for no proof for this grant.</p>}
          {challenge?.required && (
            <>
              <p className="state state-warn" role="note">Valid until {challenge.expiresAt}. One try only: the first proof checked uses up this challenge.</p>
              <details className="tech">
                <summary>Challenge text</summary>
                <pre data-testid="rent-challenge">{challenge.challenge}</pre>
              </details>
              {kind === 'near-gist' ? (
                <>
                  <div><button type="button" disabled={voucherKey.trim() === ''} onClick={makeContent}>Sign for gist</button></div>
                  {content && (
                    <details className="tech" open>
                      <summary>Gist content</summary>
                      <p>Put this in one file of a public gist owned by GitHub account <code>{view.granteeRef}</code>.</p>
                      <pre data-testid="rent-gist-content">{content}</pre>
                    </details>
                  )}
                  <label><span>Gist ID</span><input value={gist} onChange={(e) => setGist(e.target.value)} placeholder="0123abcd…" /></label>
                </>
              ) : (
                <label><span>ed25519 signature of the challenge by the SSH key (base64; made on your machine with <code>signSshChallenge</code>)</span><input value={signature} onChange={(e) => setSignature(e.target.value)} /></label>
              )}
              <div><button type="button" disabled={kind === 'near-gist' ? gist.trim() === '' : signature.trim() === ''} onClick={makeProof}>Build proof</button></div>
            </>
          )}
          {proof && (
            <details className="tech" open>
              <summary>Proof text</summary>
              <p>Your x402 client or agent sends this as <code>proof</code> on <code>POST /grants/{view.grantId}/access</code> on the first day.</p>
              <pre data-testid="rent-proof">{proof}</pre>
            </details>
          )}
          {error && <p className="state state-error" role="alert" data-testid="rent-proof-error">{error}</p>}
        </>
      )}
    </div>
  )
}

function Renter({ voucherKey, onVoucherKey }: { voucherKey: string; onVoucherKey: (v: string) => void }) {
  const { account } = useWallet()
  const [id, setId] = useState('')
  const [view, setView] = useState<RentView | null>(null)
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const grantId = Number(id)
  const valid = /^[1-9]\d{0,9}$/.test(id.trim())

  async function load() {
    setError(null)
    setCheck(null)
    setMessage(null)
    try {
      setView(await api.rent(grantId))
    } catch (e) {
      setView(null)
      setError(describeMarketError(e))
    }
  }
  async function checkNext() {
    if (!view) return
    try {
      await checkAccessBeforeNextDay({ grantId: view.grantId, view: { grantId: view.grantId, status: view.status, paidUntil: Date.parse(view.paidUntil) }, nowMs: Date.now() })
      setCheck({ ok: true, text: `The broker reports access until ${formatTime(view.paidUntil)}. That is its word, not proof from the provider. Try the access with the provider today, then pay for the next day through your x402 client or agent.` })
    } catch (e) {
      setCheck({ ok: false, text: e instanceof RentError ? `${e.code}: the next day is not paid.` : String(e) })
    }
  }
  async function stop() {
    if (!account || !view) return
    setError(null)
    try {
      const notice = { circle: CONTRACT_ID, grant_id: view.grantId, actor: account, action: 'stop', at: now() }
      const next = await api.stopRent(view.grantId, notice, await signMessageWithVoucher(JSON.stringify(notice), CONTRACT_ID, voucherKey))
      setView(next)
      setMessage('Stop-rent sent. Access ends today or sooner.')
    } catch (e) {
      setError(describeMarketError(e))
    }
  }
  return (
    <section className="form" aria-label="My access">
      <h2 className="sr-only">My rentals</h2>
      <label><span>Grant number</span><input value={id} onChange={(e) => setId(e.target.value)} inputMode="numeric" /></label>
      {BROKER_URL === null && <p className="state" role="status" data-testid="no-broker">{describeMarketError(new ApiError(0, 'broker_not_configured', ''))}</p>}
      <div><button type="button" disabled={!valid || BROKER_URL === null} onClick={() => void load()}>View access</button></div>
      {view && (
        <div className="actions" data-testid="rent-view">
          {/* FE-083: the rental reads as a pass for one service: its mark on the service's colour, who it is for, and the days already paid. */}
          <div className="access-pass" style={{ ['--tone' as string]: PROVIDER_GLYPHS[view.provider]?.tone ?? PAGE_HUE['/rent'] }}>
            <div className="pass-head">
              <span className="pass-mark" aria-hidden="true"><ProviderIcon provider={view.provider} size={26} /></span>
              <span className="pass-name">
                <strong>{PROVIDERS[view.provider]?.short ?? view.provider}</strong>
                <small>{PROVIDERS[view.provider]?.what ?? 'Access'}</small>
              </span>
              <span className="pill" data-tone={STATUS_TONE[view.status]?.tone ?? 'info'}>{STATUS_LABEL[view.status] ?? view.status}</span>
            </div>
            <p className="pass-ref"><span className="row-sub">For</span> <code>{view.granteeRef.length > 30 ? `${view.granteeRef.slice(0, 16)}…${view.granteeRef.slice(-10)}` : view.granteeRef}</code></p>
            {view.reason && <p className="item-meta">Reason: {view.reason}</p>}
            <PaidDays paidUntil={view.paidUntil} />
          </div>
          <dl className="figures">
            <div><dt>Paid until</dt><dd>{formatTime(view.paidUntil)}</dd></div>
            <div><dt>Cost today</dt><dd data-testid="rent-today">{view.today?.cost == null ? 'no cost' : `${formatCredit(view.today.cost)} credit`}</dd></div>
            {view.today?.billed != null && <div><dt>Billed</dt><dd>{formatCredit(view.today.billed)} credit</dd></div>}
          </dl>
          {view.revokePending && <p className="state state-error" role="status">Revocation pending: attempt {view.revokePending.attempts}{view.revokePending.lastError ? ` (${view.revokePending.lastError})` : ''}.</p>}
          {check && (
            <p className={check.ok ? 'state' : 'state state-error'} role="status" data-testid="rent-check">
              <span className="pill" data-tone={check.ok ? 'ok' : 'bad'}>{check.ok ? 'Access running' : 'Not paid'}</span> {check.text}
            </p>
          )}
          <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />
          <button type="button" onClick={() => void checkNext()}>Check before paying</button>
          <button type="button" className="quiet" disabled={!account || voucherKey.trim() === '' || view.status === 'revoked'} onClick={() => void stop()}>Stop rent</button>
          <details className="tech">
            <summary>Technical details</summary>
            <dl className="status-panel">
              <dt>Grant</dt><dd>{view.grantId}</dd>
              <dt>Provider</dt><dd>{view.provider}</dd>
              <dt>Reference</dt><dd><code>{view.granteeRef}</code></dd>
              <dt>Paid until</dt><dd>{view.paidUntil}</dd>
            </dl>
          </details>
          <GranteeProofPanel view={view} voucherKey={voucherKey} account={account} />
        </div>
      )}
      {message && <p className="state" role="status">{message}</p>}
      {error && <p className="state state-error" role="alert">{error}</p>}
    </section>
  )
}

// FE-072: two views (lend access, or the access you rent) instead of both forms on one long page; both stay in the page and only hide with CSS.
const RENT_VIEWS = [['offer', 'Offer access'], ['mine', 'My rentals']] as const
export function Rent() {
  const [voucherKey, setVoucherKey] = useState('')
  const [tab, setTab] = useState<'offer' | 'mine'>('offer')
  return (
    <>
    {/* FE-080: the same lead as the other trade pages (a side rail on a wide screen); the marks say what each day does instead of a number. */}
    <div className="page-lead">
      <span className="tone-tile" aria-hidden="true" style={{ ['--tone' as string]: PAGE_HUE['/rent'] }}>
        <NavIcon name="/rent" size={22} />
      </span>
      <p>Lend access to an account by the day, or use access you rent. Either side can stop any day.</p>
      <ol className="lead-steps rent-days" aria-label="How a rent runs">
        <li data-mark="1">Pay one day</li>
        <li data-mark="✓">Access works</li>
        <li data-mark="↻">Pay the next day</li>
        <li data-mark="✕" data-tone="stop">Stop any day</li>
      </ol>
    </div>
    <div className="market rent" data-view={tab}>
      <div className="view-tabs">
        <div className="segmented market-views" role="group" aria-label="Rent view">
          {RENT_VIEWS.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={tab === v} onClick={() => setTab(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="market-pane" data-pane="offer">
        <Offer />
      </div>
      <div className="market-pane" data-pane="mine">
        <Renter voucherKey={voucherKey} onVoucherKey={setVoucherKey} />
      </div>
    </div>
    </>
  )
}
