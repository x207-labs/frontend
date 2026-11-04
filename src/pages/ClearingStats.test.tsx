import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { metrics } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'

const fact = (term: string) => screen.getByText(term, { selector: 'dt' }).closest('div')!

describe('clearing stats', () => {
  it('TC-FE-008-01 metrics of epoch 42', async () => {
    renderApp('/stats?epoch=42')
    expect(await screen.findByText('512 vouchers become 3 transfers.')).toBeInTheDocument()
    expect(fact('Cleared ratio')).toHaveTextContent('0.71')
    expect(fact('Transfer savings')).toHaveTextContent('170.67')
    expect(fact('Graph density')).toHaveTextContent('0.4667')
  })

  it('TC-FE-008-02 one dot per epoch in each chart and a table row', async () => {
    renderApp('/stats?epoch=42')
    await screen.findByText('Per epoch')
    await waitFor(() => expect(screen.getAllByTestId('dot-40')).toHaveLength(2))
    expect(screen.getAllByTestId('dot-41')).toHaveLength(2)
    expect(screen.getAllByTestId('dot-42')).toHaveLength(2)
    const row = screen.getAllByRole('row').find((r) => within(r).queryByText('41'))!
    expect(row).toHaveTextContent('0.3')
    expect(row).toHaveTextContent('60')
  })

  it('TC-FE-008-03 defaultRate null is not 0, extra metrics show', async () => {
    renderApp('/stats?epoch=42')
    await screen.findByText('512 vouchers become 3 transfers.')
    expect(fact('Default rate')).toHaveTextContent('not available')
    expect(fact('Net debt reduction')).toHaveTextContent('71%')
    expect(fact('Clearing time')).toHaveTextContent('604 seconds')
  })

  it('K-38 an epoch not yet committed shows empty values', async () => {
    const open = { ...metrics[42], phase: 'open', clearedRatio: null, residualTransfers: null, transferSavings: null, cleared: null, debtReduction: null, clearingTimeSeconds: null }
    renderApp('/stats?epoch=42', (p) => (p.endsWith('/epochs/42/metrics') ? { status: 200, body: open } : undefined))
    expect(await screen.findByText(/vouchers registered, clearing not run yet/)).toBeInTheDocument()
    expect(fact('Cleared ratio')).toHaveTextContent('not available')
  })

  it('TC-FE-008-04 empty', async () => {
    renderApp('/stats', (p) => (p.endsWith('/epochs') ? { status: 200, body: { items: [], nextCursor: null } } : undefined))
    expect(await screen.findByText('No epoch with clearing metrics yet.')).toBeInTheDocument()
  })

  it('TC-FE-008-05 loading then error', async () => {
    renderApp('/stats', (p) => (p.endsWith('/metrics') ? { ...apiError(503, 'indexer_unavailable'), delayMs: 30 } : undefined))
    expect(await screen.findByText(/Loading (epoch|metrics)/)).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('indexer_unavailable')
  })

  it('TC-FE-008-05 404 error names the code', async () => {
    renderApp('/stats', (p) => (p.endsWith('/metrics') ? apiError(404, 'epoch_not_found') : undefined))
    expect(await screen.findByRole('alert')).toHaveTextContent('epoch_not_found')
  })
})

describe('default epoch and headline', () => {
  it('defaultEpoch picks the newest finalized epoch, then any epoch past the cutoff, then the newest', async () => {
    const { defaultEpoch } = await import('../epoch')
    const e = (epoch: number, phase: string) => ({ epoch, phase, proposalDeadline: null }) as never
    expect(defaultEpoch([e(5, 'cutoff'), e(4, 'commit'), e(3, 'payment_window'), e(2, 'finalized'), e(1, 'finalized')])?.epoch).toBe(2)
    expect(defaultEpoch([e(5, 'cutoff'), e(4, 'commit')])?.epoch).toBe(4)
    expect(defaultEpoch([e(5, 'cutoff'), e(4, 'open')])?.epoch).toBe(5)
    expect(defaultEpoch([])).toBeNull()
  })
})

describe('default epoch with clearing results and honest labels for epochs without one', () => {
  const e = (epoch: number, phase: string) => ({ epoch, phase, proposalDeadline: null }) as never
  it('defaultEpoch skips a newer finalized epoch with no vouchers and lands on the newest one that cleared something', async () => {
    const { defaultEpoch } = await import('../epoch')
    const items = [e(7, 'cutoff'), e(6, 'commit'), e(5, 'finalized'), e(4, 'finalized'), e(2, 'finalized')]
    const results = new Map([[5, { cleared: '0', voucherCount: 0 }], [4, { cleared: '0', voucherCount: 20 }], [2, { cleared: '210000000', voucherCount: 210 }]])
    expect(defaultEpoch(items, results)?.epoch).toBe(2)
    expect(defaultEpoch(items, new Map([[5, { cleared: '0', voucherCount: 0 }], [4, { cleared: '0', voucherCount: 20 }]]))?.epoch).toBe(4)
    expect(defaultEpoch(items)?.epoch).toBe(5)
  })

  it('noResultText says finalized-empty, overdue and in-progress as they are, never as a zero result', async () => {
    const { noResultText } = await import('./ClearingStats')
    const m = (phase: string, voucherCount: number) => ({ epoch: 6, phase, voucherCount }) as never
    expect(noResultText(m('finalized', 0), null)).toBe('Epoch 6 finalized with no vouchers, so nothing was cleared.')
    expect(noResultText(m('commit', 0), '2026-11-04T07:37:51Z', Date.parse('2026-11-04T08:10:00Z'))).toContain('did not finish')
    expect(noResultText(m('commit', 0), '2026-11-04T07:37:51Z', Date.parse('2026-11-04T08:10:00Z'))).toContain('2026-11-04 07:37 UTC')
    expect(noResultText(m('cutoff', 3), null)).toBe('Epoch 6 is in progress (phase cutoff): 3 vouchers registered, clearing not run yet.')
  })
})

describe('an epoch with no vouchers is never shown as a zero result', () => {
  it('a finalized epoch with 0 vouchers says it had none', async () => {
    renderApp('/stats?epoch=42', (p) => (p.endsWith('/epochs/42/metrics') ? { status: 200, body: { ...metrics[42], phase: 'finalized', voucherCount: 0, residualTransfers: 0, cleared: '0' } } : undefined))
    expect(await screen.findByText(/finalized with no vouchers, so nothing was cleared/)).toBeInTheDocument()
    expect(screen.queryByText(/vouchers become 0 transfers/)).toBeNull()
  })
})

describe('an epoch past its cutoff that nobody closed', () => {
  it('says it passed its cutoff and was not closed, and says in progress before the cutoff', async () => {
    const { noResultText } = await import('./ClearingStats')
    const m = { epoch: 9, phase: 'cutoff', voucherCount: 0 } as never
    expect(noResultText(m, null, Date.parse('2026-11-04T08:54:00Z'), '2026-11-04T08:43:59Z')).toBe('Epoch 9 passed its cutoff at 2026-11-04 08:43 UTC and has not been closed yet, so there is no clearing result.')
    expect(noResultText(m, null, Date.parse('2026-11-04T08:40:00Z'), '2026-11-04T08:43:59Z')).toContain('is in progress (phase cutoff)')
  })
})
