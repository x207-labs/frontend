import { createContext, useContext, useMemo, type ReactNode } from 'react'
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

const EpochContext = createContext<Selection | null>(null)

// The selected epoch is kept in the ?epoch= query so it follows page changes and can be shared.
export function EpochProvider({ children }: { children: ReactNode }) {
  const query = useEpochs()
  const [params, setParams] = useSearchParams()
  const wanted = params.get('epoch')
  // FE-046: only the newest finalized epochs are read to choose the default, once each (finalized metrics never change).
  const finalized = (query.data?.items ?? []).filter((e) => e.phase === 'finalized').slice(0, DEFAULT_SCAN).map((e) => ({ epoch: e.epoch, final: true }))
  const metrics = useAllMetrics(wanted === null ? finalized : [])
  const settled = metrics.every((m) => m.data !== undefined || m.isError)

  const value = useMemo<Selection>(() => {
    const items = query.data?.items ?? []
    const results = new Map<number, EpochResult>()
    for (const m of metrics) if (m.data) results.set(m.data.epoch, { cleared: m.data.cleared, voucherCount: m.data.voucherCount })
    const resolving = wanted === null && query.data !== undefined && !settled
    return {
      query,
      resolving,
      selected: items.find((e) => String(e.epoch) === wanted) ?? (resolving ? null : defaultEpoch(items, results)),
      select: (epoch) => setParams({ epoch: String(epoch) }),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, wanted, setParams, settled, metrics.map((m) => m.dataUpdatedAt).join()])

  return <EpochContext.Provider value={value}>{children}</EpochContext.Provider>
}

export function useEpochSelection(): Selection {
  const value = useContext(EpochContext)
  if (!value) throw new Error('useEpochSelection must be inside EpochProvider')
  return value
}

export const useSelectedEpoch = (): number | null => useEpochSelection().selected?.epoch ?? null
