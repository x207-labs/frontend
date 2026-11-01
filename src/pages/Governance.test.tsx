import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { params, paramsHistory } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'

const HISTORY = '/params/history'
const row = (name: string) => screen.getAllByText(name, { selector: 'td > code' })[0].closest('tr')!

describe('tata kelola', () => {
  it('TC-FE-014-01 sembilan parameter dengan satuan menit dan persen', async () => {
    renderApp('/tata-kelola')
    await screen.findByText('Peluruhan limit')
    for (const key of ['epoch_length', 'proposal_window', 'base_limit_ratio', 'limit_growth', 'limit_cap', 'limit_decay', 'fees', 'admission']) {
      expect(row(key)).toBeInTheDocument()
    }
    expect(row('epoch_length')).toHaveTextContent('60 menit')
    expect(row('proposal_window')).toHaveTextContent('10 menit')
    expect(row('base_limit_ratio')).toHaveTextContent('80%')
    expect(row('limit_cap')).toHaveTextContent('1.000')
  })

  it('TC-FE-014-02 perubahan tertunda ditandai epoch berlakunya', async () => {
    renderApp('/tata-kelola')
    const pending = await screen.findByText('45 menit, berlaku mulai epoch 43')
    expect(pending.closest('tr')).toHaveTextContent('30 menit')
  })

  it('K-37 tanpa perubahan tertunda', async () => {
    renderApp('/tata-kelola', (p) =>
      p.endsWith('/params') ? { status: 200, body: { ...params, nextEpoch: null, nextEpochEffective: null } } : undefined,
    )
    await screen.findByText('Peluruhan limit')
    expect(screen.queryByText(/berlaku mulai epoch/)).not.toBeInTheDocument()
  })

  it('TC-FE-014-03 riwayat urut terbaru sesuai respons', async () => {
    renderApp('/tata-kelola')
    await screen.findByText('Riwayat perubahan')
    await waitFor(() => expect(screen.getByText('171234001')).toBeInTheDocument())
    const blocks = screen.getAllByRole('row').flatMap((r) => (/1712340|1711002/.test(r.textContent ?? '') ? [r.textContent] : []))
    expect(blocks[0]).toContain('171234001')
    expect(blocks[1]).toContain('171100220')
  })

  it('TC-FE-014-04 riwayat kosong', async () => {
    renderApp('/tata-kelola', (p) => (p.endsWith(HISTORY) ? { status: 200, body: { items: [], nextCursor: null } } : undefined))
    expect(await screen.findByText('Belum ada perubahan parameter.')).toBeInTheDocument()
  })

  it('TC-FE-014-05 loading lalu error 503', async () => {
    renderApp('/tata-kelola', (p) => (p.endsWith('/params') ? { ...apiError(503, 'indexer_unavailable'), delayMs: 30 } : undefined))
    expect(await screen.findByText(/Memuat parameter/)).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('indexer_unavailable')
  })

  it('Selesai bila: nilai baru dan riwayat tampil tanpa reload manual', async () => {
    let applied = false
    renderApp(
      '/tata-kelola',
      (p) => {
        if (!applied) return undefined
        if (p.endsWith('/params')) return { status: 200, body: { ...params, active: { ...params.active, payment_window: 2700 }, nextEpoch: null, nextEpochEffective: null } }
        if (p.endsWith(HISTORY)) return { status: 200, body: { items: [{ field: 'payment_window', oldValue: 2700, newValue: 3000, effectiveEpoch: 44, blockHeight: 171300000 }, ...paramsHistory.items], nextCursor: null } }
      },
      20,
    )
    await screen.findByText('45 menit, berlaku mulai epoch 43')
    applied = true
    expect(await screen.findByText('171300000')).toBeInTheDocument()
    expect(row('epoch_length')).toBeInTheDocument()
    expect(screen.queryByText(/berlaku mulai epoch 43/)).not.toBeInTheDocument()
  })
})
