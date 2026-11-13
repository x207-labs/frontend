import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAllMetrics, useEpochs } from './api/queries'
import type { EpochItem } from './api/types'
import { listKnowsClearing, useEpochByNumber, useLatestClearing } from './epochSearch'

type Selection = {
  query: ReturnType<typeof useEpochs>
  /** True while the metrics of the finalized epochs are read to choose the default epoch. */
  resolving: boolean
  selected: EpochItem | null
  /** FE-118: the first page of the epoch list, plus the selected epoch when it is older than that page (found further back in the list). */
  items: EpochItem[]
  /** FE-118: set when the default passed over newer finalized epochs that cleared nothing. */
  skipped: SkippedEmpty | null
  select: (epoch: number) => void
}

const hasResult = (results: ReadonlyMap<number, EpochResult>, epoch: number, item: EpochItem): boolean =>
  BigInt(item.cleared ?? results.get(epoch)?.cleared ?? '0') > 0n

// What the default choice needs to know about an epoch: whether clearing produced a result.
export type EpochResult = { cleared: string | null; voucherCount: number }

// Without ?epoch= the page opens on the newest finalized epoch that has a clearing result (cleared value above zero). If none cleared anything, the newest finalized epoch that
// had vouchers; then the newest finalized epoch; then any epoch past the cutoff; then the newest one. An epoch that is stuck or still open is never the default.
export function defaultEpoch(items: EpochItem[], results: ReadonlyMap<number, EpochResult> = new Map()): EpochItem | null {
  const finalized = items.filter((e) => e.phase === 'finalized')
  return (
    finalized.find((e) => BigInt(results.get(e.epoch)?.cleared ?? '0') > 0n) ??
    finalized.find((e) => (results.get(e.epoch)?.voucherCount ?? 0) > 0) ??
    finalized[0] ??
    items.find((e) => e.phase !== 'open' && e.phase !== 'cutoff') ??
    items[0] ??
    null
  )
}

/** How many of the newest finalized epochs the default choice looks at (FE-046: a circle with hundreds of epochs must not read them all). */
const DEFAULT_SCAN = 10
/** FE-047: how many of them are read after each wave (1, then 2 more, 3 more, 4 more) while none of the epochs read so far cleared anything. */
const SCAN_WAVES = [1, 3, 6, DEFAULT_SCAN]

const EpochContext = createContext<Selection | null>(null)

/** FE-118: the default skipped newer finalized epochs that cleared nothing; `latest` is the newest finalized one, so the page can say so and offer it. */
export type SkippedEmpty = { latest: EpochItem }

// The selected epoch is kept in the ?epoch= query so it follows page changes and can be shared.
export function EpochProvider({ children }: { children: ReactNode }) {
  const query = useEpochs()
  const [params, setParams] = useSearchParams()
  const wanted = params.get('epoch')
  const wantedNumber = wanted !== null && /^\d+$/.test(wanted) ? Number(wanted) : null
  const firstItems = query.data?.items ?? []
  // FE-118: a read API that lists the cleared total of each epoch answers the default from the list, past its first page; an older one keeps the metrics scan.
  const knows = listKnowsClearing(firstItems)
  const byNumber = useEpochByNumber(query.data, wantedNumber)
  // the default is needed without ?epoch=, and when the asked epoch is not a number or the circle has no such epoch
  const needDefault = wanted === null || wantedNumber === null || byNumber === null
  const latestClearing = useLatestClearing(query.data, needDefault)
  // FE-046: only the newest finalized epochs are read to choose the default, once each (finalized metrics never change).
  // FE-047: newest first and in small waves, stopping at the first epoch that cleared something; most circles need one read instead of ten.
  const [wave, setWave] = useState(0)
  const scan = wanted === null && !knows
  const finalized = firstItems.filter((e) => e.phase === 'finalized').slice(0, DEFAULT_SCAN).map((e) => ({ epoch: e.epoch, final: true }))
  const metrics = useAllMetrics(scan ? finalized.slice(0, SCAN_WAVES[wave]) : [])
  const settled = metrics.every((m) => m.data !== undefined || m.isError)
  const cleared = metrics.some((m) => m.data !== undefined && BigInt(m.data.cleared ?? '0') > 0n)
  const more = scan && settled && !cleared && wave < SCAN_WAVES.length - 1 && finalized.length > SCAN_WAVES[wave]
  useEffect(() => {
    if (more) setWave((w) => w + 1)
  }, [more])

  const value = useMemo<Selection>(() => {
    const items = query.data?.items ?? []
    const results = new Map<number, EpochResult>()
    if (knows) for (const e of items) results.set(e.epoch, { cleared: e.cleared ?? null, voucherCount: e.edgeCount ?? 0 })
    for (const m of metrics) if (m.data) results.set(m.data.epoch, { cleared: m.data.cleared, voucherCount: m.data.voucherCount })
    const loaded = query.data !== undefined
    const looking = wantedNumber !== null && byNumber === undefined
    const defaulting = needDefault && (knows ? latestClearing.epoch === undefined && !latestClearing.failed : wanted === null && (!settled || more))
    const resolving = loaded && (looking || defaulting)
    // an epoch number that is in the list (on the first page or found further back) is honoured; anything else falls back to the default
    const asked = wanted === null ? null : (byNumber ?? null)
    const fallback = resolving ? null : defaultEpoch(items, results)
    const selected = asked ?? (resolving ? null : knows && latestClearing.epoch ? latestClearing.epoch : fallback)
    const newestFinal = items.find((e) => e.phase === 'finalized') ?? null
    const skipped =
      wanted === null && selected && newestFinal && selected.epoch !== newestFinal.epoch && selected.phase === 'finalized' && hasResult(results, selected.epoch, selected)
        ? { latest: newestFinal }
        : null
    return {
      query,
      resolving,
      selected,
      items: selected && !items.some((e) => e.epoch === selected.epoch) ? [...items, selected].sort((a, b) => b.epoch - a.epoch) : items,
      skipped,
      select: (epoch) => setParams({ epoch: String(epoch) }),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, wanted, setParams, settled, more, knows, needDefault, latestClearing.epoch, latestClearing.failed, byNumber, metrics.map((m) => m.dataUpdatedAt).join()])

  return <EpochContext.Provider value={value}>{children}</EpochContext.Provider>
}

export function useEpochSelection(): Selection {
  const value = useContext(EpochContext)
  if (!value) throw new Error('useEpochSelection must be inside EpochProvider')
  return value
}

export const useSelectedEpoch = (): number | null => useEpochSelection().selected?.epoch ?? null
