import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('obligation graph', () => {
  it('TC-FE-006-01 directed graph: the number of edges equals edgeCount', async () => {
    renderApp('/charts?epoch=42')
    expect(await screen.findByText(/2 obligations worth/)).toBeInTheDocument()
    // FE-070: one map with a Before/After switch; it opens on After clearing when the epoch has a clearing result
    const graph = screen.getByRole('img', { name: /After clearing, 2 edges/ })
    expect(graph.querySelectorAll('path.edge')).toHaveLength(2)
    expect(within(graph.closest('figure')!).getAllByText(/translator|summarizer|scraper|gpu/).length).toBeGreaterThan(0)
  })

  it('TC-FE-006-02 after clearing: edges with remaining 0 are dimmed and the cleared total = the sum of cleared', async () => {
    renderApp('/charts?epoch=42')
    // v4: the cleared total is a figure card (two decimals), not a pill in the sentence
    const figures = await screen.findByRole('region', { name: 'Headline figures' })
    expect(within(figures).getByText('Cleared in loops')).toBeInTheDocument()
    expect(within(figures).getByText('377.74')).toBeInTheDocument()
    expect(within(figures).getByText('35.00')).toBeInTheDocument()
    expect(screen.getByTestId('edge-after-translator-summarizer')).toHaveClass('edge-dim')
    expect(screen.getByTestId('edge-after-scraper-gpu')).not.toHaveClass('edge-dim')
    await userEvent.click(screen.getByRole('button', { name: 'Before clearing' }))
    expect(screen.getByTestId('edge-before-translator-summarizer')).not.toHaveClass('edge-dim')
    expect(screen.getByRole('img', { name: /Before clearing, 2 edges/ })).toBeInTheDocument()
  })

  it('TC-FE-070-01 without a clearing result the map shows the current epoch and no switch', async () => {
    renderApp('/charts?epoch=42', only('cleared', staged('cleared', [])))
    expect(await screen.findByRole('img', { name: /Current epoch, 2 edges/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Before clearing' })).not.toBeInTheDocument()
  })

  it('TC-FE-006-03 cycle translator → summarizer → scraper → translator is highlighted with value 5 per edge', async () => {
    const e = [
      edge('translator', 'summarizer', '10000000', '5000000', '5000000'),
      edge('summarizer', 'scraper', '8000000', '5000000', '3000000'),
      edge('scraper', 'translator', '7000000', '5000000', '2000000'),
    ]
    renderApp('/charts?epoch=42', (p) => only('live', staged('live', e.map((x) => ({ ...x, cleared: null, remaining: null }))))(p) ?? only('cleared', staged('cleared', e))(p))
    const item = await screen.findByText(/→.*→.*→/)
    // The same cycle with a different start: scraper → translator → summarizer → scraper.
    for (const name of ['translator', 'summarizer', 'scraper']) expect(item).toHaveTextContent(name)
    expect(item).toHaveTextContent('5 per edge')
  })

  it('TC-FE-006-04 open epoch with no edges', async () => {
    renderApp('/charts?epoch=42', only('live', staged('live', [])))
    expect(await screen.findByText(/No obligations registered/)).toBeInTheDocument()
  })

  it('TC-FE-006-05 empty cleared stage: clearing not applied yet', async () => {
    renderApp('/charts?epoch=42', only('cleared', staged('cleared', [])))
    expect(await screen.findByText(/Clearing has not been applied/)).toBeInTheDocument()
  })

  it('TC-FE-006-06 loading in the graph area', async () => {
    renderApp('/charts?epoch=42', (p) => (p.includes('/obligations') ? { status: 200, body: staged('live', []), delayMs: 40 } : undefined))
    expect(await screen.findByText(/Loading obligations/)).toBeInTheDocument()
  })

  it.each([
    [409, 'epoch_not_closed', /not closed yet/],
    [404, 'epoch_not_found', /Epoch not found/],
  ])('TC-FE-006-07 stage cleared %s %s', async (status, code, text) => {
    renderApp('/charts?epoch=42', (p) => (p.includes('stage=cleared') ? apiError(status, code) : undefined))
    expect(await screen.findByText(text)).toBeInTheDocument()
  })

  it('TC-FE-006-07 503 on the live stage shows its code', async () => {
    renderApp('/charts?epoch=42', (p) => (p.includes('stage=live') ? apiError(503, 'indexer_unavailable') : undefined))
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('indexer_unavailable')
  })
})

describe('decomposeCycles', () => {
  it('decomposes two cycles that share an edge', () => {
    const c = (d: string, k: string, v: number) => ({ debtor: d, creditor: k, cleared: BigInt(v) })
    const cycles = decomposeCycles([c('a', 'b', 8), c('b', 'a', 3), c('b', 'c', 5), c('c', 'a', 5)])
    expect(cycles.reduce((s, x) => s + x.amount * BigInt(x.path.length - 1), 0n)).toBe(21n)
    expect(cycles.map((x) => x.path.length - 1).sort()).toEqual([2, 3])
  })
  it('no cleared edge means no cycle', () => {
    expect(decomposeCycles([{ debtor: 'a', creditor: 'b', cleared: 0n }])).toEqual([])
  })
})

describe('FE-036 graph of an epoch whose edges were pruned', () => {
  const flagged = (flag: boolean) => (path: string) =>
    path.endsWith('/epochs') ? { status: 200, body: { items: [{ epoch: 42, phase: 'finalized', proposalDeadline: null, edgesUnavailable: flag }], nextCursor: null } } : undefined

  it('TC-FE-036-03 the note shows, and a graph with no edges says why instead of the empty-epoch text', async () => {
    renderApp('/charts?epoch=42', (p) => (p.includes('/obligations') ? { status: 200, body: staged('cutoff', []) } : flagged(true)(p)))
    expect(await screen.findByRole('note')).toHaveTextContent('Edges pruned on-chain; figures from the indexer.')
    expect(await screen.findAllByText(/pruned on-chain and the indexer has none for it, so there is no graph to draw/)).toHaveLength(2)
    expect(screen.queryByText('No obligations registered in this epoch yet.')).toBeNull()
  })

  it('TC-FE-036-04 the edges the indexer kept are still drawn, with the note above them', async () => {
    renderApp('/charts?epoch=42', flagged(true))
    expect(await screen.findByText(/2 obligations worth/)).toBeInTheDocument()
    expect(screen.getByRole('note')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /(Current epoch|After clearing), 2 edges/ })).toBeInTheDocument()
  })

  it('TC-FE-036-05 not flagged: no note and the usual empty text', async () => {
    renderApp('/charts?epoch=42', (p) => (p.includes('/obligations') ? { status: 200, body: staged('cutoff', []) } : flagged(false)(p)))
    expect(await screen.findByText('No obligations registered in this epoch yet.')).toBeInTheDocument()
    expect(screen.queryByRole('note')).toBeNull()
  })
})
