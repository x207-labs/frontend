import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { metrics } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'

const fact = (term: string) => screen.getByText(term, { selector: 'dt' }).closest('div')!

describe('statistik kliring', () => {
  it('TC-FE-008-01 metrik epoch 42', async () => {
    renderApp('/statistik')
    expect(await screen.findByText('512 voucher menjadi 3 transfer.')).toBeInTheDocument()
    expect(fact('Cleared ratio')).toHaveTextContent('0,71')
    expect(fact('Penghematan transfer')).toHaveTextContent('170,67')
    expect(fact('Kepadatan grafik')).toHaveTextContent('0,4667')
  })

  it('TC-FE-008-02 satu titik per epoch di tiap grafik dan baris tabel', async () => {
    renderApp('/statistik')
    await screen.findByText('Per epoch')
    await waitFor(() => expect(screen.getAllByTestId('dot-40')).toHaveLength(2))
    expect(screen.getAllByTestId('dot-41')).toHaveLength(2)
    expect(screen.getAllByTestId('dot-42')).toHaveLength(2)
    const row = screen.getAllByRole('row').find((r) => within(r).queryByText('41'))!
    expect(row).toHaveTextContent('0,3')
    expect(row).toHaveTextContent('60')
  })

  it('TC-FE-008-03 defaultRate null bukan 0, metrik tambahan tampil', async () => {
    renderApp('/statistik')
    await screen.findByText('512 voucher menjadi 3 transfer.')
    expect(fact('Default rate')).toHaveTextContent('belum tersedia')
    expect(fact('Penurunan net debt')).toHaveTextContent('71%')
    expect(fact('Waktu kliring')).toHaveTextContent('604 detik')
  })

  it('K-38 epoch belum commit menampilkan nilai kosong', async () => {
    const open = { ...metrics[42], phase: 'open', clearedRatio: null, residualTransfers: null, transferSavings: null, cleared: null, debtReduction: null, clearingTimeSeconds: null }
    renderApp('/statistik', (p) => (p.endsWith('/epochs/42/metrics') ? { status: 200, body: open } : undefined))
    expect(await screen.findByText(/belum ada hasil kliring/)).toBeInTheDocument()
    expect(fact('Cleared ratio')).toHaveTextContent('belum tersedia')
  })

  it('TC-FE-008-04 kosong', async () => {
    renderApp('/statistik', (p) => (p.endsWith('/epochs') ? { status: 200, body: { items: [], nextCursor: null } } : undefined))
    expect(await screen.findByText('Belum ada epoch dengan metrik kliring.')).toBeInTheDocument()
  })

  it('TC-FE-008-05 loading lalu error', async () => {
    renderApp('/statistik', (p) => (p.endsWith('/metrics') ? { ...apiError(503, 'indexer_unavailable'), delayMs: 30 } : undefined))
    expect(await screen.findByText(/Memuat metrik/)).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('indexer_unavailable')
  })

  it('TC-FE-008-05 error 404 menyebut kode', async () => {
    renderApp('/statistik', (p) => (p.endsWith('/metrics') ? apiError(404, 'epoch_not_found') : undefined))
    expect(await screen.findByRole('alert')).toHaveTextContent('epoch_not_found')
  })
})
