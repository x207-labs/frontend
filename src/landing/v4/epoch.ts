// The figures of epoch 8 that the v4 landing shows in its markup. Every number in the text comes from facts.ts (EPOCH8, BARTER); the engines draw from X207.edges
// of engine/x207.js, and epoch.test.ts keeps the two describing the same epoch. The proof panel recomputes from the 24 raw edges in the visitor's browser.
import { BARTER, EPOCH8 } from '../facts'
import { findCycles } from './engine/scene.js'
import { fmt, recompute, X207, type Outcome } from './engine/x207.js'

export const n2 = (x: number) => x.toFixed(2)
const share = (x: number) => `${((x / EPOCH8.gross) * 100).toFixed(1)}%`

/** The credit netted between pairs after the loops: what the loops did not cancel, less what moves. 11.80 for epoch 8. */
export const PAIRS = Math.round((EPOCH8.netted - EPOCH8.moved) * 100) / 100

export const FIG = {
  gross: n2(EPOCH8.gross),
  moved: n2(EPOCH8.moved),
  cleared: n2(EPOCH8.cleared),
  pairs: n2(PAIRS),
  clearedShare: `${EPOCH8.clearedShare}%`,
  movedShare: `${EPOCH8.movedShare}%`,
  defaultDue: n2(EPOCH8.defaultDue),
}

/** Widths of the three bands of the scale under the statement: moved, cancelled in loops, netted between pairs. */
export const SCALE = { moved: share(EPOCH8.moved), loops: share(EPOCH8.cleared), pairs: share(PAIRS) }

/** The number of loops the solver cancelled: the six loops the hero ring and the story light one after the other. */
export const LOOPS = findCycles(X207.edges).length

/** Barter counts of the blue floor, all from facts.ts BARTER: the kinds that can be offered (all but the refused ones), and how many ran on testnet and in near-sandbox. */
const barter = (key: (typeof BARTER)[number]['key']) => BARTER.find((r) => r.key === key)!.count
export const BARTER_FIG = {
  offered: BARTER.reduce((sum, r) => sum + r.count, 0) - barter('refused'),
  testnet: barter('testnet'),
  sandbox: barter('sandbox'),
}

/** The face colour of an agent: its result code's colour (200 settled, 202 claim, 409 default), grey when it had nothing to settle. */
export const TONE: Record<Outcome, string> = {
  paid: 'var(--ds-settled)',
  claimed: 'var(--ds-settled)',
  claimable: 'var(--ds-claim)',
  defaulted: 'var(--ds-default)',
  flat: 'var(--lp-ink-3)',
}

/** The mood of an agent's face: laughing once paid or claimed, smiling while its claim waits, sad when its debt was covered from its stake, flat with nothing to settle. */
export const MOOD: Record<Outcome, 'happy' | 'smile' | 'sad' | 'flat'> = { paid: 'happy', claimed: 'happy', claimable: 'smile', defaulted: 'sad', flat: 'flat' }

export type Check = { label: string; got: string; ok: boolean }

/** What the visitor's browser recomputes from the 24 vouchers, row by row, against what the read API reported. */
export function checks(): { rows: Check[]; match: boolean } {
  const r = recompute()
  const R = X207.reported
  const row = (label: string, got: number, want: number, f: (h: number) => string = fmt): Check => ({ label, got: f(got), ok: got === want })
  const rows = [
    row('Gross obligations, summed from 24 vouchers', r.gross, R.gross),
    row('Net owed by the six debtors', r.payIn, R.net),
    row('Net due to the eight creditors', r.payOut, R.net),
    row('Cancelled in cycles by the solver', r.cleared, R.cleared),
    row('All net positions sum to zero', r.sum, 0),
    row('Members with something to settle', r.transfers, R.transfers, String),
  ]
  return { rows, match: r.gross === R.gross && r.cleared === R.cleared && r.payIn === R.net && r.transfers === R.transfers && r.sum === 0 }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`

/** "8, committed 4 Nov 2026 08:35 UTC, payment deadline 08:50 UTC", from the two timestamps of the snapshot. */
export function epochWhen(): string {
  const at = new Date(X207.committedAt)
  const due = new Date(X207.paymentDeadline)
  return `${X207.epoch}, committed ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()} ${hhmm(at)} UTC, payment deadline ${hhmm(due)} UTC`
}
