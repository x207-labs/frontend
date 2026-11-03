import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
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
})
