import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { epochSettlements42 } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'
import { lossAllocation } from './Risk'

const defaulted = (extra: object) => ({
  epoch: 42, phase: 'finalized', account: 'scraper.x207-circle.near', role: 'debtor', net: '-35000000', amount: '35000000', status: 'defaulted',
  due: '2026-11-09T12:00:00Z', paidAmount: '0', stakeSlashed: '35000000', haircut: '0', ...extra,
})

describe('FE-013 riwayat limit dan alokasi kerugian', () => {
  it('TC-FE-013-01 riwayat limit anggota pertama dari read API, terbaru dulu', async () => {
    const { calls } = renderApp('/risiko')
    const table = await screen.findByRole('table', { name: 'Riwayat limit' })
    await waitFor(() => expect(calls().some((c) => c.includes('/members/cleaner.x207-circle.near/limits'))).toBe(true))
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('42')
    expect(rows[1]).toHaveTextContent('cash_settlement')
    expect(rows[1]).toHaveTextContent('40')
    expect(rows[1]).toHaveTextContent('50')
    expect(rows[2]).toHaveTextContent('stake')
    expect(rows[2]).toHaveTextContent('-')
  })

  it('TC-FE-013-02 memilih anggota lain memuat riwayat anggota itu', async () => {
    const { calls } = renderApp('/risiko')
    const user = userEvent.setup()
    await screen.findByRole('table', { name: 'Riwayat limit' })
    await user.selectOptions(screen.getByLabelText('Anggota'), 'gpu.x207-circle.near')
    await waitFor(() => expect(calls().some((c) => c.includes('/members/gpu.x207-circle.near/limits'))).toBe(true))
  })

  it('TC-FE-013-03 anggota tanpa riwayat atau galat: pesan, bukan tabel kosong', async () => {
    renderApp('/risiko', (p) => (p.endsWith('/limits') ? { status: 200, body: { items: [], nextCursor: null } } : undefined))
    expect(await screen.findByText('Belum ada perubahan limit untuk anggota ini.')).toBeInTheDocument()
  })

  it('TC-FE-013-04 galat 404 riwayat tampil sebagai pesan', async () => {
    renderApp('/risiko', (p) => (p.endsWith('/limits') ? apiError(404, 'member_not_found', 'Akun belum terdaftar di lingkaran') : undefined))
    expect((await screen.findAllByText(/member_not_found|belum terdaftar/)).length).toBeGreaterThan(0)
  })

  it('TC-FE-013-05 default: kolom stake, dana cadangan dan haircut dengan sisa dihitung dari urutan kerugian', async () => {
    renderApp('/risiko?epoch=42', (p) =>
      p.includes('/epochs/42/settlements') ? { status: 200, body: { items: [defaulted({ paidAmount: '5000000', stakeSlashed: '20000000', haircut: '4000000' })], nextCursor: null } } : undefined,
    )
    const table = (await screen.findByRole('columnheader', { name: 'Dana cadangan' })).closest('table')!
    const row = within(table).getAllByRole('row')[1]!
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent)
    // tagihan 35, dibayar 5, stake 20, haircut 4: cadangan 35 - 5 - 20 - 4 = 6
    expect(cells.slice(1)).toEqual(['35', '20', '6', '4'])
    expect(screen.getByText(/Urutan kerugian: stake debtor, dana cadangan/)).toBeInTheDocument()
  })

  it('TC-FE-013-06 lossAllocation: stake lebih dulu, lalu cadangan, lalu haircut', () => {
    expect(lossAllocation({ amount: '100', paidAmount: '0', stakeSlashed: '100', haircut: '0' })).toEqual({ owed: 100n, stake: 100n, haircut: 0n, reserve: 0n })
    expect(lossAllocation({ amount: '100', paidAmount: '10', stakeSlashed: '40', haircut: '20' })).toEqual({ owed: 90n, stake: 40n, haircut: 20n, reserve: 30n })
    expect(lossAllocation({ amount: '100', stakeSlashed: '120', haircut: '0' }).reserve).toBe(0n)
    expect(epochSettlements42.items.length).toBeGreaterThan(0)
  })
})
