import { useQuery } from '@tanstack/react-query'
import { api } from './api/client'
import type { EpochItem, Paged } from './api/types'
import { FINAL } from './queryClient'

/**
 * FE-118: the epoch list of the read API carries each epoch's cleared total (`cleared`), so the newest epoch with a clearing result can be found from the list
 * itself, beyond its first page. A busy circle closes many empty epochs (v018: 196 finalized, the newest with a clearing is 184, twelve back; v013: 18, over a
 * thousand back), and the old default read the metrics of only the ten newest. The same walk finds an epoch asked for in `?epoch=` that is not on the first page
 * (FE-A01: `?epoch=8&circle=v013` fell back to the newest epoch).
 */

/** Epochs per page while walking the list (the read API allows up to 200), and how many pages are walked after the first one at most. */
export const SEARCH_PAGE = 200
export const SEARCH_PAGES = 10

/** A finalized epoch whose clearing cancelled something. */
export const hasClearing = (e: EpochItem): boolean => e.phase === 'finalized' && typeof e.cleared === 'string' && /^\d+$/.test(e.cleared) && BigInt(e.cleared) > 0n

/** Whether this read API puts the cleared total in the list. An older one does not; then the default falls back to reading the metrics of the newest epochs. */
export const listKnowsClearing = (items: EpochItem[]): boolean => items.some((e) => typeof e.cleared === 'string')

type PageReader = (cursor: string, limit: number) => Promise<Paged<EpochItem>>

/**
 * Walks the list after its first page (newest first) and returns the first epoch that `match` accepts, or null once `past` says the rest is older than what
 * is looked for, the list ends, or SEARCH_PAGES pages were read.
 */
export async function searchEpochs(
  cursor: string | null,
  match: (e: EpochItem) => boolean,
  past: (e: EpochItem) => boolean = () => false,
  read: PageReader = api.epochsPage,
): Promise<EpochItem | null> {
  for (let page = 0; cursor && page < SEARCH_PAGES; page++) {
    const { items, nextCursor } = await read(cursor, SEARCH_PAGE)
    for (const e of items) {
      if (match(e)) return e
      if (past(e)) return null
    }
    cursor = nextCursor
  }
  return null
}

/**
 * The newest epoch with a clearing result: on the first page of the list, else from the pages after it. `undefined` while the pages are read, null if none
 * (or this read API does not say). A finalized epoch never changes, so the walk is done once per session; a newer clearing shows up on the first page.
 */
export function useLatestClearing(first: Paged<EpochItem> | undefined, enabled = true): { epoch: EpochItem | null | undefined; failed: boolean } {
  const items = first?.items ?? []
  const knows = listKnowsClearing(items)
  const onFirst = items.find(hasClearing)
  const walk = useQuery({
    queryKey: ['epoch-search', 'latest-clearing'],
    queryFn: () => searchEpochs(first!.nextCursor, hasClearing),
    enabled: enabled && first !== undefined && knows && onFirst === undefined && first.nextCursor !== null,
    ...FINAL,
  })
  if (first === undefined) return { epoch: undefined, failed: false }
  if (!knows) return { epoch: null, failed: false }
  if (onFirst) return { epoch: onFirst, failed: false }
  if (first.nextCursor === null) return { epoch: null, failed: false }
  if (walk.isError) return { epoch: null, failed: true }
  return { epoch: walk.data, failed: false }
}

/** The epoch asked for by number when it is older than the first page of the list. `undefined` while it is looked for, null if the circle has no such epoch. */
export function useEpochByNumber(first: Paged<EpochItem> | undefined, wanted: number | null): EpochItem | null | undefined {
  const items = first?.items ?? []
  const onFirst = wanted === null ? undefined : items.find((e) => e.epoch === wanted)
  const oldest = items.length > 0 ? Math.min(...items.map((e) => e.epoch)) : null
  const older = wanted !== null && onFirst === undefined && oldest !== null && wanted < oldest && first?.nextCursor != null
  const walk = useQuery({
    queryKey: ['epoch-search', 'number', wanted],
    queryFn: () => searchEpochs(first!.nextCursor, (e) => e.epoch === wanted, (e) => e.epoch < wanted!),
    enabled: older,
    // a finalized epoch is fixed; an older epoch still moving through its phases is rare, and the poll of the page reads it again
    staleTime: 60_000,
  })
  if (first === undefined || wanted === null) return undefined
  if (onFirst) return onFirst
  if (!older) return null
  if (walk.isError) return null
  return walk.data
}
