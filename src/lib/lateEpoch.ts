import type { EpochItem } from '../api/types'

/** The step that closes an epoch after its cutoff has no deadline of its own in the API; this is how long it may wait. */
export const CLOSE_GRACE_MS = 60_000

/**
 * FE-040: the newest epoch is late when it is not finalized and the next step is overdue. The deadlines come from the read API:
 * `cutoffAt` while open, `cutoffAt` plus a grace for the close step in the cutoff phase, `proposalDeadline` while clearing (the commit step is due),
 * and `paymentDeadline` in the commit and payment phases (the finalize step is due).
 */
export function lateEpoch(items: readonly EpochItem[], now: number): EpochItem | null {
  const latest = items.reduce<EpochItem | null>((a, e) => (a === null || e.epoch > a.epoch ? e : a), null)
  if (!latest) return null
  let due: string | null | undefined
  let grace = 0
  if (latest.phase === 'open') due = latest.cutoffAt
  else if (latest.phase === 'cutoff') [due, grace] = [latest.cutoffAt, CLOSE_GRACE_MS]
  else if (latest.phase === 'clearing') due = latest.proposalDeadline
  else if (latest.phase === 'commit' || latest.phase === 'payment_window') due = latest.paymentDeadline
  if (!due) return null
  const at = Date.parse(due)
  return Number.isNaN(at) || at + grace >= now ? null : latest
}
