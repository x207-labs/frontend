import { GranteeProofError, RentError, buildGistContent, parseSshEd25519, checkAccessBeforeNextDay, encodeGranteeProof, granteeChallenge, parseGranteeProof, type GranteeProof } from '@x207/core'
import { useState } from 'react'
import { api } from '../api/client'
import type { RentChallenge, RentView } from '../api/types'
import { VoucherKeyField } from '../components/VoucherKeyField'
import { CONTRACT_ID } from '../config'
import { signMessageWithVoucher } from '../lib/barter'
import { toAtomic, fromAtomic } from '../lib/amount'
import { formatCredit } from '../lib/format'
import { describeMarketError } from '../lib/marketError'
import { useWallet } from '../wallet/WalletContext'

// FE-029: sewa akses harian (pipeline P2, ADR-47), dari README broker (BE-060). Pemberi menyiapkan scope dan listing sewa; penyewa melihat keadaan akses, biaya hari ini, memeriksa
// akses sebelum membayar hari berikutnya (aturan satu-satunya ada di SDK: `checkAccessBeforeNextDay`), dan berhenti sewa. Pembayaran harian dilakukan klien x402 atau agent, bukan halaman ini.
export const PROVIDERS: Record<string, { label: string; costly: boolean; note: string }> = {
  github: { label: 'GitHub (repo collaborator or org seat)', costly: true, note: 'GitHub terms restrict account sharing; collaborators and org seats are not password sharing. You are responsible for your own org policy.' },
  discord: { label: 'Discord (server role)', costly: false, note: 'A role is only for existing server members; Discord terms forbid selling accounts, not roles.' },
  ssh: { label: 'SSH (key with command= and expiry)', costly: false, note: 'The key is valid until the end of the paid day on your own machine, even if the broker is down.' },
  's3-presigned': { label: 'S3 (presigned URL)', costly: false, note: 'A presigned URL cannot be revoked; the loss is at most one day.' },
  'aws-sts': { label: 'AWS (role with permission boundary)', costly: true, note: 'A session cannot be revoked before it expires. Real costs are billed per day with a daily cap.' },
  mock: { label: 'Mock provider (demo)', costly: false, note: 'Demo only; touches no real service.' },
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
const now = () => Math.floor(Date.now() / 1000)

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
  const problem = refProblem !== null ? refProblem : priceAtomic === null ? 'Price per day must be a credit number > 0.' : info.costly && capAtomic === null ? 'Costly access must have a daily spending cap (daily_cap) > 0.' : null
  const scope = { provider, grantee_ref: ref.trim() === '' ? '<filled in by the lessee at offer_grant>' : ref.trim(), ...(resource.trim() ? { resource: resource.trim() } : {}), ...(permission.trim() ? { permission: permission.trim() } : {}), ...(capAtomic !== null ? { daily_cap: capAtomic } : {}) }
  const detail = JSON.stringify({ kind: 'access-rent', provider, ...(resource.trim() ? { resource: resource.trim() } : {}), ...(permission.trim() ? { permission: permission.trim() } : {}), price_per_day: priceAtomic, ...(capAtomic !== null ? { daily_cap: capAtomic } : {}) })
  return (
    <section className="form" aria-label="Offer access rent">
      <h3>Offer access rent (grantor)</h3>
      <label><span>Provider</span><select value={provider} onChange={(e) => setProvider(e.target.value)}>{Object.entries(PROVIDERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
      <label><span>Lessee reference (grantee_ref; empty = filled in at offer_grant)</span><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={provider === 'ssh' ? 'ssh-ed25519 AAAA…' : provider === 'discord' ? '123456789012345678' : 'login'} /></label>
      <label><span>Resource (repo, role, command, object)</span><input value={resource} onChange={(e) => setResource(e.target.value)} /></label>
      <label><span>Permission</span><input value={permission} onChange={(e) => setPermission(e.target.value)} placeholder="pull" /></label>
      <label><span>Price per day (credit)</span><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" /></label>
      <label><span>Daily spending cap at the provider (credit){info.costly ? ' · required' : ' · optional'}</span><input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" /></label>
      <p className="state" role="note" data-testid="rent-provider-note">{info.note} The provider admin token stays on your machine: the grantor runs the broker themselves.</p>
      {problem && <p className="state state-error" role="alert" data-testid="rent-offer-error">{problem}</p>}
      {!problem && (
        <>
          <p>Scope for <code>offer_grant</code> (<code>limits.scope</code>); the lessee fills in <code>grantee_ref</code>, and that reference is locked on-chain:</p>
          <pre data-testid="rent-scope">{JSON.stringify(scope)}</pre>
          <p>Listing detail:</p>
          <pre data-testid="rent-detail">{detail}</pre>
          <p>Per day: {formatCredit(priceAtomic!)} credit{capAtomic !== null ? `, real cost cap ${fromAtomic(capAtomic)} credit` : ''}. A lessee who stops paying loses access at the end of the paid day.</p>
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
    verified: 'Reference proven: the broker has checked that you control it.',
    unproven: `Reference not yet proven (${proof}). Access is opened with the grantee_unproven warning; anyone who knows that account name cannot be told apart from you.`,
    not_applicable: 'This provider has no way to prove who owns the reference, so there is no proof statement. Access is opened with the grantee_unproven warning; this is not a proof failure.',
    unknown: 'No proof statement from the broker yet.',
  }[kind]
  return (
    <p role="status" data-testid="rent-proof-state" data-proof={kind} className={kind === 'unproven' ? 'state state-error' : 'state'}>
      {text}{warned && kind === 'verified' ? ' (the broker still gives a warning.)' : ''}
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
    <div data-testid="rent-proof-panel">
      <h4>Proof of reference ownership</h4>
      <ProofState proof={view.proof ?? null} warnings={view.warnings ?? []} />
      {kind === null && <p className="state">This provider does not use proof from this page.</p>}
      {kind === 'oauth' && <p className="state">Discord proof via OAuth is made on the provider side; this page does not store OAuth tokens.</p>}
      {(kind === 'near-gist' || kind === 'ssh-signature') && (
        <>
          <div><button type="button" onClick={() => void fetchChallenge()}>Fetch challenge from broker</button></div>
          {challenge && !challenge.required && <p className="state" data-testid="rent-challenge-none">The broker does not ask for proof for this grant.</p>}
          {challenge?.required && (
            <>
              <pre data-testid="rent-challenge">{challenge.challenge}</pre>
              <p className="state">Valid until {challenge.expiresAt}. The first proof checked uses up this challenge; a proof cannot be retried.</p>
              {kind === 'near-gist' ? (
                <>
                  <div><button type="button" disabled={voucherKey.trim() === ''} onClick={makeContent}>Sign for gist</button></div>
                  {content && <><p>Content of the public gist owned by GitHub account <code>{view.granteeRef}</code> (one file):</p><pre data-testid="rent-gist-content">{content}</pre></>}
                  <label><span>Gist ID</span><input value={gist} onChange={(e) => setGist(e.target.value)} placeholder="0123abcd…" /></label>
                </>
              ) : (
                <label><span>ed25519 signature of the challenge by the SSH key (base64; made on your machine with <code>signSshChallenge</code>)</span><input value={signature} onChange={(e) => setSignature(e.target.value)} /></label>
              )}
              <div><button type="button" disabled={kind === 'near-gist' ? gist.trim() === '' : signature.trim() === ''} onClick={makeProof}>Build proof</button></div>
            </>
          )}
          {proof && <><p>Send this text as <code>proof</code> on <code>POST /grants/{view.grantId}/access</code> on the first day (your x402 client or agent):</p><pre data-testid="rent-proof">{proof}</pre></>}
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
      setCheck({ ok: true, text: `The broker reports access running until ${view.paidUntil}. That is the broker's statement, not proof from the provider (the broker may revoke earlier): try the access directly with the provider today, then pay for the next day only once a day through your x402 client or agent.` })
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
      setMessage('Stop-rent sent: access is revoked at the end of today or now.')
    } catch (e) {
      setError(describeMarketError(e))
    }
  }
  return (
    <section className="form" aria-label="My access">
      <h3>My access (lessee)</h3>
      <label><span>Grant number</span><input value={id} onChange={(e) => setId(e.target.value)} inputMode="numeric" /></label>
      <div><button type="button" disabled={!valid} onClick={() => void load()}>View access</button></div>
      {view && (
        <div data-testid="rent-view">
          <dl className="status-panel">
            <dt>Provider</dt><dd>{view.provider} · <code>{view.granteeRef}</code></dd>
            <dt>Status</dt><dd>{STATUS_LABEL[view.status] ?? view.status}{view.reason ? ` (${view.reason})` : ''}</dd>
            <dt>Paid until</dt><dd>{view.paidUntil}</dd>
            <dt>Real cost today</dt><dd data-testid="rent-today">{view.today?.cost == null ? 'no cost' : `${formatCredit(view.today.cost)} credit`}{view.today?.billed != null && ` · billed ${formatCredit(view.today.billed)}`}</dd>
          </dl>
          {view.revokePending && <p className="state state-error" role="status">Revocation pending: attempt {view.revokePending.attempts}{view.revokePending.lastError ? ` (${view.revokePending.lastError})` : ''}.</p>}
          <div className="actions">
            <button type="button" onClick={() => void checkNext()}>Check before paying the next day</button>
            <button type="button" disabled={!account || voucherKey.trim() === '' || view.status === 'revoked'} onClick={() => void stop()}>Stop rent</button>
          </div>
          {check && <p className={check.ok ? 'state' : 'state state-error'} role="status" data-testid="rent-check">{check.text}</p>}
          <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />
          <GranteeProofPanel view={view} voucherKey={voucherKey} account={account} />
        </div>
      )}
      {message && <p className="state" role="status">{message}</p>}
      {error && <p className="state state-error" role="alert">{error}</p>}
    </section>
  )
}

export function Rent() {
  const [voucherKey, setVoucherKey] = useState('')
  return (
    <>
      <h2>Access rent</h2>
      <p className="state">Access is rented per day: pay one day in advance, and the next day only if access is still running, so each party loses at most one day.</p>
      <Offer />
      <Renter voucherKey={voucherKey} onVoucherKey={setVoucherKey} />
    </>
  )
}
