import axe from 'axe-core'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BARTER, BARTER_TOTAL, DEFAULTER, EDGES, EPOCH8, NET } from './facts'
import Landing from './Landing'

const sum = (xs: readonly number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100

describe('FE-044 landing page facts', () => {
  it('the 24 obligations of epoch 8 add up to the gross credit the page shows', () => {
    expect(EDGES).toHaveLength(EPOCH8.vouchers)
    expect(sum(EDGES.map(([, , credit]) => credit))).toBe(EPOCH8.gross)
    for (const [from, to] of EDGES) {
      expect(from).not.toBe(to)
      expect(Math.max(from, to)).toBeLessThan(EPOCH8.members)
    }
  })

  it('the net positions are the edges netted: they sum to zero, debtors pay in what the page says moved, and the counts match', () => {
    const fromEdges = Array.from({ length: EPOCH8.members }, (_, m) => sum(EDGES.map(([from, to, c]) => (from === m ? c : to === m ? -c : 0))))
    expect(fromEdges).toEqual(NET.map((n) => n + 0))
    expect(Math.abs(sum(NET))).toBe(0)
    expect(sum(NET.filter((n) => n > 0))).toBe(EPOCH8.moved)
    expect(NET.filter((n) => n > 0)).toHaveLength(EPOCH8.debtors)
    expect(NET.filter((n) => n < 0)).toHaveLength(EPOCH8.creditors)
    expect(NET.filter((n) => n !== 0)).toHaveLength(EPOCH8.movements)
    expect(NET[DEFAULTER]).toBe(EPOCH8.defaultDue)
    expect(Math.round((EPOCH8.moved / EPOCH8.gross) * 1000) / 10).toBe(EPOCH8.movedShare)
    expect(Math.round((EPOCH8.cleared / EPOCH8.gross) * 1000) / 10).toBe(EPOCH8.clearedShare)
  })

  it('the barter catalog has 94 entries, 9 of them refused', () => {
    expect(BARTER_TOTAL).toBe(94)
    expect(BARTER.find((r) => r.key === 'refused')?.count).toBe(9)
  })
})

describe('FE-044 landing page', () => {
  it('renders every section, links to the dashboard, and has one dot per catalog entry', () => {
    const { container } = render(<Landing />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('x402 lets agents pay. x207 lets many agents settle at once.')
    for (const name of [/Many lines become a few arrows/, /Epoch 8:/, /Pay in what you have/, /What x207 is not/, /Start from one line/, /Check it yourself/]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Open dashboard' })).toHaveAttribute('href', '/stats')
    expect(container.querySelectorAll('.dot')).toHaveLength(BARTER_TOTAL)
    expect(container.querySelectorAll('.ring-voucher').length).toBe(EDGES.length * 2)
    const limits = screen.getByRole('heading', { level: 2, name: /What x207 is not/ }).closest('section')!
    expect(within(limits).getByText(/No transaction has run on mainnet/)).toBeInTheDocument()
    expect(document.title).toContain('x207')
  })

  it('has no serious or critical axe violation', async () => {
    const { container } = render(<Landing />)
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] })
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')})`)).toEqual([])
  })
})
