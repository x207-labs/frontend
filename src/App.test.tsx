import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { epochs } from './api/fixtures'
import { pages } from './routes'
import { apiError, renderApp } from './test/render'

const EPOCHS_PATH = '/x207/circles/agents-main/epochs'

describe('kerangka dashboard', () => {
  it.each(pages)('$path membuka $title', async ({ path, title }) => {
    renderApp(path)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })

  it('TC-FE-002-01 sebelas halaman (F1-F4, tata kelola, marketplace F9, akses F8, invoice P8 dan pesanan P6) terbuka dari satu navigasi', async () => {
    const user = userEvent.setup()
    renderApp('/')
    const nav = screen.getByRole('navigation', { name: 'Halaman' })
    expect(within(nav).getAllByRole('link')).toHaveLength(11)
    for (const { title } of pages) {
      await user.click(within(nav).getByRole('link', { name: title }))
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    }
  })

  it('TC-FE-002-02 pemilih epoch urut turun dan memanggil {n} terpilih', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/statistik')
    const select = await screen.findByRole('combobox', { name: 'Epoch' })
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['42', '41', '40'])
    await user.selectOptions(select, '41')
    await waitFor(() => expect(calls().some((c) => c.endsWith('/epochs/41/metrics'))).toBe(true))
  })

  it('epoch terpilih ikut berpindah halaman', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/statistik')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Epoch' }), '40')
    await user.click(screen.getByRole('link', { name: 'Laporan 207' }))
    await waitFor(() => expect(calls().some((c) => c.endsWith('/epochs/40'))).toBe(true))
    expect(screen.getByRole('combobox', { name: 'Epoch' })).toHaveValue('40')
  })

  it('TC-FE-002-03 loading di pemilih epoch', () => {
    renderApp('/statistik', (p) =>
      p.endsWith('/epochs') ? { status: 200, body: { items: epochs }, delayMs: 2000 } : undefined,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Memuat epoch')
  })

  it('TC-FE-002-04 error menyebut kode dan coba lagi bekerja', async () => {
    const user = userEvent.setup()
    let down = true
    renderApp('/onboarding', (p) =>
      p.endsWith('/epochs') && down ? apiError(503, 'indexer_unavailable', 'Indexer belum siap') : undefined,
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('indexer_unavailable')
    down = false
    await user.click(within(alert).getByRole('button', { name: 'Coba lagi' }))
    expect(await screen.findByRole('combobox', { name: 'Epoch' })).toBeInTheDocument()
  })

  it('TC-FE-002-05 kosong: tidak memanggil endpoint per epoch', async () => {
    const { calls } = renderApp('/statistik', (p) =>
      p === EPOCHS_PATH ? { status: 200, body: { items: [], nextCursor: null } } : undefined,
    )
    expect(await screen.findByText('Belum ada epoch di lingkaran ini.')).toBeInTheDocument()
    expect(calls().filter((c) => /\/epochs\/\d+/.test(c))).toEqual([])
  })
})
