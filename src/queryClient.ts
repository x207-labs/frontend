import { QueryClient } from '@tanstack/react-query'
import { POLL_MS } from './config'

// The read API is polled so pages update without a manual reload (K-49).
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: POLL_MS } },
  })
