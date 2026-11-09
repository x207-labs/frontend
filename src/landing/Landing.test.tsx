import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  // The counts come from one source, docs/barter-evidence.md "The counts" of the umbrella repository. When the frontend is checked out inside the
  // umbrella, the table is read and every row must match; a standalone checkout of this repository skips the comparison.
  const evidence = resolve(process.cwd(), '..', 'docs', 'barter-evidence.md')
  it.skipIf(!existsSync(evidence))('the barter counts match the table "The counts" of docs/barter-evidence.md', () => {
    const table = readFileSync(evidence, 'utf8').split('## The counts')[1].split('\n\n')[1]
    const rows = Object.fromEntries([...table.matchAll(/^\| (?:`([^`]+)`|\*\*All\*\*) \| (?:\*\*)?(\d+)/gm)].map(([, status, n]) => [status ?? 'All', Number(n)]))
    const statusOf: Record<(typeof BARTER)[number]['key'], string> = {
      testnet: 'testnet', sandbox: 'sandbox', mock: 'mock', unit: 'unit', generic: 'generic', p1: 'P1 in progress', roadmap: 'roadmap', refused: 'X',
    }
    expect(Object.fromEntries(BARTER.map((r) => [statusOf[r.key], r.count]))).toEqual(Object.fromEntries(Object.entries(rows).filter(([k]) => k !== 'All')))
    expect(BARTER_TOTAL).toBe(rows.All)
  })
})

describe('FE-044 landing page', () => {
  it('renders every section, links to the dashboard, and has one dot per catalog entry', () => {
    const { container } = render(<Landing />)
    // FE-048: the headline cycles the asset kinds on screen; its accessible name stays one sentence.
    expect(screen.getByRole('heading', { level: 1, name: 'Agents pay in anything. x207 settles the net.' })).toBeInTheDocument()
    const chapters = [/Anything with value can pay/, /Sign now, settle later/, /Loops cancel out/, /Only the net moves/]
    for (const name of [...chapters, /ways to pay\. \d+ refused on purpose/, /What x207 is not/, /Start from one line/, /Check it yourself/]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    // FE-045: every dashboard link opens the live circle v018
    expect(screen.getByRole('link', { name: 'Open dashboard' })).toHaveAttribute('href', '/stats?circle=v018')
    for (const link of screen.getAllByRole('link', { name: /^(Open the dashboard|Dashboard)$/ })) expect(link).toHaveAttribute('href', '/stats?circle=v018')
    expect(container.querySelectorAll('.dot')).toHaveLength(BARTER_TOTAL)
    // Without WebGL (jsdom) the theatre shows the flat ring of epoch 8 in the brain's place: one arc per voucher.
    expect(container.querySelectorAll('.ring-voucher').length).toBe(EDGES.length)
    // FE-048: every chapter figure is a number from facts.ts, read out in full to screen readers.
    expect(screen.getByRole('heading', { level: 2, name: /Anything with value can pay/ }).closest('article')).toHaveTextContent(String(BARTER_TOTAL - BARTER.find((r) => r.key === 'refused')!.count))
    expect(screen.getByRole('heading', { level: 2, name: /Only the net moves/ }).closest('article')).toHaveTextContent(`${EPOCH8.gross} → ${EPOCH8.moved.toFixed(2)}`)
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
