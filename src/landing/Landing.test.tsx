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
    const numbers = container.querySelector('#numbers') as HTMLElement
    const fall = within(numbers).getByRole('img', { name: 'Of 41.35 owed: 7.75 moved, 21.80 cancelled in solver loops, 11.80 netted between pairs.' })
    expect([...fall.querySelectorAll('.fall-col')].map((c) => c.textContent)).toEqual([
      '41.35Owed', '−21.80Loops', '−11.80Pairs', '7.75Moved',
    ])
    expect(numbers.querySelector('.hero-fig')).toHaveTextContent('7.75USDT')
    expect(numbers).toHaveTextContent('The solver cancelled 21.80 in 6 loops, and pairs netted 11.80 more.')
    expect(numbers).toHaveTextContent('14 transfers settled the epoch: 18.7% of what was owed.')
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
      ['ran on testnet', rows.testnet],
      ['in near-sandbox', rows.sandbox],
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

describe('v5 landing page', () => {
  it('has one h1 and its sections in order, each with its heading', () => {
    const { container } = render(<Landing />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Agents barter anything. x207 nets it all to one payment.' })).toBeInTheDocument()
    for (const name of ['Agents pay one by one. x207 settles them together.', '41.35 owed. 7.75 moved.', 'Agents pay with vouchers.', 'Loops cancel.', 'One amount per agent.',
      'Debtors pay in once.', 'Creditors are paid.', 'Anything with value can pay.', 'Settlement you can check.', 'Start from one line.', 'What x207 is not.', 'Step inside the live circle.']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    // the order: a full-screen hero, the window under it, two-column intro, the numbers, the pinned story, barter, the card grid, build, FAQ, the closing call and the footer
    const order = [...container.querySelectorAll('main > *')].map((e) => e.id || e.className.split(' ')[0])
    expect(order).toEqual(['hero', 'showcase', 'intro', 'numbers', 'how', 'barter', 'section', 'build', 'faq', 'next', 'foot'])
    expect(document.title).toContain('x207')
    // the first stop of the keyboard is the skip link, and it leads to the main content
    expect(screen.getByRole('link', { name: 'Skip to the content' })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })

  it('every dashboard link opens the live circle; Replay opens the clearing stats of epoch 8 itself', () => {
    render(<Landing />)
    const links = screen.getAllByRole('link', { name: /^Open (the )?dashboard$/ })
    expect(links.map((a) => a.textContent)).toEqual(['Open dashboard', 'Open the dashboard', 'Open the dashboard'])
    for (const link of links) expect(link).toHaveAttribute('href', '/app?circle=v018')
    expect(LIVE.dashboard).toBe('/app?circle=v018')
    for (const link of screen.getAllByRole('link', { name: /^Replay( epoch 8)?$/ })) expect(link).toHaveAttribute('href', '/stats?circle=v013&epoch=8')
  })

  it('the bar menus open on click, close on Escape and give focus back to their button', async () => {
    const user = userEvent.setup()
    render(<Landing />)
    const bar = screen.getByRole('navigation', { name: 'Site' })
    const protocol = within(bar).getByRole('button', { name: 'Protocol' })
    expect(protocol).toHaveAttribute('aria-expanded', 'false')
    await user.click(protocol)
    expect(protocol).toHaveAttribute('aria-expanded', 'true')
    const menu = document.getElementById(protocol.getAttribute('aria-controls')!)!
    expect(within(menu).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['#how', '#barter', '#faq'])
    await user.keyboard('{Escape}')
    expect(protocol).toHaveAttribute('aria-expanded', 'false')
    expect(protocol).toHaveFocus()
    const more = screen.getByRole('button', { name: 'More dashboard links' })
    await user.click(more)
    expect(within(document.getElementById(more.getAttribute('aria-controls')!)!).getByRole('link', { name: /Epoch 8 replay/ })).toHaveAttribute('href', LIVE.epoch8Stats)
  })

  it('says plainly that it is testnet with mock USDT and what it is not', () => {
    const { container } = render(<Landing />)
    expect(screen.getByRole('link', { name: /Contract 0\.0\.18 is live on NEAR testnet\. See it on NearBlocks/ })).toHaveAttribute('href', LIVE.contractUrl)
    const faq = screen.getByRole('heading', { level: 2, name: 'What x207 is not.' }).closest('section')!
    expect(within(faq).getByText('NEAR testnet with mock USDT. No mainnet transaction has been sent.')).toBeInTheDocument()
    expect(within(faq).getByText(/The contracts are tested, not externally audited\./)).toBeInTheDocument()
    expect(within(faq).getByText(/Epoch 8 burnt 109\.7 Tgas where 24 plain transfers burn 54\.9\./)).toBeInTheDocument()
    expect(within(faq).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Not credit without cash', 'Not a gas saving on NEAR', 'Not for a star', 'Not on mainnet', 'Not audited',
    ])
    expect(within(faq).getByRole('link', { name: 'security.md' })).toHaveAttribute('href', LIVE.security)
    expect(container.querySelector('footer')).toHaveTextContent('x207 · hackathon prototype · NEAR testnet, mock USDT')
  })

  it('the window, the faces, the story and the proof show the numbers of epoch 8, and the recomputation matches on every row', () => {
    const { container } = render(<Landing />)
    expect([...container.querySelectorAll('.win-stats dd.mono')].map((v) => v.textContent)).toEqual(['41.35', '52.7%', '7.75'])
    expect(container.querySelectorAll('.win-side li')).toHaveLength(EPOCH8.members)
    const deck = screen.getByRole('list', { name: 'The 15 agents of epoch 8 and their result codes' })
    expect(within(deck).getAllByRole('listitem')).toHaveLength(EPOCH8.members)
    expect(deck.querySelectorAll('li')[DEFAULTER]).toHaveTextContent('409 Covered from stake')
    expect(deck.querySelectorAll('li')[DEFAULTER]).toHaveTextContent('−0.55')
    expect(deck.querySelectorAll('li')[1]).toHaveTextContent('+0.55')
    expect(container.querySelector('.story')).toHaveTextContent('24 vouchers add up to 41.35 owed')
    expect(container.querySelector('.story')).toHaveTextContent('0.55 comes out of its stake')
    const proof = container.querySelector('#proof') as HTMLElement
    const rows = within(proof).getAllByRole('listitem')
    expect(rows).toHaveLength(6)
    for (const row of rows) expect(row).toHaveTextContent(': matches the API')
    expect(proof).toHaveTextContent('x207-v013.testnet')
  })

  it('the barter section lists every class of the catalog, the kinds of the chosen one with their status, and the three counts', async () => {
    const user = userEvent.setup()
    const { container } = render(<Landing />)
    const floor = container.querySelector('#barter') as HTMLElement
    const chips = within(within(floor).getByRole('group', { name: 'Classes of the barter catalog' })).getAllByRole('button')
    expect(chips.map((b) => b.getAttribute('title'))).toEqual(KIND_CLASSES.map((c) => c.name))
    expect(chips.map((b) => b.textContent)).toEqual(['On-chain assets', 'Revocable access', 'Secrets', 'Compute & services', 'Digital goods', 'Refused'])
    expect(chips.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false'])
    expect(floor.querySelectorAll('.kinds li')).toHaveLength(KIND_CLASSES[0].kinds.length)
    expect(floor.querySelector('.kinds li')).toHaveTextContent('nft:nep171NEAR: Ran on NEAR testnet')
    await user.click(chips[5])
    expect(chips[5]).toHaveAttribute('aria-pressed', 'true')
    expect(floor.querySelectorAll('.kinds li[data-s="refused"]')).toHaveLength(9)
    expect([...floor.querySelectorAll('.evidence b')].map((b) => b.textContent)).toEqual(['85', '13', '13'])
    expect(within(floor).getByRole('link', { name: 'Explore every kind' })).toHaveAttribute('href', LIVE.barterEvidence)
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

  it('without a 2D canvas (jsdom) the page keeps its static markup: the three canvases are decorative and hidden, and the story still names every step', () => {
    const { container } = render(<Landing />)
    const canvases = [...container.querySelectorAll('canvas')]
    expect(canvases).toHaveLength(3) // the hero's field of agents, the window's ring, the story scene
    for (const c of canvases) expect(c).toHaveAttribute('aria-hidden', 'true')
    expect(within(container.querySelector('.chapters') as HTMLElement).getAllByRole('button').map((b) => b.textContent)).toEqual(['Open', 'Clearing', 'Commit', 'Payment', 'Finalized'])
  })

  it('has no serious or critical axe violation', async () => {
    const { container } = render(<Landing />)
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] })
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')})`)).toEqual([])
  })
})
