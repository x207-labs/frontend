import type { EpochItem } from '../api/types'

/**
 * FE-040: the newest epoch is late when it is not finalized and the deadline of its phase has passed. Both deadlines come from the read API
 * (`cutoffAt` while open, `proposalDeadline` during cutoff and clearing); nothing is hardcoded. The commit and payment phases carry no
 * deadline in the API, so they are never reported as late.
 */
export function lateEpoch(items: readonly EpochItem[], now: number): EpochItem | null {
  const latest = items.reduce<EpochItem | null>((a, e) => (a === null || e.epoch > a.epoch ? e : a), null)
  if (!latest) return null
  const deadline = latest.phase === 'open' ? latest.cutoffAt : latest.phase === 'cutoff' || latest.phase === 'clearing' ? latest.proposalDeadline : null
  if (!deadline) return null
  const at = Date.parse(deadline)
  return Number.isNaN(at) || at >= now ? null : latest
}
