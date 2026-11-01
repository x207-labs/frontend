import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { obligations } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'
import { decomposeCycles } from '../lib/cycles'

const near = (n: string) => `${n}.x207-circle.near`
const edge = (d: string, c: string, amount: string, cleared: string | null, remaining: string | null) => ({
  debtor: near(d), creditor: near(c), amount, seq: 1, cleared, remaining,
})
const staged = (stage: string, edges: ReturnType<typeof edge>[]) => ({
  ...obligations(42, stage), stage, edgeCount: edges.length, edges,
  totalObligation: edges.reduce((s, e) => s + BigInt(e.amount), 0n).toString(),
})
const only = (stage: string, body: unknown) => (path: string) =>
  path.includes('/obligations') && path.includes(`stage=${stage}`) ? { status: 200, body } : undefined

describe('grafik kewajiban', () => {
  it('TC-FE-006-01 graf berarah: jumlah sisi sama dengan edgeCount', async () => {
    renderApp('/grafik?epoch=42')
    expect(await screen.findByText(/2 kewajiban senilai/)).toBeInTheDocument()
    const graph = screen.getByRole('img', { name: /Epoch berjalan, 2 sisi/ })
    expect(graph.querySelectorAll('line.edge')).toHaveLength(2)
    expect(within(graph.closest('figure')!).getAllByText(/translator|summarizer|scraper|gpu/).length).toBeGreaterThan(0)
  })

  it('TC-FE-006-02 sesudah kliring: sisi remaining 0 redup dan total terhapus = jumlah cleared', async () => {
    renderApp('/grafik?epoch=42')
    expect(await screen.findByText(/Nilai terhapus:/)).toHaveTextContent('377,74')
    expect(screen.getByTestId('edge-after-translator-summarizer')).toHaveClass('edge-dim')
    expect(screen.getByTestId('edge-after-scraper-gpu')).not.toHaveClass('edge-dim')
    expect(screen.getByTestId('edge-before-translator-summarizer')).not.toHaveClass('edge-dim')
  })

  it('TC-FE-006-03 siklus translator → summarizer → scraper → translator disorot dengan nilai 5 per sisi', async () => {
    const e = [
      edge('translator', 'summarizer', '10000000', '5000000', '5000000'),
      edge('summarizer', 'scraper', '8000000', '5000000', '3000000'),
      edge('scraper', 'translator', '7000000', '5000000', '2000000'),
    ]
    renderApp('/grafik?epoch=42', (p) => only('live', staged('live', e.map((x) => ({ ...x, cleared: null, remaining: null }))))(p) ?? only('cleared', staged('cleared', e))(p))
    const item = await screen.findByText(/→.*→.*→/)
    // Siklus yang sama dengan awal berbeda: scraper → translator → summarizer → scraper.
    for (const name of ['translator', 'summarizer', 'scraper']) expect(item).toHaveTextContent(name)
    expect(item).toHaveTextContent('5 per sisi')
  })

  it('TC-FE-006-04 epoch open tanpa edge', async () => {
    renderApp('/grafik?epoch=42', only('live', staged('live', [])))
    expect(await screen.findByText(/Belum ada kewajiban terdaftar/)).toBeInTheDocument()
  })

  it('TC-FE-006-05 stage cleared kosong: kliring belum diterapkan', async () => {
    renderApp('/grafik?epoch=42', only('cleared', staged('cleared', [])))
    expect(await screen.findByText(/Kliring belum diterapkan/)).toBeInTheDocument()
  })

  it('TC-FE-006-06 loading di area graf', async () => {
    renderApp('/grafik?epoch=42', (p) => (p.includes('/obligations') ? { status: 200, body: staged('live', []), delayMs: 40 } : undefined))
    expect(await screen.findByText(/Memuat kewajiban/)).toBeInTheDocument()
  })

  it.each([
    [409, 'epoch_not_closed', /belum ditutup/],
    [404, 'epoch_not_found', /Epoch tidak ditemukan/],
  ])('TC-FE-006-07 stage cleared %s %s', async (status, code, text) => {
    renderApp('/grafik?epoch=42', (p) => (p.includes('stage=cleared') ? apiError(status, code) : undefined))
    expect(await screen.findByText(text)).toBeInTheDocument()
  })

  it('TC-FE-006-07 503 pada stage live menampilkan kodenya', async () => {
    renderApp('/grafik?epoch=42', (p) => (p.includes('stage=live') ? apiError(503, 'indexer_unavailable') : undefined))
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('indexer_unavailable')
  })
})

describe('decomposeCycles', () => {
  it('menguraikan dua siklus yang berbagi sisi', () => {
    const c = (d: string, k: string, v: number) => ({ debtor: d, creditor: k, cleared: BigInt(v) })
    const cycles = decomposeCycles([c('a', 'b', 8), c('b', 'a', 3), c('b', 'c', 5), c('c', 'a', 5)])
    expect(cycles.reduce((s, x) => s + x.amount * BigInt(x.path.length - 1), 0n)).toBe(21n)
    expect(cycles.map((x) => x.path.length - 1).sort()).toEqual([2, 3])
  })
  it('tanpa sisi terhapus tidak ada siklus', () => {
    expect(decomposeCycles([{ debtor: 'a', creditor: 'b', cleared: 0n }])).toEqual([])
  })
})
