import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAllMetrics, useEpochs } from './api/queries'
import type { EpochItem } from './api/types'

type Selection = {
  query: ReturnType<typeof useEpochs>
  /** True while the metrics of the finalized epochs are read to choose the default epoch. */
  resolving: boolean
  selected: EpochItem | null
  select: (epoch: number) => void
}

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

// The selected epoch is kept in the ?epoch= query so it follows page changes and can be shared.
export function EpochProvider({ children }: { children: ReactNode }) {
  const query = useEpochs()
  const [params, setParams] = useSearchParams()
  const wanted = params.get('epoch')
  // FE-046: only the newest finalized epochs are read to choose the default, once each (finalized metrics never change).
  // FE-047: newest first and in small waves, stopping at the first epoch that cleared something; most circles need one read instead of ten.
  const [wave, setWave] = useState(0)
  const finalized = (query.data?.items ?? []).filter((e) => e.phase === 'finalized').slice(0, DEFAULT_SCAN).map((e) => ({ epoch: e.epoch, final: true }))
  const metrics = useAllMetrics(wanted === null ? finalized.slice(0, SCAN_WAVES[wave]) : [])
  const settled = metrics.every((m) => m.data !== undefined || m.isError)
  const cleared = metrics.some((m) => m.data !== undefined && BigInt(m.data.cleared ?? '0') > 0n)
  const more = wanted === null && settled && !cleared && wave < SCAN_WAVES.length - 1 && finalized.length > SCAN_WAVES[wave]
  useEffect(() => {
    if (more) setWave((w) => w + 1)
  }, [more])

  const value = useMemo<Selection>(() => {
    const items = query.data?.items ?? []
    const results = new Map<number, EpochResult>()
    for (const m of metrics) if (m.data) results.set(m.data.epoch, { cleared: m.data.cleared, voucherCount: m.data.voucherCount })
    const resolving = wanted === null && query.data !== undefined && (!settled || more)
    return {
      query,
      resolving,
      selected: items.find((e) => String(e.epoch) === wanted) ?? (resolving ? null : defaultEpoch(items, results)),
      select: (epoch) => setParams({ epoch: String(epoch) }),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, wanted, setParams, settled, more, metrics.map((m) => m.dataUpdatedAt).join()])

  return <EpochContext.Provider value={value}>{children}</EpochContext.Provider>
}

export function useEpochSelection(): Selection {
  const value = useContext(EpochContext)
  if (!value) throw new Error('useEpochSelection must be inside EpochProvider')
  return value
}

export const useSelectedEpoch = (): number | null => useEpochSelection().selected?.epoch ?? null
