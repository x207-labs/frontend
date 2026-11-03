import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { base58Encode } from '../lib/barter'
import { toAssetInput } from '../lib/assetForm'
import { apiError, renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const ME = 'scraper.x207-circle.near'
const KEY = `ed25519:${base58Encode(Uint8Array.from(new Array<number>(32).fill(1)))}`
const NOW = 1_793_000_000
const FT = { ftContract: 'usdc.near', symbol: 'USDC', decimals: '6', amount: '2.5', price: '1', hours: '6' }

describe('FE-026 decimals only as decimal integers (X2)', () => {
  it('TC-FE-026-01 0x6, 1e1, 6.0, -1, 007x and 100 are refused; 0, 6 and 24 are read as typed', () => {
    for (const bad of ['0x6', '1e1', '6.0', '-1', ' ', '', '1_0', '100', '+6']) {
      const input = toAssetInput('ft', { ...FT, decimals: bad }, NOW)
      expect(typeof input, JSON.stringify(bad)).toBe('string')
    }
    for (const good of ['0', '6', '24', '38']) {
      const input = toAssetInput('ft', { ...FT, decimals: good, amount: '1' }, NOW)
      expect(typeof input === 'string' ? input : (input as { decimals: number }).decimals, good).toBe(Number(good))
    }
    // rwa, lst and a fungible pool share use the same rule; an NFT has no decimals to type
    for (const kind of ['rwa', 'lst'] as const) expect(typeof toAssetInput(kind, { ...FT, decimals: '0x6' }, NOW)).toBe('string')
    expect(typeof toAssetInput('pool-share', { ...FT, standard: 'nep141', pool: 'P', decimals: '1e1' }, NOW)).toBe('string')
    expect(typeof toAssetInput('nft', { nftContract: 'nft.near', tokenId: 't1', price: '1', hours: '6' }, NOW)).toBe('object')
  })

  it('TC-FE-026-02 the seats of a license are a decimal integer too', () => {
    const lic = { nftContract: 'nft.near', tokenId: 't1', product: 'Editor', termsHash: 'ab'.repeat(32), price: '1', hours: '6' }
    expect(typeof toAssetInput('license', { ...lic, seats: '0x3' }, NOW)).toBe('string')
    expect(typeof toAssetInput('license', { ...lic, seats: '0' }, NOW)).toBe('string')
    expect((toAssetInput('license', { ...lic, seats: '3' }, NOW) as { seats: number }).seats).toBe(3)
  })
})

describe('FE-026 the listing is checked (BE-052) before offer_grant and the deposit (X4)', () => {
  async function ready(reply?: ReturnType<typeof apiError> | { status: number; body: unknown }) {
    const user = userEvent.setup()
    const view = renderApp('/marketplace', (p, init) => (init?.method === 'POST' && p.endsWith('/listings/check') && reply ? reply : undefined), false, createMockWallet(ME, ME))
    const section = await screen.findByRole('region', { name: 'Template aset on-chain' })
    fireEvent.change(within(section).getByLabelText('Jenis aset'), { target: { value: 'nft' } })
    fireEvent.change(within(section).getByLabelText(/^Kontrak NFT/), { target: { value: 'nft.near' } })
    fireEvent.change(within(section).getByLabelText(/^ID token NFT/), { target: { value: 't1' } })
    fireEvent.change(within(section).getByLabelText(/^Harga \(credit\)/), { target: { value: '10' } })
    fireEvent.change(within(section).getByLabelText(/^Penawaran berlaku/), { target: { value: '24' } })
    await user.click(within(section).getByRole('button', { name: /Isi sisi/ }))
    await user.type(screen.getByLabelText('Jenis aset (Mencari)'), 'translation')
    await user.type(screen.getByLabelText('Nilai credit (Mencari)'), '10')
    return { user, section, ...view }
  }

  it('TC-FE-026-03 nothing is checked yet: the check is disabled without a voucher key and the page says not to call offer_grant', async () => {
    const { section } = await ready()
    expect(within(section).getByTestId('listing-check-idle')).toHaveTextContent('jangan panggil offer_grant')
    expect(within(section).getByRole('button', { name: /Periksa listing sebelum titipan/ })).toBeDisabled()
  })

  it('TC-FE-026-04 a pass posts the signed listing to listings/check (not to listings) and says it is safe to call offer_grant', async () => {
    const { user, section, requests } = await ready({ status: 200, body: { valid: true, listingHash: 'c'.repeat(64), account: ME, offerAssetType: 'nft:nep171', expiresAt: NOW, stored: false } })
    await user.type(screen.getByLabelText(/Kunci voucher/), KEY)
    await user.click(within(section).getByRole('button', { name: /Periksa listing sebelum titipan/ }))
    expect(await within(section).findByTestId('listing-check-ok')).toHaveTextContent('aman memanggil offer_grant')
    const posts = requests().filter((r) => r.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0]!.path).toMatch(/\/listings\/check$/)
    expect(posts[0]!.body.listing).toMatchObject({ account: ME, offer: { asset_type: 'nft:nep171', asset_class: 'A', quantity: 1 } })
    expect(posts[0]!.body.signature).toMatch(/^ed25519:/)
    expect(JSON.stringify(posts[0]!.body)).not.toContain(KEY)
  })

  it('TC-FE-026-05 a refusal is shown with the reason and the page says not to call offer_grant or deposit', async () => {
    const { user, section } = await ready(apiError(400, 'asset_class_rejected', 'offer.asset_type "nft:nep171" belum terdaftar di lingkaran'))
    await user.type(screen.getByLabelText(/Kunci voucher/), KEY)
    await user.click(within(section).getByRole('button', { name: /Periksa listing sebelum titipan/ }))
    const alert = await within(section).findByTestId('listing-check-error')
    expect(alert).toHaveTextContent('Jangan panggil offer_grant')
    expect(within(section).queryByTestId('listing-check-ok')).not.toBeInTheDocument()
  })

  it('TC-FE-026-06 a change in the form drops an earlier pass, so a stale pass cannot be used', async () => {
    const { user, section } = await ready({ status: 200, body: { valid: true, listingHash: 'd'.repeat(64), account: ME, offerAssetType: 'nft:nep171', expiresAt: NOW, stored: false } })
    await user.type(screen.getByLabelText(/Kunci voucher/), KEY)
    await user.click(within(section).getByRole('button', { name: /Periksa listing sebelum titipan/ }))
    await within(section).findByTestId('listing-check-ok')
    await user.type(screen.getByLabelText('Syarat'), 'x')
    await waitFor(() => expect(within(section).queryByTestId('listing-check-ok')).not.toBeInTheDocument())
    expect(within(section).getByTestId('listing-check-idle')).toBeInTheDocument()
  })
})
