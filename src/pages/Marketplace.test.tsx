import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { listings } from '../api/fixtures'
import { base58Encode, listingHash } from '../lib/barter'
import { apiError, renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const ME = 'translator.x207-circle.near'
const KEY = `ed25519:${base58Encode(Uint8Array.from(new Array<number>(32).fill(1)))}`
const login = () => createMockWallet(ME, ME)

async function fillCreate(user: ReturnType<typeof userEvent.setup>, over: { offerClass?: string; key?: string } = {}) {
  await user.type(screen.getByLabelText('Asset type (Offering)'), 'gpu-hours')
  if (over.offerClass) await user.selectOptions(screen.getByLabelText('Class (Offering)'), over.offerClass)
  await user.clear(screen.getByLabelText('Quantity (Offering)'))
  await user.type(screen.getByLabelText('Quantity (Offering)'), '10')
  await user.type(screen.getByLabelText('Credit value (Offering)'), '100')
  await user.type(screen.getByLabelText('Asset type (Seeking)'), 'translation')
  await user.type(screen.getByLabelText('Credit value (Seeking)'), '100')
  await user.clear(screen.getByLabelText(/Quick barter discount/))
  await user.type(screen.getByLabelText(/Quick barter discount/), '10')
  await user.type(screen.getByLabelText(/Voucher key/), over.key ?? KEY)
}

describe('marketplace F9: browse and create listings', () => {
  it('TC-FE-019-01 listings with asset class, discount, and validity from the API', async () => {
    renderApp('/marketplace')
    const row = (await screen.findByText('translate-calls')).closest('tr')!
    expect(row).toHaveTextContent('summarize-calls')
    expect(row.querySelectorAll('.asset-meta')[0]).toHaveTextContent('Class D')
    expect(row.querySelectorAll('.asset-meta')[1]).toHaveTextContent('Class D')
    expect(row).toHaveTextContent('10%, payment allowed')
    expect(row).toHaveTextContent('Nov 12, 2026')
    const gpu = screen.getByText('gpu-hours').closest('tr')!
    expect(gpu.querySelectorAll('.asset-meta')[0]).toHaveTextContent('Class A')
    expect(gpu).toHaveTextContent('dataset')
    expect(gpu.querySelectorAll('.asset-meta')[1]).toHaveTextContent('Class C')
    expect(gpu).toHaveTextContent('0%')
    expect(gpu).not.toHaveTextContent('payment allowed')
  })

  it('TC-FE-019-02 statistics are computed from the API, not a sample', async () => {
    renderApp('/marketplace')
    const panel = await screen.findByLabelText('Marketplace statistics')
    expect(within(panel).getByText('Open listings').nextSibling).toHaveTextContent('2')
    expect(within(panel).getByText('Discount value').nextSibling).toHaveTextContent('10')
    expect(within(panel).getByText('Seeker revenue').nextSibling).toHaveTextContent('3')
  })

  it('TC-FE-019-03 the status and asset type filters call the API with parameters', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/marketplace')
    await screen.findByText('translate-calls')
    await user.type(screen.getByLabelText('Offered asset type'), 'gpu-hours')
    await waitFor(() => expect(calls().some((c) => c.includes('/listings?') && c.includes('offerType=gpu-hours'))).toBe(true))
    expect(await screen.findByText('gpu-hours')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('translate-calls')).not.toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('Status'), 'matched')
    expect(await screen.findByText('No listing matches the filter yet.')).toBeInTheDocument()
    // FE-035: the empty list says why and where the real data is
    expect(screen.getByRole('link', { name: 'clearing stats of epoch 8' })).toHaveAttribute('href', '/stats?epoch=8')
    expect(screen.getByRole('link', { name: 'join the circle' })).toHaveAttribute('href', '/onboarding')
  })

  it('TC-FE-019-04 error 503 shows the code and a retry button', async () => {
    renderApp('/marketplace', (p) => (p.includes('/listings') ? apiError(503, 'indexer_unavailable') : undefined))
    expect(await screen.findByRole('alert')).toHaveTextContent('indexer_unavailable')
  })

  it('TC-FE-019-05 listing created: signed in the browser and sent with a matching hash', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/marketplace', (p, init) => (init?.method === 'POST' && p.endsWith('/listings') ? { status: 201, body: { ...listings[0], listingHash: 'c'.repeat(64) } } : undefined), false, login())
    await screen.findByText('translate-calls')
    await screen.findByText(/Sign in to create a listing|Voucher key/)
    await fillCreate(user, { offerClass: 'A' })
    await user.click(screen.getByRole('button', { name: /Sign and post listing/ }))
    expect(await screen.findByText(/Listing posted/)).toBeInTheDocument()
    const post = requests().find((r) => r.method === 'POST')!
    expect(post.path).toMatch(/\/listings$/)
    const { listing, signature } = post.body
    expect(listing).toMatchObject({
      account: ME, offer: { asset_type: 'gpu-hours', asset_class: 'A', quantity: 10, value: '100000000' },
      want: { asset_type: 'translation', asset_class: 'D', quantity: 1, value: '100000000' }, discount_bps: 1000, accept_payment: true, discoverable: true,
    })
    expect(listing.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000))
    expect(signature).toMatch(/^ed25519:/)
    expect(JSON.stringify(post.body)).not.toContain(KEY)
    expect(await listingHash(listing)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('TC-FE-019-06 class X rejected by the server: clear message, no new listing', async () => {
    const user = userEvent.setup()
    renderApp(
      '/marketplace',
      (p, init) =>
        init?.method === 'POST' && p.endsWith('/listings')
          ? apiError(400, 'asset_class_rejected', 'offer.asset_class "X" rejected: class X cannot be listed')
          : undefined,
      false,
      login(),
    )
    await screen.findByText('translate-calls')
    await screen.findByLabelText(/Voucher key/)
    await fillCreate(user)
    await user.click(screen.getByRole('button', { name: /Sign and post listing/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Asset class rejected')
    expect(screen.queryByText(/Listing posted/)).not.toBeInTheDocument()
  })

  it('TC-FE-019-07 class options are only A to D and the form is disabled without login', async () => {
    renderApp('/marketplace')
    await screen.findByText('translate-calls')
    const select = screen.getByLabelText('Class (Offering)')
    expect(within(select).getAllByRole('option').map((o) => o.textContent?.match(/^Class ([A-Z])/)?.[1])).toEqual(['A', 'B', 'C', 'D'])
    expect(screen.getByRole('group', { name: 'Sign in to create a listing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sign and post listing/ })).toBeDisabled()
  })

  it('TC-FE-019-08 validation: wrong asset type, discount above 100%, button stays disabled', async () => {
    const user = userEvent.setup()
    renderApp('/marketplace', undefined, false, login())
    await screen.findByText('translate-calls')
    await screen.findByLabelText(/Voucher key/)
    await fillCreate(user)
    const button = screen.getByRole('button', { name: /Sign and post listing/ })
    await waitFor(() => expect(button).toBeEnabled())
    await user.clear(screen.getByLabelText(/Quick barter discount/))
    await user.type(screen.getByLabelText(/Quick barter discount/), '101')
    expect(screen.getByText(/Discount 0–100%/)).toBeInTheDocument()
    expect(button).toBeDisabled()
  })
})
