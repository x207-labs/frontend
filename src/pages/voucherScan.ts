import { useMemo } from 'react'
import { useAllMetrics, useEpochs } from '../api/queries'
import type { EpochItem, EpochPhase } from '../api/types'
import { currentEpoch, voucherEpoch, type VoucherEpoch } from '../lib/home'
import { useLatestClearing } from '../epochSearch'

/** How many of the newest epochs Home reads to find the ones that carried vouchers. Finalized epochs are read once and cached; the epoch picker reads the same ones. */
export const SCAN_EPOCHS = 12

export type VoucherScan =
  | { state: 'loading' }
  | { state: 'error'; error: unknown; retry: () => void }
  | {
      state: 'ready'
      /** The epochs that carried vouchers among the ones read, newest first. */
      rows: VoucherEpoch[]
      /** How many epochs were read, and how many the epoch list returned (one page of the list, not the circle's total). */
      scanned: number
      total: number
      /** FE-118: the latest epoch with clearing, read as well when it is older than the newest epochs read; null when it is among them or unknown. */
      older: number | null
      /** The epoch members are in now (newest not finalized, else the newest) and whether it is known to hold no vouchers yet. */
      live: { epoch: number; phase: EpochPhase; empty: boolean } | null
      /** True while some of the newest epochs have not answered yet; the rows so far are still in order. */
      pending: boolean
      items: EpochItem[]
    }

export const phaseWord = (phase: EpochPhase): string => phase.replace('_', ' ')

/**
 * The newest epochs that carried vouchers, read from their metrics. Home leads with the latest of them, never with an empty epoch (a circle can close hundreds of
 * epochs with nothing in them). Rows stop at the first epoch that has not answered, so the latest one never flickers to an older epoch while the others load.
 */
export function useVoucherScan(): VoucherScan {
  const query = useEpochs()
  const items = query.data?.items
  const newest = useMemo(() => [...(items ?? [])].sort((a, b) => b.epoch - a.epoch).slice(0, SCAN_EPOCHS), [items])
  // FE-118: a circle whose newest epochs are all empty still leads with its latest clearing, found further back in the epoch list.
  const latestClearing = useLatestClearing(query.data)
  const oldest = newest[newest.length - 1]?.epoch
  const older = latestClearing.epoch && oldest !== undefined && latestClearing.epoch.epoch < oldest ? latestClearing.epoch.epoch : null
  const read = newest.map((e) => ({ epoch: e.epoch, final: e.phase === 'finalized' }))
  const metrics = useAllMetrics(older === null ? read : [...read, { epoch: older, final: true }])
  if (items === undefined) return query.isError ? { state: 'error', error: query.error, retry: () => void query.refetch() } : { state: 'loading' }

  const rows: VoucherEpoch[] = []
  let failed = 0
  let pending = false
  for (const q of metrics) {
    if (q.data !== undefined) {
      if (!pending && q.data.voucherCount > 0) rows.push(voucherEpoch(q.data))
    } else if (q.isError) failed++
    else pending = true
  }
  if (metrics.length > 0 && failed === metrics.length) {
    const first = metrics.find((q) => q.isError)
    return { state: 'error', error: first?.error, retry: () => metrics.forEach((q) => void q.refetch()) }
  }
  if (pending && rows.length === 0) return { state: 'loading' }
  // FE-118: while the list is still walked for the latest clearing, an empty set of rows is not an answer yet
  if (rows.length === 0 && latestClearing.epoch === undefined && !latestClearing.failed) return { state: 'loading' }

  const liveItem = currentEpoch(items)
  const liveMetrics = liveItem ? metrics.find((q) => q.data?.epoch === liveItem.epoch)?.data : undefined
  const live = liveItem ? { epoch: liveItem.epoch, phase: liveItem.phase, empty: liveMetrics !== undefined && liveMetrics.voucherCount === 0 } : null
  return { state: 'ready', rows, scanned: newest.length, total: items.length, older, live, pending, items }
}
