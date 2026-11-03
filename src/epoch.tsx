import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useEpochs } from './api/queries'
import type { EpochItem } from './api/types'

type Selection = {
  query: ReturnType<typeof useEpochs>
  selected: EpochItem | null
  select: (epoch: number) => void
}

const EpochContext = createContext<Selection | null>(null)

// Epoch terpilih disimpan di query ?epoch= agar ikut berpindah halaman dan bisa dibagikan.
export function EpochProvider({ children }: { children: ReactNode }) {
  const query = useEpochs()
  const [params, setParams] = useSearchParams()
  const wanted = params.get('epoch')

  const value = useMemo<Selection>(() => {
    const items = query.data?.items ?? []
    return {
      query,
      selected: items.find((e) => String(e.epoch) === wanted) ?? items[0] ?? null,
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
