import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useEpochs } from './api/queries'
import type { EpochItem } from './api/types'

type Selection = {
  query: ReturnType<typeof useEpochs>
  selected: EpochItem | null
  select: (epoch: number) => void
}

// Without ?epoch= the newest finalized epoch is shown first: it is the newest one with a complete clearing result. Then any epoch past the cutoff, then the newest one.
export function defaultEpoch(items: EpochItem[]): EpochItem | null {
  return (
    items.find((e) => e.phase === 'finalized') ??
    items.find((e) => e.phase !== 'open' && e.phase !== 'cutoff') ??
    items[0] ??
    null
  )
}

const EpochContext = createContext<Selection | null>(null)

// The selected epoch is kept in the ?epoch= query so it follows page changes and can be shared.
export function EpochProvider({ children }: { children: ReactNode }) {
  const query = useEpochs()
  const [params, setParams] = useSearchParams()
  const wanted = params.get('epoch')

  const value = useMemo<Selection>(() => {
    const items = query.data?.items ?? []
    return {
      query,
      selected: items.find((e) => String(e.epoch) === wanted) ?? defaultEpoch(items),
      select: (epoch) => setParams({ epoch: String(epoch) }),
    }
  }, [query, wanted, setParams])

  return <EpochContext.Provider value={value}>{children}</EpochContext.Provider>
}

export function useEpochSelection(): Selection {
  const value = useContext(EpochContext)
  if (!value) throw new Error('useEpochSelection must be inside EpochProvider')
  return value
}

export const useSelectedEpoch = (): number | null => useEpochSelection().selected?.epoch ?? null
