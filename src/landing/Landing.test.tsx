import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import axe from 'axe-core'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BARTER, BARTER_TOTAL, DEFAULTER, EDGES, EPOCH8, KIND_CLASSES, NET } from './facts'
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

  it('FE-051: clearing and settlement tell one story: the loops cancel part of the gross, the rest nets down to what moved', () => {
    expect(sum([EPOCH8.cleared, EPOCH8.netted])).toBe(EPOCH8.gross)
    expect(EPOCH8.moved).toBeLessThan(EPOCH8.netted)
    render(<Landing />)
    expect(screen.getByText(`${EPOCH8.cleared} of ${EPOCH8.gross} credit cancels in loops and never moves.`)).toBeTruthy()
    expect(screen.getByText(`The other ${EPOCH8.netted} nets per member: ${EPOCH8.movements} transfers move ${EPOCH8.moved} USDT.`)).toBeTruthy()
    expect(document.body.textContent).not.toContain('never had to move')
  })

  // jsdom applies no media query, so the reduced-motion block of landing.css is read as text: it must stop every loop, the shelf marquee included.
  it('FE-052: reduced motion stops every animation; the marquee wraps in place and its copy goes', () => {
    const css = readFileSync(resolve(process.cwd(), 'src', 'landing', 'landing.css'), 'utf8')
    const block = css.split('@media (prefers-reduced-motion: reduce)')[1].split('\n}')[0]
    expect(block).toContain('.lp *, .lp *::before, .lp *::after { animation: none !important;')
    expect(block).toContain('.lp .shelf-track { width: auto; }')
    expect(block).toContain('.lp .kinds { flex-wrap: wrap;')
    expect(block).toContain('.lp .kinds.is-copy { display: none; }')
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

  // FE-051: the shelf names every kind. Each id, code and status must be the row of docs/barter-evidence.md "Table", and the shelf must hold every row.
  it.skipIf(!existsSync(evidence))('the shelf kinds match the rows of the table "Table" of docs/barter-evidence.md', () => {
    const table = readFileSync(evidence, 'utf8').split('## Table')[1].split('\n## ')[0]
    const doc = [...table.matchAll(/^\| (X?\d+) \| `([^`]+)` \| `([^`]+)`/gm)].map(([, id, code, status]) => [id, code, status])
    const statusOf: Record<(typeof BARTER)[number]['key'], string> = {
      testnet: 'testnet', sandbox: 'sandbox', mock: 'mock', unit: 'unit', generic: 'generic', p1: 'P1 in progress', roadmap: 'roadmap', refused: 'X',
    }
    const shelf = KIND_CLASSES.flatMap((cls) => cls.kinds.map(([id, code, status]) => [id, code, statusOf[status]]))
    expect(shelf).toEqual(doc)
    for (const row of BARTER) expect(shelf.filter(([, , s]) => s === statusOf[row.key])).toHaveLength(row.count)
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
    // FE-051: one bar and one shelf tile per catalog entry (the marquee copy of each row is hidden from screen readers and not counted).
    expect(container.querySelectorAll('.strip .bar')).toHaveLength(BARTER_TOTAL)
    expect(container.querySelectorAll('.kinds:not(.is-copy) .kind')).toHaveLength(BARTER_TOTAL)
    for (const copy of container.querySelectorAll('.kinds.is-copy')) expect(copy).toHaveAttribute('aria-hidden', 'true')
    // FE-051: the hairline figures of Barter, Limits and Build are decorative and hidden from screen readers.
    const figures = container.querySelectorAll('svg.section-figure')
    expect([...figures].map((f) => f.closest('section')?.id)).toEqual(['barter', 'limits', 'build'])
    for (const f of figures) expect(f).toHaveAttribute('aria-hidden', 'true')
    // FE-051: the footer has the brand, the live contract, and the proof column.
    const footer = within(container.querySelector('footer')!)
    expect(footer.getByRole('link', { name: 'Every claim' })).toHaveAttribute('href', expect.stringContaining('CLAIMS.md'))
    expect(footer.getByText(/Testnet only, with a mock USDT/)).toBeInTheDocument()
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
