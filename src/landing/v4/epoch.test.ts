import { describe, expect, it } from 'vitest'
import { BARTER, DEFAULTER, EDGES, EPOCH8, NET } from '../facts'
import { findCycles } from './engine/scene.js'
import { recompute, X207 } from './engine/x207.js'
import { BARTER_FIG, checks, epochWhen, FIG, LOOPS, PAIRS, SCALE } from './epoch'

// The v4 landing has two sources of epoch 8: facts.ts (the numbers in the text, each with its source) and the snapshot of engine/x207.js (what the ring, the story scene and the
// proof panel draw and recompute). They must describe the same epoch, or the page would say one thing and draw another.
const hundredths = (x: number) => Math.round(x * 100)

describe('v4 landing: the engine snapshot and facts.ts are the same epoch 8', () => {
  it('the 24 obligations are the same (debtor, creditor, amount), in any order', () => {
    expect(X207.edges).toHaveLength(EPOCH8.vouchers)
    const engine = X207.edges.map(([d, c, a]) => `${d}>${c}:${a}`).sort()
    const facts = EDGES.map(([d, c, a]) => `${d}>${c}:${hundredths(a)}`).sort()
    expect(engine).toEqual(facts)
  })

  it('the totals are the same: 41.35 owed, 21.80 cleared, 7.75 net, 14 transfers, and every net position', () => {
    const r = recompute()
    expect(r.gross / 100).toBe(EPOCH8.gross)
    expect(r.gross / 100).toBe(41.35)
    expect(r.cleared / 100).toBe(EPOCH8.cleared)
    expect(r.cleared / 100).toBe(21.8)
    expect(r.payIn / 100).toBe(EPOCH8.moved)
    expect(r.payIn / 100).toBe(7.75)
    expect(r.payOut / 100).toBe(7.75)
    expect(r.transfers).toBe(EPOCH8.movements)
    expect(r.transfers).toBe(14)
    expect(r.sum).toBe(0)
    // facts.ts NET is positive for a member that pays in; the engine's net is owed minus owes, so negative for a debtor
    expect(r.net.map((v) => (v === 0 ? 0 : -v / 100))).toEqual(NET.map((n) => (n === 0 ? 0 : n)))
    // what the API reported, as the proof panel compares it
    expect(X207.reported).toEqual({ gross: 4135, cleared: 2180, net: 775, transfers: 14 })
  })

  it('the cleared credit of the engine is the sum of the solver loops the hero and the story light, one after the other', () => {
    const cycles = findCycles(X207.edges)
    expect(cycles).toHaveLength(LOOPS)
    expect(LOOPS).toBe(6)
    expect(cycles.reduce((s, c) => s + c.amount * c.members.length, 0)).toBe(hundredths(EPOCH8.cleared))
  })

  it('the outcome per member agrees: five paid, three claimed, and m06 is the one covered from its stake', () => {
    expect(X207.outcome).toHaveLength(EPOCH8.members)
    expect(X207.outcome.filter((o) => o === 'paid')).toHaveLength(EPOCH8.paid)
    expect(X207.outcome.filter((o) => o === 'claimed')).toHaveLength(EPOCH8.claimed)
    expect(X207.outcome.filter((o) => o === 'defaulted')).toHaveLength(1)
    expect(X207.outcome[DEFAULTER]).toBe('defaulted')
    expect(X207.contract).toBe(EPOCH8.contract)
  })

  it('the figures in the markup come from facts.ts and add up: moved + cancelled in loops + netted between pairs = owed', () => {
    expect(FIG).toMatchObject({ gross: '41.35', moved: '7.75', cleared: '21.80', pairs: '11.80', clearedShare: '52.7%', movedShare: '18.7%', defaultDue: '0.55' })
    expect(Math.round((EPOCH8.moved + EPOCH8.cleared + PAIRS) * 100) / 100).toBe(EPOCH8.gross)
    const widths = Object.values(SCALE).map((w) => parseFloat(w))
    expect(Math.round(widths.reduce((a, b) => a + b, 0))).toBe(100)
  })

  it('the barter counts of the floor are read from facts.ts BARTER: 85 kinds can be offered, 13 ran on testnet, 13 more in near-sandbox', () => {
    expect(BARTER_FIG).toEqual({ offered: 85, testnet: 13, sandbox: 13 })
    expect(BARTER_FIG.offered).toBe(BARTER.reduce((s, r) => s + r.count, 0) - BARTER.find((r) => r.key === 'refused')!.count)
  })

  it('the browser recomputation matches the API on every row, and the epoch line is built from the snapshot', () => {
    const { rows, match } = checks()
    expect(match).toBe(true)
    expect(rows).toHaveLength(6)
    expect(rows.every((r) => r.ok)).toBe(true)
    expect(rows.map((r) => r.got)).toEqual(['41.35', '7.75', '7.75', '21.80', '0.00', '14'])
    expect(epochWhen()).toBe('8, committed 4 Nov 2026 08:35 UTC, payment deadline 08:50 UTC')
  })
})
