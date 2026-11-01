import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { members } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'

const defaulted = {
  unit: 'credit', decimals: 6, nextCursor: null,
  items: [{ epoch: 42, phase: 'finalized', account: 'scraper.x207-circle.near', role: 'debtor', net: '-35000000', amount: '35000000', status: 'defaulted', stakeSlashed: '35000000', haircut: '0' }],
}

describe('risiko', () => {
  it('TC-FE-012-01 tabel status, stake, limit, headroom, riwayat', async () => {
    renderApp('/risiko')
    const row = (await screen.findByText('scraper')).closest('tr')!
    expect(within(row).getByText('active')).toBeInTheDocument()
    expect(row).toHaveTextContent('37,5')
    expect(row).toHaveTextContent('35')
  })

  it('TC-FE-012-02 daftar default dengan potongan stake memanggil status=defaulted', async () => {
    const { calls } = renderApp('/risiko', (p) => (p.includes('status=defaulted') ? { status: 200, body: defaulted } : undefined))
    await screen.findByRole('heading', { name: 'Default di epoch 42' })
    expect((await screen.findAllByText('35')).length).toBeGreaterThan(0)
    expect(calls().some((c) => c.endsWith('/epochs/42/settlements?status=defaulted'))).toBe(true)
  })

  it('TC-FE-012-03 tidak ada default', async () => {
    renderApp('/risiko')
    expect(await screen.findByText('Tidak ada default di epoch ini.')).toBeInTheDocument()
  })

  it('TC-FE-012-04 loading', async () => {
    renderApp('/risiko', (p) => (p.endsWith('/members') ? { status: 200, body: { items: members }, delayMs: 50 } : undefined))
    expect(await screen.findByText(/Memuat anggota/)).toBeInTheDocument()
  })

  it.each([
    [404, 'circle_not_found'],
    [503, 'indexer_unavailable'],
  ])('TC-FE-012-05 error %i %s', async (status, code) => {
    renderApp('/risiko', (p) => (p.endsWith('/members') ? apiError(status, code) : undefined))
    expect(await screen.findByRole('alert')).toHaveTextContent(code)
  })

  it('anggota suspended tampil dengan limit 0', async () => {
    const suspended = members.map((m) => (m.account.startsWith('scraper') ? { ...m, status: 'suspended', limit: '0', headroom: '0' } : m))
    renderApp('/risiko', (p) => (p.endsWith('/members') ? { status: 200, body: { items: suspended, nextCursor: null } } : undefined))
    const row = (await screen.findByText('scraper')).closest('tr')!
    expect(within(row).getByText('suspended')).toBeInTheDocument()
    expect(within(row).getAllByText('0').length).toBeGreaterThanOrEqual(2)
  })
})
