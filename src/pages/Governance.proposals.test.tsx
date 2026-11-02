import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { daoProposals } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'
import { tally } from './Governance'

describe('FE-015 proposal DAO di halaman tata kelola', () => {
  it('TC-FE-015-01 proposal terbuka: status, perubahan, suara, dan link ke DAO', async () => {
    renderApp('/tata-kelola')
    const table = await screen.findByRole('table', { name: 'Proposal terbuka' })
    expect(table).toHaveTextContent('Terbuka')
    expect(table).toHaveTextContent('payment_window = 45 menit')
    expect(table).toHaveTextContent('council1.near')
    expect(table).toHaveTextContent('1 / 0 / 0')
    expect(within(table).getByRole('link', { name: '7' })).toHaveAttribute('href', expect.stringContaining('x207.sputnik-dao.near'))
    expect(screen.getByRole('link', { name: 'x207.sputnik-dao.near' })).toBeInTheDocument()
  })

  it('TC-FE-015-02 proposal selesai dipisah dari yang terbuka', async () => {
    renderApp('/tata-kelola')
    const closed = await screen.findByRole('table', { name: 'Proposal selesai' })
    expect(closed).toHaveTextContent('Disetujui')
    expect(closed).toHaveTextContent('limit_cap')
    expect(screen.getByRole('table', { name: 'Proposal terbuka' })).not.toHaveTextContent('Disetujui')
  })

  it('TC-FE-015-03 parameter epoch berikutnya ditulis dengan epoch berlakunya', async () => {
    renderApp('/tata-kelola')
    const note = await screen.findByLabelText('Parameter epoch berikutnya')
    expect(note).toHaveTextContent('Berlaku mulai epoch 43')
    expect(note).toHaveTextContent('payment_window = 45 menit')
  })

  it('TC-FE-015-04 tanpa proposal terbuka: pesan, tabel selesai tetap ada', async () => {
    renderApp('/tata-kelola', (p) => (p.endsWith('/proposals') ? { status: 200, body: { ...daoProposals, items: daoProposals.items.slice(1) } } : undefined))
    expect(await screen.findByText('Tidak ada proposal yang terbuka.')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Proposal selesai' })).toBeInTheDocument()
  })

  it('TC-FE-015-05 DAO tidak terbaca (502): pesan galat, halaman parameter tetap tampil', async () => {
    renderApp('/tata-kelola', (p) => (p.endsWith('/proposals') ? apiError(502, 'dao_unavailable', 'Proposal DAO tidak terbaca') : undefined))
    expect((await screen.findAllByText(/dao_unavailable|Proposal DAO tidak terbaca/)).length).toBeGreaterThan(0)
    expect(await screen.findByText('Peluruhan limit')).toBeInTheDocument()
  })

  it('TC-FE-015-06 tally menjumlahkan suara semua peran', () => {
    expect(tally({ council: [2, 1, 0], community: [1, 0, 1] })).toEqual({ approve: 3, reject: 1, remove: 1 })
    expect(tally({})).toEqual({ approve: 0, reject: 0, remove: 0 })
  })
})
