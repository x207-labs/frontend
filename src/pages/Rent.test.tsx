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
  const r = renderApp('/sewa', broker(body), false, createMockWallet(RENTER, RENTER))
  const section = await screen.findByRole('region', { name: 'Akses saya' })
  await user.type(within(section).getByLabelText('Nomor grant'), '7')
  await user.click(within(section).getByRole('button', { name: 'Lihat akses' }))
  await within(section).findByTestId('rent-view')
  return { section, ...r }
}

describe('FE-029 daily rent of an access', () => {
  it('TC-FE-029-01 the lender gets the scope for offer_grant and the detail of the listing; a costly provider needs a daily cap and the note of its terms', async () => {
    const user = userEvent.setup()
    renderApp('/sewa', undefined, false, createMockWallet(RENTER, RENTER))
    const form = await screen.findByRole('region', { name: 'Pasang sewa akses' })
    await user.type(within(form).getByLabelText(/^Sumber daya/), 'x207-labs/contracts')
    await user.type(within(form).getByLabelText(/^Izin/), 'pull')
    await user.type(within(form).getByLabelText(/^Harga per hari/), '2')
    expect(within(form).getByTestId('rent-provider-note')).toHaveTextContent('Ketentuan GitHub')
    expect(within(form).getByTestId('rent-offer-error')).toHaveTextContent('wajib punya batas belanja harian') // github is costly
    await user.type(within(form).getByLabelText(/^Batas belanja harian/), '5')
    expect(JSON.parse(within(form).getByTestId('rent-scope').textContent!)).toEqual({ provider: 'github', grantee_ref: '<diisi penyewa saat offer_grant>', resource: 'x207-labs/contracts', permission: 'pull', daily_cap: '5000000' })
    expect(JSON.parse(within(form).getByTestId('rent-detail').textContent!)).toEqual({ kind: 'access-rent', provider: 'github', resource: 'x207-labs/contracts', permission: 'pull', price_per_day: '2000000', daily_cap: '5000000' })
    await user.selectOptions(within(form).getByLabelText('Penyedia'), 'ssh')
    expect(within(form).getByTestId('rent-provider-note')).toHaveTextContent('Kunci berlaku sampai akhir hari')
  })

  it('TC-FE-029-02 the renter sees the state of the access, the real cost of today, and a pending revoke; the check before the next day passes for an active paid access', async () => {
    const user = userEvent.setup()
    const { section } = await open(user, view())
    expect(within(section).getByTestId('rent-view')).toHaveTextContent('Aktif')
    expect(within(section).getByTestId('rent-today')).toHaveTextContent('1,5 credit')
    await user.click(within(section).getByRole('button', { name: /Periksa sebelum bayar/ }))
    expect(within(section).getByTestId('rent-check')).toHaveTextContent('bukan bukti dari penyedia')
  })

  it('TC-FE-029-03 an access taken back early or not paid any more is not paid for the next day, with the code of the SDK', async () => {
    const user = userEvent.setup()
    const revoked = await open(user, view({ status: 'revoked', reason: 'owner_revoked' }))
    await user.click(within(revoked.section).getByRole('button', { name: /Periksa sebelum bayar/ }))
    expect(within(revoked.section).getByTestId('rent-check')).toHaveTextContent('rent_access_not_active')
    revoked.unmount()
    const expired = await open(user, view({ paidUntil: new Date(Date.now() - 60_000).toISOString() }))
    await user.click(within(expired.section).getByRole('button', { name: /Periksa sebelum bayar/ }))
    expect(within(expired.section).getByTestId('rent-check')).toHaveTextContent('rent_access_expired')
  })

  it('TC-FE-029-04 stopping the rent posts a notice with the keys circle, grant_id, actor, action, at, signed in the browser; the key is not sent', async () => {
    const user = userEvent.setup()
    const { section, requests } = await open(user, view())
    await user.type(within(section).getByLabelText(/Kunci voucher/), KEY)
    await user.click(within(section).getByRole('button', { name: 'Berhenti sewa' }))
    await within(section).findByText(/Berhenti sewa dikirim/)
    const post = requests().find((r) => r.method === 'POST')!
    expect(post.path).toMatch(/\/grants\/7\/access\/stop$/)
    expect(Object.keys(post.body.notice)).toEqual(['circle', 'grant_id', 'actor', 'action', 'at'])
    expect(post.body.notice).toMatchObject({ grant_id: 7, actor: RENTER, action: 'stop' })
    expect(post.body.signature).toMatch(/^ed25519:/)
    expect(JSON.stringify(post.body)).not.toContain(KEY)
    await waitFor(() => expect(within(section).getByTestId('rent-view')).toHaveTextContent('Dicabut'))
  })

  it('TC-FE-029-05 a revoke that failed is shown as pending with the attempts, and an unknown grant shows the error code of the broker', async () => {
    const user = userEvent.setup()
    const { section } = await open(user, view({ status: 'revoke_pending', revokePending: { attempts: 2, nextRetryAt: '2026-11-04T10:02:00Z', lastError: 'provider_unavailable' } }))
    expect(within(section).getByText(/Pencabutan tertunda: percobaan ke-2/)).toBeInTheDocument()
    renderApp('/sewa', (p) => (p === '/grants/9/access' ? { status: 404, body: { error: 'access_not_found', message: 'belum ada akses' } } : undefined), false, createMockWallet(RENTER, RENTER))
    const sections = await screen.findAllByRole('region', { name: 'Akses saya' })
    const second = sections[sections.length - 1]!
    await user.type(within(second).getByLabelText('Nomor grant'), '9')
    await user.click(within(second).getByRole('button', { name: 'Lihat akses' }))
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
    const r = renderApp('/sewa', withChallenge(body, challenge), false, createMockWallet(RENTER, RENTER))
    const section = await screen.findByRole('region', { name: 'Akses saya' })
    await user.type(within(section).getByLabelText('Nomor grant'), '7')
    await user.click(within(section).getByRole('button', { name: 'Lihat akses' }))
    await within(section).findByTestId('rent-view')
    return { section, ...r }
  }

  it('TC-FE-029-06 github: the challenge is fetched, the gist content is signed with the voucher key, and the proof text has the format of the SDK', async () => {
    const user = userEvent.setup()
    const { section } = await openWith(user, view({ proof: 'unproven: tidak ada tantangan' }), challengeBody())
    expect(within(section).getByTestId('rent-proof-state')).toHaveTextContent('grantee_unproven')
    await user.click(within(section).getByRole('button', { name: 'Ambil tantangan dari broker' }))
    expect(await within(section).findByTestId('rent-challenge')).toHaveTextContent('x207-grantee-proof v1')
    await user.type(within(section).getByLabelText(/Kunci voucher/), KEY)
    await user.click(within(section).getByRole('button', { name: 'Tandatangani untuk gist' }))
    const content = within(section).getByTestId('rent-gist-content').textContent!
    expect(content).toBe(buildGistContent({ circle: CONTRACT_ID, grantId: 7, granteeRef: 'octocat', nonce: NONCE }, RENTER, KEY))
    expect(JSON.parse(content)).toMatchObject({ account: RENTER, signature: expect.stringMatching(/^ed25519:/) })
    await user.type(within(section).getByLabelText('ID gist'), 'abc123def456')
    await user.click(within(section).getByRole('button', { name: 'Susun bukti' }))
    expect(parseGranteeProof(within(section).getByTestId('rent-proof').textContent!)).toEqual({ kind: 'near-gist', gist: 'abc123def456' })
    expect(within(section).getByTestId('rent-proof')).not.toHaveTextContent(KEY)
  })

  it('TC-FE-029-07 a challenge whose text, circle, grant, or reference differs from what the page computes is refused and nothing is signed', async () => {
    const user = userEvent.setup()
    for (const bad of [{ challenge: challengeBody().challenge.replace('octocat', 'mallory') }, { circle: 'evil.near' }, { grantId: 8 }, { granteeRef: 'mallory' }]) {
      cleanup()
      const { section } = await openWith(user, view(), challengeBody(bad))
      await user.click(within(section).getAllByRole('button', { name: 'Ambil tantangan dari broker' }).at(-1)!)
      expect(await within(section).findByTestId('rent-proof-error')).toHaveTextContent(/tidak ditandatangani/)
      expect(within(section).queryByTestId('rent-challenge')).toBeNull()
    }
  })

  it('TC-FE-029-08 ssh: the signature made on the machine of the renter becomes the proof; a provider that needs no proof says so; discord says OAuth is on the provider side', async () => {
    const user = userEvent.setup()
    const { section } = await openWith(user, view({ provider: 'ssh', granteeRef: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample', proof: 'verified' }), challengeBody({ granteeRef: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample' }))
    expect(within(section).getByTestId('rent-proof-state')).toHaveTextContent('Referensi terbukti')
    await user.click(within(section).getByRole('button', { name: 'Ambil tantangan dari broker' }))
    await within(section).findByTestId('rent-challenge')
    const made = signSshChallenge({ circle: CONTRACT_ID, grantId: 7, granteeRef: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample', nonce: NONCE }, new Uint8Array(32).fill(5))
    await user.type(within(section).getByLabelText(/Tanda tangan ed25519/), (made as { signature: string }).signature)
    await user.click(within(section).getByRole('button', { name: 'Susun bukti' }))
    expect(parseGranteeProof(within(section).getByTestId('rent-proof').textContent!)).toEqual(made)
    await user.clear(within(section).getByLabelText(/Tanda tangan ed25519/))
    await user.type(within(section).getByLabelText(/Tanda tangan ed25519/), 'bukan tanda tangan')
    await user.click(within(section).getByRole('button', { name: 'Susun bukti' }))
    expect(within(section).getByTestId('rent-proof-error')).toHaveTextContent('grantee_proof_bad_format')
    expect(within(section).queryByTestId('rent-proof')).toBeNull()
    cleanup()
    const discord = await openWith(user, view({ provider: 'discord', granteeRef: '1234567890' }), { required: false })
    expect(within(discord.section).getByTestId('rent-proof-panel')).toHaveTextContent('OAuth')
    expect(within(discord.section).queryByRole('button', { name: 'Ambil tantangan dari broker' })).toBeNull()
    cleanup()
    const none = await openWith(user, view({ provider: 'mock' }), { required: false })
    expect(within(none.section).getByTestId('rent-proof-panel')).toHaveTextContent('tidak memakai bukti')
  })

  // ---- review batch 4 (B4-F5, B4-F7) ----
  it('TC-FE-029-09 [B4-F7] the renter sees three states of the reference: verified, unproven (an error colour), and not applicable (no way to prove; not a failure)', async () => {
    const user = userEvent.setup()
    for (const [proof, kind, text, error] of [
      ['verified', 'verified', /Referensi terbukti/, false],
      ['unproven: Discord OAuth tidak dipasang', 'unproven', /belum terbukti/, true],
      ['not_applicable', 'not_applicable', /tidak punya cara membuktikan/, false],
      [null, 'unknown', /Belum ada keterangan/, false],
    ] as const) {
      cleanup()
      const { section } = await open(user, view({ proof, warnings: proof === 'verified' ? [] : ['grantee_unproven'] }))
      const state = within(section).getByTestId('rent-proof-state')
      expect(state).toHaveAttribute('data-proof', kind)
      expect(state).toHaveTextContent(text)
      expect(state.className.includes('state-error')).toBe(error)
      if (kind === 'not_applicable') expect(state).toHaveTextContent('bukan kegagalan bukti')
    }
    expect([proofKind('verified'), proofKind('not_applicable'), proofKind('unproven: x'), proofKind(null), proofKind('other')]).toEqual(['verified', 'not_applicable', 'unproven', 'unknown', 'unknown'])
  })

  it('TC-FE-029-10 [B4-F5] the grantor page refuses an SSH key that cannot be proven, before anything is offered: only ssh-ed25519 passes, and the rule is shown', async () => {
    const user = userEvent.setup()
    const good = sshEd25519Line(new Uint8Array(32).fill(4), 'me')
    expect(granteeRefProblem('ssh', good)).toBeNull()
    expect(granteeRefProblem('ssh', '')).toBeNull() // empty = filled at offer_grant
    expect(granteeRefProblem('ssh', 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ')).toMatch(/Hanya kunci ssh-ed25519.*ssh-rsa/)
    expect(granteeRefProblem('ssh', 'ecdsa-sha2-nistp256 AAAA')).toMatch(/ecdsa-sha2-nistp256/)
    expect(granteeRefProblem('ssh', 'ssh-ed25519 AAAAshort')).toMatch(/tidak sah/)
    expect(granteeRefProblem('github', 'not a login!')).toMatch(/login GitHub/)
    expect(granteeRefProblem('discord', 'alice')).toMatch(/Discord/)
    expect(granteeRefProblem('discord', '123456789012345678')).toBeNull()
    renderApp('/sewa', undefined, false, createMockWallet(RENTER, RENTER))
    const form = await screen.findByRole('region', { name: 'Pasang sewa akses' })
    await user.selectOptions(within(form).getByLabelText('Penyedia'), 'ssh')
    await user.type(within(form).getByLabelText(/^Harga per hari/), '2')
    await user.type(within(form).getByLabelText(/^Referensi penyewa/), 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ')
    expect(within(form).getByTestId('rent-offer-error')).toHaveTextContent('Hanya kunci ssh-ed25519')
    expect(within(form).queryByTestId('rent-scope')).not.toBeInTheDocument()
    await user.clear(within(form).getByLabelText(/^Referensi penyewa/))
    await user.type(within(form).getByLabelText(/^Referensi penyewa/), good)
    expect(JSON.parse(within(form).getByTestId('rent-scope').textContent!)).toMatchObject({ provider: 'ssh', grantee_ref: good })
  })

  it('TC-FE-029-11 [B4-F2] a second live grant for the same login and resource is refused by the broker; the page says so in words', () => {
    const e = new ApiError(502, 'grant_failed', 'grant 3 sudah membuka akses yang sama (github, alice-dev); tunggu sampai berakhir')
    expect(describeMarketError(e)).toMatch(/Grant lain untuk login dan sumber daya yang sama masih berjalan/)
    expect(describeMarketError(new ApiError(502, 'grant_failed', 'GitHub menjawab 500'))).toMatch(/Penyedia gagal membuka akses: GitHub menjawab 500/)
  })
})
