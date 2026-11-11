import type { ClearingReport } from '../api/types'

/** The three parts of what was owed in an epoch, in the smallest unit: what moved as USDT, what the loops cancelled, and what was netted between pairs. */
export type Split = { owed: bigint; moved: bigint; loops: bigint; pairs: bigint; payers: number; paid: number }

/**
 * moved = what the debtors pay in (the sum of the negative net positions); loops = the cleared value; pairs = the rest of what was owed.
 * `pairs` is never below zero: a report whose parts add up to more than the obligation shows 0 there.
 */
export function splitOf(report: Pick<ClearingReport, 'totalObligation' | 'cleared' | 'members'>): Split {
  const owed = BigInt(report.totalObligation || '0')
  const loops = BigInt(report.cleared ?? '0')
  let moved = 0n
  let payers = 0
  let paid = 0
  for (const m of report.members) {
    const net = BigInt(m.net.replace(/^\+/, '') || '0')
    if (net < 0n) {
      moved += -net
      payers += 1
    } else if (net > 0n) paid += 1
  }
  const rest = owed - loops - moved
  return { owed, moved, loops, pairs: rest > 0n ? rest : 0n, payers, paid }
}
