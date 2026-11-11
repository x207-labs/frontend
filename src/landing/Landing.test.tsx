import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import axe from 'axe-core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { BARTER, BARTER_TOTAL, DEFAULTER, EDGES, EPOCH8, KIND_CLASSES, LIVE, NET } from './facts'
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
    // the statement and its scale show exactly these figures: owed, moved, cancelled in loops, netted between pairs
    const { container } = render(<Landing />)
    const statement = container.querySelector('.statement')!
    expect(statement).toHaveTextContent('Owed between agents, 24 vouchers41.35credit')
    expect(statement).toHaveTextContent('Moved on chain, 14 transfers7.75mock USDT')
    expect(within(statement as HTMLElement).getByRole('img', { name: 'Of 41.35 owed: 7.75 moved, 21.80 cancelled in solver loops, 11.80 netted between pairs.' })).toBeInTheDocument()
    expect(statement).toHaveTextContent('21.80 cancelled in loops by the solver')
    expect(statement).toHaveTextContent('11.80 netted between pairs')
    expect(statement).toHaveTextContent('Recomputed in your browser from the 24 vouchers: matches the read API. Net positions sum to zero. Mock USDT on NEAR testnet.')
  })

  // jsdom applies no media query, so the reduced-motion block of landing.css is read as text: it must stop every loop and the smooth scroll.
  it('FE-052: reduced motion stops every animation and transition, and the smooth scroll', () => {
    const css = readFileSync(resolve(process.cwd(), 'src', 'landing', 'landing.css'), 'utf8')
    const block = css.split('@media (prefers-reduced-motion: reduce)')[1].split('\n}')[0]
    expect(block).toContain('.lp *, .lp *::before, .lp *::after { animation: none !important; transition: none !important; }')
    expect(block).toContain('html.is-landing { scroll-behavior: auto; }')
  })

  // UM-195: the bare boxd.sh origins answer 404 and the MCP endpoint answers 405 to a GET; a link people click must go to a path that answers 200.
  // The v4 landing shows these addresses as text to copy (the Proof and Build sections), and links none of them; this keeps it that way unless the path is right.
  it('UM-195: no link on the page points at a bare boxd.sh origin or the POST-only /mcp endpoint', () => {
    const { container } = render(<Landing />)
    for (const a of container.querySelectorAll('a[href*="boxd.sh"]')) {
      const u = new URL(a.getAttribute('href')!)
      expect(u.pathname, u.href).not.toBe('/')
      expect(u.pathname, u.href).not.toBe('/mcp')
    }
  })

  // The counts come from one source, docs/barter-evidence.md "The counts" of the umbrella repository. When the frontend is checked out inside the
  // umbrella, the table is read and every row must match; a standalone checkout of this repository skips the comparison.
  // X207_BARTER_EVIDENCE points at the table when the frontend is a git worktree outside the umbrella (e.g. worktrees/frontend-v4, where ../docs does not exist).
  const evidence = process.env.X207_BARTER_EVIDENCE ?? resolve(process.cwd(), '..', 'docs', 'barter-evidence.md')
  const statusOf: Record<(typeof BARTER)[number]['key'], string> = {
    testnet: 'testnet', sandbox: 'sandbox', mock: 'mock', unit: 'unit', generic: 'generic', p1: 'P1 in progress', roadmap: 'roadmap', refused: 'X',
  }
  it.skipIf(!existsSync(evidence))('the barter counts match the table "The counts" of docs/barter-evidence.md', () => {
    const table = readFileSync(evidence, 'utf8').split('## The counts')[1].split('\n\n')[1]
    const rows = Object.fromEntries([...table.matchAll(/^\| (?:`([^`]+)`|\*\*All\*\*) \| (?:\*\*)?(\d+)/gm)].map(([, status, n]) => [status ?? 'All', Number(n)]))
    expect(Object.fromEntries(BARTER.map((r) => [statusOf[r.key], r.count]))).toEqual(Object.fromEntries(Object.entries(rows).filter(([k]) => k !== 'All')))
    expect(BARTER_TOTAL).toBe(rows.All)
  })

  // The blue floor shows three of those counts: the kinds that can be offered (all but the refused), the ones that ran on testnet, and the ones run in near-sandbox.
  it.skipIf(!existsSync(evidence))('the counts on the blue floor are the rows of the table "The counts" of docs/barter-evidence.md', () => {
    const table = readFileSync(evidence, 'utf8').split('## The counts')[1].split('\n\n')[1]
    const rows = Object.fromEntries([...table.matchAll(/^\| (?:`([^`]+)`|\*\*All\*\*) \| (?:\*\*)?(\d+)/gm)].map(([, status, n]) => [status ?? 'All', Number(n)]))
    const { container } = render(<Landing />)
    const shown = [...container.querySelectorAll('.evidence > div')].map((d) => [d.querySelector('span')!.textContent, Number(d.querySelector('b')!.textContent)])
    expect(shown).toEqual([
      ['kinds can be offered', rows.All - rows.X],
      ['have run on testnet', rows.testnet],
      ['more in near-sandbox', rows.sandbox],
    ])
  })

  // FE-051: the table names every kind. Each id, code and status must be the row of docs/barter-evidence.md "Table", and the table must hold every row.
  it.skipIf(!existsSync(evidence))('the kinds of facts.ts match the rows of the table "Table" of docs/barter-evidence.md', () => {
    const table = readFileSync(evidence, 'utf8').split('## Table')[1].split('\n## ')[0]
    const doc = [...table.matchAll(/^\| (X?\d+) \| `([^`]+)` \| `([^`]+)`/gm)].map(([, id, code, status]) => [id, code, status])
    const shelf = KIND_CLASSES.flatMap((cls) => cls.kinds.map(([id, code, status]) => [id, code, statusOf[status]]))
    expect(shelf).toEqual(doc)
    for (const row of BARTER) expect(shelf.filter(([, , s]) => s === statusOf[row.key])).toHaveLength(row.count)
  })
})

describe('v4 landing page', () => {
  it('has one h1 and the sections of the draft, each with its heading', () => {
    const { container } = render(<Landing />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Many agent payments. One net settlement.' })).toBeInTheDocument()
    for (const name of ['Epoch 8 in two numbers', 'Agents pay with vouchers.', 'Loops cancel.', 'Every agent nets to one amount.', 'Debtors pay in once.', 'Creditors are paid.',
      'Anything with value can pay.', 'Check it yourself.', 'What x207 is not.', 'Start from one line.', 'Step inside the live circle.']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    // the draft's order: hero, statement, story, floor, proof, limits, build, footer, laptop
    const order = [...container.querySelectorAll('main > *')].map((e) => e.id || e.className.split(' ')[0])
    expect(order).toEqual(['hero', 'statement', 'story', 'barter', 'proof', 'limits', 'build', '', 'next'])
    expect(document.title).toContain('x207')
    // the first stop of the keyboard is the skip link, and it leads to the main content
    expect(screen.getByRole('link', { name: 'Skip to the content' })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })

  it('every dashboard link opens the live circle; Replay opens the clearing stats of epoch 8 itself', () => {
    render(<Landing />)
    const links = screen.getAllByRole('link', { name: /^Open (the )?dashboard$/ })
    expect(links.map((a) => a.textContent)).toEqual(['Open dashboard', 'Open the dashboard ↗', 'Open the dashboard ↗'])
    for (const link of links) expect(link).toHaveAttribute('href', '/app?circle=v018')
    expect(LIVE.dashboard).toBe('/app?circle=v018')
    expect(screen.getByRole('link', { name: 'Replay' })).toHaveAttribute('href', '/stats?circle=v013&epoch=8')
  })

  it('says plainly that it is testnet with mock USDT and what it is not', () => {
    const { container } = render(<Landing />)
    expect(screen.getByText(/x402 · NEAR testnet · epoch 8 replayed from chain data/)).toBeInTheDocument()
    const limits = screen.getByRole('heading', { level: 2, name: 'What x207 is not.' }).closest('section')!
    expect(within(limits).getByText('NEAR testnet with mock USDT. No mainnet transaction has been sent.')).toBeInTheDocument()
    expect(within(limits).getByText(/The contracts are tested, not externally audited\./)).toBeInTheDocument()
    expect(within(limits).getByText(/Epoch 8 burnt 109\.7 Tgas where 24 plain transfers burn 54\.9\./)).toBeInTheDocument()
    expect(within(limits).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Not credit without cash', 'Not a gas saving on NEAR', 'Not for a star', 'Not on mainnet', 'Not audited',
    ])
    expect(within(limits).getByRole('link', { name: 'security.md' })).toHaveAttribute('href', LIVE.security)
    expect(container.querySelector('footer')).toHaveTextContent('x207 · hackathon prototype · NEAR testnet, mock USDT')
  })

  it('the cards, the story and the proof show the numbers of epoch 8, and the recomputation matches on every row', () => {
    const { container } = render(<Landing />)
    const kpis = [...container.querySelectorAll('.kpi .v')].map((v) => v.textContent)
    expect(kpis).toEqual(['15agents', '41.35credit owed', '52.7%', '7.75mock USDT'])
    expect(container.querySelector('.story')).toHaveTextContent('24 vouchers add up to 41.35 owed')
    expect(container.querySelector('.story')).toHaveTextContent('0.55 comes out of the stake it locked when it joined')
    const proof = screen.getByRole('heading', { level: 2, name: 'Check it yourself.' }).closest('section')!
    const rows = within(proof).getAllByRole('listitem')
    expect(rows).toHaveLength(6)
    for (const row of rows) expect(row).toHaveTextContent(': matches the API')
    expect(proof).toHaveTextContent('x207-v013.testnet')
    expect(proof).toHaveTextContent('8, committed 4 Nov 2026 08:35 UTC, payment deadline 08:50 UTC')
    expect(proof).toHaveTextContent('curl https://x207.boxd.sh/x207/circles/agents-main/epochs/8')
  })

  it('the barter floor shows the eight kinds and the three counts', () => {
    const { container } = render(<Landing />)
    const floor = container.querySelector('#barter')!
    expect([...floor.querySelectorAll('.kinds li')].map((li) => li.textContent)).toEqual([
      'API access', 'Datasets', 'GPU hours', 'Content licenses', 'One-time codes', 'Rent and access grants', 'Service orders', 'NEAR accounts',
    ])
    expect(floor.querySelectorAll('.kinds li.on')).toHaveLength(1)
    expect([...floor.querySelectorAll('.evidence b')].map((b) => b.textContent)).toEqual(['85', '13', '13'])
    expect(within(floor as HTMLElement).getByRole('link', { name: 'barter-evidence.md' })).toHaveAttribute('href', LIVE.barterEvidence)
    expect(within(floor as HTMLElement).getByRole('img', { name: /Three agents trade in a loop/ })).toBeInTheDocument()
  })

  it('the build tabs are a real tablist: one selected tab, arrows move between them, the panel follows and the copy button leaves out comments', async () => {
    const user = userEvent.setup()
    render(<Landing />)
    const list = screen.getByRole('tablist', { name: 'Ways to start' })
    const tabs = within(list).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Claude or Codex', 'Read API', 'Run locally'])
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1])
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAccessibleName('Claude or Codex')
    expect(panel).toHaveTextContent(`claude mcp add --transport http x207 ${LIVE.mcp}`)
    await user.click(tabs[1])
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Read API')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('curl https://x207.boxd.sh/x207/circles/agents-main/epochs/8/obligations')
    await user.keyboard('{ArrowRight}')
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[2]).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('npm run demo:quick')
    await user.keyboard('{ArrowRight}')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{End}')
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Home}')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('without a canvas or WebGL (jsdom) the page keeps its static markup: canvases are decorative and hidden, the laptop section is only its copy and its link', () => {
    const { container } = render(<Landing />)
    const canvases = [...container.querySelectorAll('canvas')]
    expect(canvases).toHaveLength(2) // the hero ring and the story scene; the laptop's WebGL canvas is not rendered without WebGL
    for (const c of canvases) expect(c).toHaveAttribute('aria-hidden', 'true')
    const next = container.querySelector('#next')!
    expect(next).toHaveClass('is-static')
    expect(next.querySelector('canvas, iframe')).toBeNull()
    expect(within(next as HTMLElement).getByRole('link', { name: 'Open the dashboard' })).toHaveAttribute('href', LIVE.dashboard)
    expect(document.documentElement).not.toHaveAttribute('data-next')
    // the story still names every step, and its chapter buttons are plain buttons
    expect(within(container.querySelector('.chapters') as HTMLElement).getAllByRole('button').map((b) => b.textContent)).toEqual(['Open', 'Clearing', 'Commit', 'Payment', 'Finalized'])
  })

  it('has no serious or critical axe violation', async () => {
    const { container } = render(<Landing />)
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] })
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')})`)).toEqual([])
  })
})
