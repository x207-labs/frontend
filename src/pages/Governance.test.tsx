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
  it('FE-037 thirteen parameters; the four newer ones have units, and one the read API does not report shows a dash', async () => {
    renderApp('/governance')
    await screen.findByText('Limit decay')
    expect(row('bond_threshold')).toHaveTextContent('100')
    expect(row('bond_bps')).toHaveTextContent('20%')
    expect(row('max_search_share_bps')).toHaveTextContent('5%')
    expect(row('prune_delay_epochs')).toHaveTextContent('2 epochs')
  })

  it('FE-037 an older read API without the four newer fields does not break the page', async () => {
    const { bond_threshold, bond_bps, max_search_share_bps, prune_delay_epochs, ...old } = params.active
    void [bond_threshold, bond_bps, max_search_share_bps, prune_delay_epochs]
    renderApp('/governance', (p) => (p.endsWith('/params') ? { status: 200, body: { ...params, active: old, nextEpoch: null, nextEpochEffective: null } } : undefined))
    await screen.findByText('Limit decay')
    expect(row('bond_bps')).toHaveTextContent('—')
    expect(row('epoch_length')).toHaveTextContent('60 minutes')
  })

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

  it('TC-FE-043-01 the relayer fee of contract 0.0.16 is a parameter in credit; a read API that does not report it shows a dash', async () => {
    renderApp('/governance')
    await screen.findByText('Limit decay')
    expect(row('relayer_fee')).toHaveTextContent('0.1')
    const { relayer_fee, ...old } = params.active
    void relayer_fee
    renderApp('/governance', (p) => (p.endsWith('/params') ? { status: 200, body: { ...params, active: old, nextEpoch: null, nextEpochEffective: null } } : undefined))
    await waitFor(() => expect(screen.getAllByText('relayer_fee', { selector: 'td > code' }).at(-1)!.closest('tr')).toHaveTextContent('—'))
  })

  it('TC-FE-043-02 relayer_fee_paid and relayer_fee_failed are listed newest first, a failed fee says it was not paid', async () => {
    renderApp('/governance')
    await screen.findByText('Relayer fees')
    const failed = await screen.findByText('relayer_fee_failed', { selector: 'code' })
    const paid = screen.getByText('relayer_fee_paid', { selector: 'code' })
    expect(failed.closest('tr')).toHaveTextContent('Failed, not paid')
    expect(failed.closest('tr')).toHaveTextContent('0.1')
    expect(paid.closest('tr')).toHaveTextContent('Paid')
    expect(paid.closest('tr')).toHaveTextContent('claim')
    expect(failed.compareDocumentPosition(paid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(paid.closest('tr')!.querySelector('a')).toHaveAttribute('href', expect.stringContaining('/txns/FeeTx'))
  })

  it('TC-FE-043-03 a circle without relayer fee events says so', async () => {
    renderApp('/governance', (p) => (p.includes('/events') ? { status: 200, body: { circle: 'agents-main', items: [], nextCursor: null, more: false } } : undefined))
    expect(await screen.findByText(/No relayer fee events yet/)).toBeInTheDocument()
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
