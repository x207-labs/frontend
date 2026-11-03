import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sshEd25519Line, buildGistContent, granteeChallenge, parseGranteeProof, signSshChallenge } from '@x207/core'
import { describe, expect, it } from 'vitest'
import { CONTRACT_ID } from '../config'
import { ApiError } from '../api/client'
import { describeMarketError } from '../lib/marketError'
import { granteeRefProblem, proofKind } from './Rent'
import { base58Encode } from '../lib/barter'
import { renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const RENTER = 'renter.x207-circle.near'
const KEY = `ed25519:${base58Encode(Uint8Array.from(new Array<number>(32).fill(8)))}`
const view = (over: Record<string, unknown> = {}) => ({
  grantId: 7, provider: 'github', granteeRef: 'octocat', status: 'active', paidUntil: new Date(Date.now() + 3_600_000).toISOString(), providerExpiresAt: null, reason: null, revokePending: null,
  today: { day: '2026-11-04', cost: '1500000', billed: null }, unit: 'credit', decimals: 6, ...over,
})
const broker = (body: object) => (p: string, init?: RequestInit) => {
  if (p === '/grants/7/access' && !init?.method) return { status: 200, body }
  if (p === '/grants/7/access/stop' && init?.method === 'POST') return { status: 200, body: { ...body, status: 'revoked' } }
  return undefined
}
const open = async (user: ReturnType<typeof userEvent.setup>, body: object) => {
  const r = renderApp('/rent', broker(body), false, createMockWallet(RENTER, RENTER))
  const section = await screen.findByRole('region', { name: 'My access' })
  await user.type(within(section).getByLabelText('Grant number'), '7')
  await user.click(within(section).getByRole('button', { name: 'View access' }))
  await within(section).findByTestId('rent-view')
  return { section, ...r }
}

describe('FE-029 daily rent of an access', () => {
  it('TC-FE-029-01 the lender gets the scope for offer_grant and the detail of the listing; a costly provider needs a daily cap and the note of its terms', async () => {
    const user = userEvent.setup()
    renderApp('/rent', undefined, false, createMockWallet(RENTER, RENTER))
    const form = await screen.findByRole('region', { name: 'Offer access rent' })
    await user.type(within(form).getByLabelText(/^Resource/), 'x207-labs/contracts')
    await user.type(within(form).getByLabelText(/^Permission/), 'pull')
    await user.type(within(form).getByLabelText(/^Price per day/), '2')
    expect(within(form).getByTestId('rent-provider-note')).toHaveTextContent('GitHub terms')
    expect(within(form).getByTestId('rent-offer-error')).toHaveTextContent('must have a daily spending cap') // github is costly
    await user.type(within(form).getByLabelText(/^Daily spending cap/), '5')
    expect(JSON.parse(within(form).getByTestId('rent-scope').textContent!)).toEqual({ provider: 'github', grantee_ref: '<filled in by the lessee at offer_grant>', resource: 'x207-labs/contracts', permission: 'pull', daily_cap: '5000000' })
    expect(JSON.parse(within(form).getByTestId('rent-detail').textContent!)).toEqual({ kind: 'access-rent', provider: 'github', resource: 'x207-labs/contracts', permission: 'pull', price_per_day: '2000000', daily_cap: '5000000' })
    await user.selectOptions(within(form).getByLabelText('Provider'), 'ssh')
    expect(within(form).getByTestId('rent-provider-note')).toHaveTextContent('The key is valid until the end of the paid day')
  })

  it('TC-FE-029-02 the renter sees the state of the access, the real cost of today, and a pending revoke; the check before the next day passes for an active paid access', async () => {
    const user = userEvent.setup()
    const { section } = await open(user, view())
    expect(within(section).getByTestId('rent-view')).toHaveTextContent('Active')
    expect(within(section).getByTestId('rent-today')).toHaveTextContent('1.5 credit')
    await user.click(within(section).getByRole('button', { name: /Check before paying/ }))
    expect(within(section).getByTestId('rent-check')).toHaveTextContent('not proof from the provider')
  })

  it('TC-FE-029-03 an access taken back early or not paid any more is not paid for the next day, with the code of the SDK', async () => {
    const user = userEvent.setup()
    const revoked = await open(user, view({ status: 'revoked', reason: 'owner_revoked' }))
    await user.click(within(revoked.section).getByRole('button', { name: /Check before paying/ }))
    expect(within(revoked.section).getByTestId('rent-check')).toHaveTextContent('rent_access_not_active')
    revoked.unmount()
    const expired = await open(user, view({ paidUntil: new Date(Date.now() - 60_000).toISOString() }))
    await user.click(within(expired.section).getByRole('button', { name: /Check before paying/ }))
    expect(within(expired.section).getByTestId('rent-check')).toHaveTextContent('rent_access_expired')
  })

  it('TC-FE-029-04 stopping the rent posts a notice with the keys circle, grant_id, actor, action, at, signed in the browser; the key is not sent', async () => {
    const user = userEvent.setup()
    const { section, requests } = await open(user, view())
    await user.type(within(section).getByLabelText(/Voucher key/), KEY)
    await user.click(within(section).getByRole('button', { name: 'Stop rent' }))
    await within(section).findByText(/Stop-rent sent/)
    const post = requests().find((r) => r.method === 'POST')!
    expect(post.path).toMatch(/\/grants\/7\/access\/stop$/)
    expect(Object.keys(post.body.notice)).toEqual(['circle', 'grant_id', 'actor', 'action', 'at'])
    expect(post.body.notice).toMatchObject({ grant_id: 7, actor: RENTER, action: 'stop' })
    expect(post.body.signature).toMatch(/^ed25519:/)
    expect(JSON.stringify(post.body)).not.toContain(KEY)
    await waitFor(() => expect(within(section).getByTestId('rent-view')).toHaveTextContent('Revoked'))
  })

  it('TC-FE-029-05 a revoke that failed is shown as pending with the attempts, and an unknown grant shows the error code of the broker', async () => {
    const user = userEvent.setup()
    const { section } = await open(user, view({ status: 'revoke_pending', revokePending: { attempts: 2, nextRetryAt: '2026-11-04T10:02:00Z', lastError: 'provider_unavailable' } }))
    expect(within(section).getByText(/Revocation pending: attempt 2/)).toBeInTheDocument()
    renderApp('/rent', (p) => (p === '/grants/9/access' ? { status: 404, body: { error: 'access_not_found', message: 'no access yet' } } : undefined), false, createMockWallet(RENTER, RENTER))
    const sections = await screen.findAllByRole('region', { name: 'My access' })
    const second = sections[sections.length - 1]!
    await user.type(within(second).getByLabelText('Grant number'), '9')
    await user.click(within(second).getByRole('button', { name: 'View access' }))
    expect(await within(second).findByRole('alert')).toHaveTextContent('access_not_found')
  })

  // BE-057: the proof of the reference
  const NONCE = 'nonce-12345678'
  const challengeBody = (over: Record<string, unknown> = {}) => {
    const granteeRef = String(over.granteeRef ?? 'octocat')
    return { required: true, grantId: 7, circle: CONTRACT_ID, granteeRef, nonce: NONCE, challenge: granteeChallenge({ circle: CONTRACT_ID, grantId: 7, granteeRef, nonce: NONCE }), expiresAt: '2026-11-04T10:15:00Z', ...over }
  }
  const withChallenge = (body: object, challenge: object) => (p: string, init?: RequestInit) => (p === '/grants/7/access/challenge' && !init?.method ? { status: 200, body: challenge } : broker(body)(p, init))
  const openWith = async (user: ReturnType<typeof userEvent.setup>, body: object, challenge: object) => {
    const r = renderApp('/rent', withChallenge(body, challenge), false, createMockWallet(RENTER, RENTER))
    const section = await screen.findByRole('region', { name: 'My access' })
    await user.type(within(section).getByLabelText('Grant number'), '7')
    await user.click(within(section).getByRole('button', { name: 'View access' }))
    await within(section).findByTestId('rent-view')
    return { section, ...r }
  }

  it('TC-FE-029-06 github: the challenge is fetched, the gist content is signed with the voucher key, and the proof text has the format of the SDK', async () => {
    const user = userEvent.setup()
    const { section } = await openWith(user, view({ proof: 'unproven: no challenge' }), challengeBody())
    expect(within(section).getByTestId('rent-proof-state')).toHaveTextContent('grantee_unproven')
    await user.click(within(section).getByRole('button', { name: 'Fetch challenge from broker' }))
    expect(await within(section).findByTestId('rent-challenge')).toHaveTextContent('x207-grantee-proof v1')
    await user.type(within(section).getByLabelText(/Voucher key/), KEY)
    await user.click(within(section).getByRole('button', { name: 'Sign for gist' }))
    const content = within(section).getByTestId('rent-gist-content').textContent!
    expect(content).toBe(buildGistContent({ circle: CONTRACT_ID, grantId: 7, granteeRef: 'octocat', nonce: NONCE }, RENTER, KEY))
    expect(JSON.parse(content)).toMatchObject({ account: RENTER, signature: expect.stringMatching(/^ed25519:/) })
    await user.type(within(section).getByLabelText('Gist ID'), 'abc123def456')
    await user.click(within(section).getByRole('button', { name: 'Build proof' }))
    expect(parseGranteeProof(within(section).getByTestId('rent-proof').textContent!)).toEqual({ kind: 'near-gist', gist: 'abc123def456' })
    expect(within(section).getByTestId('rent-proof')).not.toHaveTextContent(KEY)
  })

  it('TC-FE-029-07 a challenge whose text, circle, grant, or reference differs from what the page computes is refused and nothing is signed', async () => {
    const user = userEvent.setup()
    for (const bad of [{ challenge: challengeBody().challenge.replace('octocat', 'mallory') }, { circle: 'evil.near' }, { grantId: 8 }, { granteeRef: 'mallory' }]) {
      cleanup()
      const { section } = await openWith(user, view(), challengeBody(bad))
      await user.click(within(section).getAllByRole('button', { name: 'Fetch challenge from broker' }).at(-1)!)
      expect(await within(section).findByTestId('rent-proof-error')).toHaveTextContent(/not signed/)
      expect(within(section).queryByTestId('rent-challenge')).toBeNull()
    }
  })

  it('TC-FE-029-08 ssh: the signature made on the machine of the renter becomes the proof; a provider that needs no proof says so; discord says OAuth is on the provider side', async () => {
    const user = userEvent.setup()
    const { section } = await openWith(user, view({ provider: 'ssh', granteeRef: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample', proof: 'verified' }), challengeBody({ granteeRef: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample' }))
    expect(within(section).getByTestId('rent-proof-state')).toHaveTextContent('Reference proven')
    await user.click(within(section).getByRole('button', { name: 'Fetch challenge from broker' }))
    await within(section).findByTestId('rent-challenge')
    const made = signSshChallenge({ circle: CONTRACT_ID, grantId: 7, granteeRef: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample', nonce: NONCE }, new Uint8Array(32).fill(5))
    await user.type(within(section).getByLabelText(/ed25519 signature/), (made as { signature: string }).signature)
    await user.click(within(section).getByRole('button', { name: 'Build proof' }))
    expect(parseGranteeProof(within(section).getByTestId('rent-proof').textContent!)).toEqual(made)
    await user.clear(within(section).getByLabelText(/ed25519 signature/))
    await user.type(within(section).getByLabelText(/ed25519 signature/), 'not a signature')
    await user.click(within(section).getByRole('button', { name: 'Build proof' }))
    expect(within(section).getByTestId('rent-proof-error')).toHaveTextContent('grantee_proof_bad_format')
    expect(within(section).queryByTestId('rent-proof')).toBeNull()
    cleanup()
    const discord = await openWith(user, view({ provider: 'discord', granteeRef: '1234567890' }), { required: false })
    expect(within(discord.section).getByTestId('rent-proof-panel')).toHaveTextContent('OAuth')
    expect(within(discord.section).queryByRole('button', { name: 'Fetch challenge from broker' })).toBeNull()
    cleanup()
    const none = await openWith(user, view({ provider: 'mock' }), { required: false })
    expect(within(none.section).getByTestId('rent-proof-panel')).toHaveTextContent('does not use proof')
  })

  // ---- review batch 4 (B4-F5, B4-F7) ----
  it('TC-FE-029-09 [B4-F7] the renter sees three states of the reference: verified, unproven (an error colour), and not applicable (no way to prove; not a failure)', async () => {
    const user = userEvent.setup()
    for (const [proof, kind, text, error] of [
      ['verified', 'verified', /Reference proven/, false],
      ['unproven: Discord OAuth not installed', 'unproven', /not yet proven/, true],
      ['not_applicable', 'not_applicable', /has no way to prove/, false],
      [null, 'unknown', /No proof statement/, false],
    ] as const) {
      cleanup()
      const { section } = await open(user, view({ proof, warnings: proof === 'verified' ? [] : ['grantee_unproven'] }))
      const state = within(section).getByTestId('rent-proof-state')
      expect(state).toHaveAttribute('data-proof', kind)
      expect(state).toHaveTextContent(text)
      expect(state.className.includes('state-error')).toBe(error)
      if (kind === 'not_applicable') expect(state).toHaveTextContent('not a proof failure')
    }
    expect([proofKind('verified'), proofKind('not_applicable'), proofKind('unproven: x'), proofKind(null), proofKind('other')]).toEqual(['verified', 'not_applicable', 'unproven', 'unknown', 'unknown'])
  })

  it('TC-FE-029-10 [B4-F5] the grantor page refuses an SSH key that cannot be proven, before anything is offered: only ssh-ed25519 passes, and the rule is shown', async () => {
    const user = userEvent.setup()
    const good = sshEd25519Line(new Uint8Array(32).fill(4), 'me')
    expect(granteeRefProblem('ssh', good)).toBeNull()
    expect(granteeRefProblem('ssh', '')).toBeNull() // empty = filled at offer_grant
    expect(granteeRefProblem('ssh', 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ')).toMatch(/Only ssh-ed25519 keys can be proven.*ssh-rsa/)
    expect(granteeRefProblem('ssh', 'ecdsa-sha2-nistp256 AAAA')).toMatch(/ecdsa-sha2-nistp256/)
    expect(granteeRefProblem('ssh', 'ssh-ed25519 AAAAshort')).toMatch(/Invalid/)
    expect(granteeRefProblem('github', 'not a login!')).toMatch(/GitHub login/)
    expect(granteeRefProblem('discord', 'alice')).toMatch(/Discord/)
    expect(granteeRefProblem('discord', '123456789012345678')).toBeNull()
    renderApp('/rent', undefined, false, createMockWallet(RENTER, RENTER))
    const form = await screen.findByRole('region', { name: 'Offer access rent' })
    await user.selectOptions(within(form).getByLabelText('Provider'), 'ssh')
    await user.type(within(form).getByLabelText(/^Price per day/), '2')
    await user.type(within(form).getByLabelText(/^Lessee reference/), 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ')
    expect(within(form).getByTestId('rent-offer-error')).toHaveTextContent('Only ssh-ed25519 keys')
    expect(within(form).queryByTestId('rent-scope')).not.toBeInTheDocument()
    await user.clear(within(form).getByLabelText(/^Lessee reference/))
    await user.type(within(form).getByLabelText(/^Lessee reference/), good)
    expect(JSON.parse(within(form).getByTestId('rent-scope').textContent!)).toMatchObject({ provider: 'ssh', grantee_ref: good })
  })

  it('TC-FE-029-11 [B4-F2] a second live grant for the same login and resource (access_conflict) and a provider that fails (provider_grant_failed) are said in words', () => {
    // the codes of the broker, not its message text (BE-057: grant_failed is split into access_conflict and provider_grant_failed)
    expect(describeMarketError(new ApiError(409, 'access_conflict', 'any text'))).toMatch(/another grant for the same login and resource still holds it/)
    expect(describeMarketError(new ApiError(502, 'provider_grant_failed', 'GitHub answered 500'))).toMatch(/The provider failed to open access: GitHub answered 500/)
  })
})
