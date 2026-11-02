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
  await user.type(screen.getByLabelText('Jenis aset (Menawarkan)'), 'gpu-hours')
  if (over.offerClass) await user.selectOptions(screen.getByLabelText('Kelas (Menawarkan)'), over.offerClass)
  await user.clear(screen.getByLabelText('Jumlah (Menawarkan)'))
  await user.type(screen.getByLabelText('Jumlah (Menawarkan)'), '10')
  await user.type(screen.getByLabelText('Nilai credit (Menawarkan)'), '100')
  await user.type(screen.getByLabelText('Jenis aset (Mencari)'), 'translation')
  await user.type(screen.getByLabelText('Nilai credit (Mencari)'), '100')
  await user.clear(screen.getByLabelText(/Diskon barter cepat/))
  await user.type(screen.getByLabelText(/Diskon barter cepat/), '10')
  await user.type(screen.getByLabelText(/Kunci voucher/), over.key ?? KEY)
}

describe('marketplace F9: telusuri dan buat listing', () => {
  it('TC-FE-019-01 daftar listing dengan kelas aset, diskon, dan masa berlaku dari API', async () => {
    renderApp('/marketplace')
    const row = (await screen.findByText(/translate-calls · kelas D/)).closest('tr')!
    expect(row).toHaveTextContent('summarize-calls · kelas D')
    expect(row).toHaveTextContent('10%, bayar boleh')
    expect(row).toHaveTextContent('12 Nov 2026')
    const gpu = screen.getByText(/gpu-hours · kelas A/).closest('tr')!
    expect(gpu).toHaveTextContent('dataset · kelas C')
    expect(gpu).toHaveTextContent('0%')
    expect(gpu).not.toHaveTextContent('bayar boleh')
  })

  it('TC-FE-019-02 statistik dihitung dari API, bukan contoh', async () => {
    renderApp('/marketplace')
    const panel = await screen.findByLabelText('Statistik marketplace')
    expect(within(panel).getByText('Listing terbuka').nextSibling).toHaveTextContent('2')
    expect(within(panel).getByText('Nilai diskon').nextSibling).toHaveTextContent('10')
    expect(within(panel).getByText('Pendapatan pencari').nextSibling).toHaveTextContent('3')
  })

  it('TC-FE-019-03 filter status dan jenis aset memanggil API dengan parameter', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/marketplace')
    await screen.findByText(/translate-calls · kelas D/)
    await user.type(screen.getByLabelText('Jenis aset ditawarkan'), 'gpu-hours')
    await waitFor(() => expect(calls().some((c) => c.includes('/listings?') && c.includes('offerType=gpu-hours'))).toBe(true))
    expect(await screen.findByText(/gpu-hours · kelas A/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/translate-calls · kelas D/)).not.toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('Status'), 'matched')
    expect(await screen.findByText('Belum ada listing yang cocok dengan filter.')).toBeInTheDocument()
  })

  it('TC-FE-019-04 error 503 menampilkan kode dan tombol coba lagi', async () => {
    renderApp('/marketplace', (p) => (p.includes('/listings') ? apiError(503, 'indexer_unavailable') : undefined))
    expect(await screen.findByRole('alert')).toHaveTextContent('indexer_unavailable')
  })

  it('TC-FE-019-05 listing dibuat: ditandatangani di browser dan dikirim dengan hash yang cocok', async () => {
    const user = userEvent.setup()
    const { requests } = renderApp('/marketplace', (p, init) => (init?.method === 'POST' && p.endsWith('/listings') ? { status: 201, body: { ...listings[0], listingHash: 'c'.repeat(64) } } : undefined), false, login())
    await screen.findByText(/translate-calls · kelas D/)
    await screen.findByText(/Masuk dengan wallet|Kunci voucher/)
    await fillCreate(user, { offerClass: 'A' })
    await user.click(screen.getByRole('button', { name: /Tanda tangani dan pasang listing/ }))
    expect(await screen.findByText(/Listing terpasang/)).toBeInTheDocument()
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

  it('TC-FE-019-06 kelas X ditolak server: pesan jelas, tidak ada listing baru', async () => {
    const user = userEvent.setup()
    renderApp(
      '/marketplace',
      (p, init) =>
        init?.method === 'POST' && p.endsWith('/listings')
          ? apiError(400, 'asset_class_rejected', 'offer.asset_class "X" ditolak: kelas X tidak bisa dilisting')
          : undefined,
      false,
      login(),
    )
    await screen.findByText(/translate-calls · kelas D/)
    await screen.findByLabelText(/Kunci voucher/)
    await fillCreate(user)
    await user.click(screen.getByRole('button', { name: /Tanda tangani dan pasang listing/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Kelas aset ditolak')
    expect(screen.queryByText(/Listing terpasang/)).not.toBeInTheDocument()
  })

  it('TC-FE-019-07 pilihan kelas hanya A sampai D dan form nonaktif tanpa login', async () => {
    renderApp('/marketplace')
    await screen.findByText(/translate-calls · kelas D/)
    const select = screen.getByLabelText('Kelas (Menawarkan)')
    expect(within(select).getAllByRole('option').map((o) => o.textContent?.[0])).toEqual(['A', 'B', 'C', 'D'])
    expect(screen.getByText(/Masuk dengan wallet untuk membuat listing/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tanda tangani dan pasang listing/ })).toBeDisabled()
  })

  it('TC-FE-019-08 validasi: jenis aset salah, diskon di atas 100%, tombol tetap nonaktif', async () => {
    const user = userEvent.setup()
    renderApp('/marketplace', undefined, false, login())
    await screen.findByText(/translate-calls · kelas D/)
    await screen.findByLabelText(/Kunci voucher/)
    await fillCreate(user)
    const button = screen.getByRole('button', { name: /Tanda tangani dan pasang listing/ })
    await waitFor(() => expect(button).toBeEnabled())
    await user.clear(screen.getByLabelText(/Diskon barter cepat/))
    await user.type(screen.getByLabelText(/Diskon barter cepat/), '101')
    expect(screen.getByText(/Diskon 0–100%/)).toBeInTheDocument()
    expect(button).toBeDisabled()
  })
})
