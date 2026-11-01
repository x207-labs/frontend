import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { report42 } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'

const fact = (term: string) => screen.getByText(term, { selector: 'dt' }).closest('div')!
const withReport = (body: unknown, status = 207) => (p: string) =>
  /\/epochs\/\d+$/.test(p) ? { status, body } : undefined

describe('laporan 207', () => {
  it('TC-FE-007-01 dan -07 respons 207 dibaca sukses', async () => {
    renderApp('/laporan')
    await screen.findByText('Status per anggota')
    expect(fact('Nilai terhapus')).toHaveTextContent('1.820')
    expect(fact('Cleared ratio')).toHaveTextContent('71%')
    const statuses = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent)
    expect(statuses).toEqual(['200', '200', '200', '402', '402', '202'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('TC-FE-007-02 entri 409 dengan stakeSlashed dan haircut', async () => {
    const body = { ...report42, members: [{ account: 'scraper.x207-circle.near', status: 409, net: '-35000000', settlement: 'defaulted', amount: '35000000', stakeSlashed: '35000000', haircut: '0' }] }
    renderApp('/laporan', withReport(body))
    expect(await screen.findByText('Default: stake dipotong 35, haircut 0')).toBeInTheDocument()
  })

  it('TC-FE-007-03 belum commit: pesan tanpa tabel', async () => {
    renderApp('/laporan', withReport({ ...report42, committed: false, members: [] }, 200))
    expect(await screen.findByText(/Epoch belum di-commit/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('TC-FE-007-04 error 404', async () => {
    renderApp('/laporan', (p) => (/\/epochs\/\d+$/.test(p) ? apiError(404, 'epoch_not_found') : undefined))
    expect(await screen.findByRole('alert')).toHaveTextContent('epoch_not_found')
  })

  it('TC-FE-007-05 loading', async () => {
    renderApp('/laporan', (p) => (/\/epochs\/\d+$/.test(p) ? { status: 207, body: report42, delayMs: 50 } : undefined))
    expect(await screen.findByText(/Memuat laporan/)).toBeInTheDocument()
  })

  it('TC-FE-007-06 202 claimable false: label tunggu finalisasi, tanpa tombol klaim', async () => {
    renderApp('/laporan')
    expect(await screen.findByText('45 bisa diklaim setelah finalisasi')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /klaim/i })).not.toBeInTheDocument()
  })
})
