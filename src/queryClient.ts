import { QueryClient } from '@tanstack/react-query'
import { rateLimitWait } from './api/client'
import { POLL_MS } from './config'

/** FE-046: the poll interval, stretched while the read API asks the dashboard to slow down (429). */
export const pollEvery = (ms: number) => () => Math.max(ms, rateLimitWait())

/** FE-046: data that can no longer change (a finalized epoch, a delivered or cancelled sale) is read once and never polled. */
export const FINAL = { staleTime: Infinity, refetchInterval: false } as const

// The read API is polled so pages update without a manual reload (K-49). Polling stops while the tab is hidden (refetchIntervalInBackground false).
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: pollEvery(POLL_MS), refetchIntervalInBackground: false } },
  })
