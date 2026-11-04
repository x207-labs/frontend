import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { params, paramsHistory } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'
import { formatField } from './Governance'

const HISTORY = '/params/history'
const row = (name: string) => screen.getAllByText(name, { selector: 'td > code' })[0].closest('tr')!

describe('formatField', () => {
  it('FE-035 the first history row has no old value: a dash, for fees too (it crashed the page)', () => {
    expect(formatField('fees', null)).toBe('—')
    expect(formatField('proposal_window', 60)).toBe('1 minute')
    expect(formatField('epoch_length', 600)).toBe('10 minutes')
    expect(formatField('epoch_length', null)).toBe('—')
    expect(formatField('fees', { clearing_fee_bps: 10, solver_fee_bps: 5 })).toBe('clearing 0.1%, solver 0.05%')
  })
})

describe('governance', () => {
  it('TC-FE-014-01 nine parameters with minute and percent units', async () => {
    renderApp('/governance')
    await screen.findByText('Limit decay')
    for (const key of ['epoch_length', 'proposal_window', 'base_limit_ratio', 'limit_growth', 'limit_cap', 'limit_decay', 'fees', 'admission']) {
      expect(row(key)).toBeInTheDocument()
    }
    expect(row('epoch_length')).toHaveTextContent('60 minutes')
    expect(row('proposal_window')).toHaveTextContent('10 minutes')
    expect(row('base_limit_ratio')).toHaveTextContent('80%')
    expect(row('limit_cap')).toHaveTextContent('1,000')
  })

  it('TC-FE-014-02 a pending change is marked with its effective epoch', async () => {
    renderApp('/governance')
    const pending = await screen.findByText('45 minutes, effective from epoch 43')
    expect(pending.closest('tr')).toHaveTextContent('30 minutes')
  })

  it('K-37 no pending change', async () => {
    renderApp('/governance', (p) =>
      p.endsWith('/params') ? { status: 200, body: { ...params, nextEpoch: null, nextEpochEffective: null } } : undefined,
    )
    await screen.findByText('Limit decay')
    expect(screen.queryByText(/effective from epoch/)).not.toBeInTheDocument()
  })

  it('TC-FE-014-03 history is newest first as in the response', async () => {
    renderApp('/governance')
    await screen.findByText('Change history')
    await waitFor(() => expect(screen.getByText('171234001')).toBeInTheDocument())
    const blocks = screen.getAllByRole('row').flatMap((r) => (/1712340|1711002/.test(r.textContent ?? '') ? [r.textContent] : []))
    expect(blocks[0]).toContain('171234001')
    expect(blocks[1]).toContain('171100220')
  })

  it('TC-FE-014-04 empty history', async () => {
    renderApp('/governance', (p) => (p.endsWith(HISTORY) ? { status: 200, body: { items: [], nextCursor: null } } : undefined))
    expect(await screen.findByText('No parameter changes yet.')).toBeInTheDocument()
  })

  it('TC-FE-014-05 loading then 503 error', async () => {
    renderApp('/governance', (p) => (p.endsWith('/params') ? { ...apiError(503, 'indexer_unavailable'), delayMs: 30 } : undefined))
    expect(await screen.findByText(/Loading parameters/)).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('indexer_unavailable')
  })

  it('Done when: the new value and the history show without a manual reload', async () => {
    let applied = false
    renderApp(
      '/governance',
      (p) => {
        if (!applied) return undefined
        if (p.endsWith('/params')) return { status: 200, body: { ...params, active: { ...params.active, payment_window: 2700 }, nextEpoch: null, nextEpochEffective: null } }
        if (p.endsWith(HISTORY)) return { status: 200, body: { items: [{ field: 'payment_window', oldValue: 2700, newValue: 3000, effectiveEpoch: 44, blockHeight: 171300000 }, ...paramsHistory.items], nextCursor: null } }
      },
      20,
    )
    await screen.findByText('45 minutes, effective from epoch 43')
    applied = true
    expect(await screen.findByText('171300000')).toBeInTheDocument()
    expect(row('epoch_length')).toBeInTheDocument()
    expect(screen.queryByText(/effective from epoch 43/)).not.toBeInTheDocument()
  })
})
