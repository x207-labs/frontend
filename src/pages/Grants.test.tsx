import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { grants } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'
import { formatExpiry } from './Grants'

const SCRAPER = 'scraper.x207-circle.near'
const TRANSLATOR = 'translator.x207-circle.near'
const rowOf = (id: number) => screen.getByText(String(id), { selector: 'td.num' }).closest('tr') as HTMLElement

describe('FE-017 dashboard grant F8', () => {
  it('TC-FE-017-01 pemberi melihat grant aktif dan dicabut dengan kelas, penerima, status, masa berlaku dan alasan', async () => {
    renderApp('/akses', undefined, false, createMockWallet(SCRAPER, SCRAPER))
    const table = await screen.findByRole('table', { name: 'Daftar grant' })
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(2)
    const revoked = rowOf(1)
    expect(revoked).toHaveTextContent('pemberi')
    expect(revoked).toHaveTextContent('near-rpc:access')
    expect(revoked).toHaveTextContent('B: kredensial turunan')
    expect(revoked).toHaveTextContent('translator')
    expect(revoked).toHaveTextContent('Dicabut')
    expect(revoked).toHaveTextContent('penerima gagal bayar (defaulted)')
    expect(revoked).toHaveTextContent('0,05 per day')
    expect(rowOf(2)).toHaveTextContent('Aktif')
    expect(rowOf(2)).toHaveTextContent('15 Des 2026')
  })

  it('TC-FE-017-02 penyewa melihat grant sebagai penerima, termasuk yang kedaluwarsa, tanpa grant yang bukan miliknya', async () => {
    renderApp('/akses', undefined, false, createMockWallet(TRANSLATOR, TRANSLATOR))
    await screen.findByRole('table', { name: 'Daftar grant' })
    expect(rowOf(1)).toHaveTextContent('penerima')
    expect(rowOf(3)).toHaveTextContent('Kedaluwarsa')
    expect(rowOf(3)).toHaveTextContent('masa berlaku habis')
    expect(rowOf(3)).toHaveTextContent('D: endpoint x402')
    expect(rowOf(4)).toHaveTextContent('pemberi')
    expect(rowOf(4)).toHaveTextContent('Ditawarkan')
    expect(screen.queryByText('2', { selector: 'td.num' })).not.toBeInTheDocument()
  })

  it('TC-FE-017-03 filter status memanggil read API dengan status dan menyaring tabel', async () => {
    const { calls } = renderApp('/akses', undefined, false, createMockWallet(SCRAPER, SCRAPER))
    const user = userEvent.setup()
    await screen.findByRole('table', { name: 'Daftar grant' })
    await user.selectOptions(screen.getByLabelText('Status'), 'active')
    await waitFor(() => expect(calls().some((c) => c.includes('grantor=scraper.x207-circle.near') && c.includes('status=active'))).toBe(true))
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Daftar grant' })).getAllByRole('row').slice(1)).toHaveLength(1))
    expect(rowOf(2)).toHaveTextContent('Aktif')
  })

  it('TC-FE-017-04 memilih anggota lain memuat grant anggota itu; tanpa grant: pesan', async () => {
    const { calls } = renderApp('/akses', undefined, false, createMockWallet(SCRAPER, SCRAPER))
    const user = userEvent.setup()
    await screen.findByRole('table', { name: 'Daftar grant' })
    await user.selectOptions(screen.getByLabelText('Anggota'), 'image.x207-circle.near')
    await waitFor(() => expect(calls().some((c) => c.includes('grantee=image.x207-circle.near'))).toBe(true))
    expect(await screen.findByText('Anggota ini belum punya grant.')).toBeInTheDocument()
  })

  it('TC-FE-017-05 galat read API tampil sebagai pesan, loading tampil dulu', async () => {
    renderApp('/akses', (p) => (p.includes('/grants') ? { ...apiError(503, 'indexer_unavailable'), delayMs: 30 } : undefined), false, createMockWallet(SCRAPER, SCRAPER))
    expect(await screen.findByText(/Memuat grant/)).toBeInTheDocument()
    expect((await screen.findAllByText(/indexer_unavailable/)).length).toBeGreaterThan(0)
  })

  it('TC-FE-017-06 formatExpiry membaca nanodetik; nilai rusak menjadi belum tersedia; fixture punya empat status', () => {
    expect(formatExpiry(grants[1]!.expiresAt)).toContain('15 Des 2026')
    expect(formatExpiry('bukan angka')).toBe('belum tersedia')
    expect(new Set(grants.map((g) => g.status))).toEqual(new Set(['offered', 'active', 'revoked', 'expired']))
  })
})
