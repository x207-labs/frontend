import { QueryClient } from '@tanstack/react-query'
import { POLL_MS } from './config'

// Read API dipoll agar halaman ikut berubah tanpa reload manual (K-49).
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: POLL_MS } },
  })
