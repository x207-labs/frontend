import { useQueries, useQuery } from '@tanstack/react-query'
import { api, ApiError } from './client'
import { viewContract } from './chain'
import type { ObligationStage } from './types'
import { FINAL } from '../queryClient'

export const useEpochs = () => useQuery({ queryKey: ['epochs'], queryFn: api.epochs })
export const useMember = (account: string | null) =>
  useQuery({
    queryKey: ['member', account],
    // FE-079: "not a member" (404 / member_not_found) is an answer, not an error, so it is kept as `null` data.
    // As an error it was cleared on every poll (a query without data goes back to pending), and Home flashed "Loading" every few seconds.
    queryFn: async () => {
      try {
        return await api.member(account!)
      } catch (error) {
        if (error instanceof ApiError && (error.status === 404 || error.code === 'member_not_found')) return null
        throw error
      }
    },
    enabled: account !== null,
    retry: false,
  })
export const useMembers = () => useQuery({ queryKey: ['members'], queryFn: api.members })
export const useParams = () => useQuery({ queryKey: ['params'], queryFn: api.params })
export const useParamsHistory = () =>
  useQuery({ queryKey: ['params', 'history'], queryFn: api.paramsHistory })
export const useRelayerFeeEvents = () => useQuery({ queryKey: ['events', 'relayer-fee'], queryFn: api.relayerFeeEvents })

// Per-epoch hooks stay idle until an epoch is selected (TC-FE-002-05).
// `final`: the epoch is finalized, so its report and obligations cannot change; they are read once and not polled (same rule as the metrics, FE-046). The query key stays the same.
export const useReport = (epoch: number | null, final = false) =>
  useQuery({
    queryKey: ['report', epoch],
    queryFn: () => api.report(epoch!),
    enabled: epoch !== null,
    ...(final ? FINAL : {}),
  })
export const useObligations = (epoch: number | null, stage: ObligationStage, final = false) =>
  useQuery({
    queryKey: ['obligations', epoch, stage],
    queryFn: () => api.obligations(epoch!, stage),
    enabled: epoch !== null,
    ...(final ? FINAL : {}),
  })
export const useEpochSettlements = (epoch: number | null, status?: string) =>
  useQuery({
    queryKey: ['settlements', epoch, status],
    queryFn: () => api.epochSettlements(epoch!, status),
    enabled: epoch !== null,
  })
export const useMetrics = (epoch: number | null) =>
  useQuery({
    queryKey: ['metrics', epoch],
    queryFn: () => api.metrics(epoch!),
    enabled: epoch !== null,
  })
// FE-046: the metrics of a finalized epoch never change, so they are read once and kept; only epochs still moving are polled. `final` is in the key, so an epoch that
// becomes finalized is read one last time.
export const useAllMetrics = (epochs: { epoch: number; final: boolean }[]) =>
  useQueries({
    queries: epochs.map(({ epoch, final }) => ({
      queryKey: ['metrics', epoch, final],
      queryFn: () => api.metrics(epoch),
      // FE-047: a failed read is not repeated just because another component starts to show the same epoch (the default-epoch scan, then the charts); the retry
      // button and the poll still read it again.
      retryOnMount: false,
      ...(final ? FINAL : {}),
    })),
  })

export const useListings = (query: Record<string, string>) =>
  useQuery({ queryKey: ['listings', query], queryFn: () => api.listings(query) })
/** One listing as it is now. Under the `listings` key, so an accept or a cancel (which refresh `listings`) refreshes it too. */
export const useListing = (hash: string | null) =>
  useQuery({ queryKey: ['listings', 'one', hash], queryFn: () => api.listing(hash!), enabled: hash !== null })
/** FE-111: a finished appraisal never changes, so it is fetched once. */
export const useAppraisal = (id: string | null) =>
  useQuery({ queryKey: ['appraisal', id], queryFn: () => api.appraisal(id!), enabled: id !== null, staleTime: Infinity, refetchInterval: false })
export const useMarketStats = () => useQuery({ queryKey: ['market-stats'], queryFn: api.marketStats })
export const useOffers = (hash: string | null) =>
  useQuery({ queryKey: ['offers', hash], queryFn: () => api.offers(hash!), enabled: hash !== null })
export const useProposals = (account: string | null) =>
  useQuery({ queryKey: ['proposals', account], queryFn: () => api.proposals(account!), enabled: account !== null })
export const useMemberLimits = (account: string | null) =>
  useQuery({ queryKey: ['limits', account], queryFn: () => api.memberLimits(account!), enabled: account !== null, retry: false })
export const useDaoProposals = () => useQuery({ queryKey: ['dao-proposals'], queryFn: api.daoProposals })
export const useGrants = (query: Record<string, string>, enabled = true, poll = true) =>
  useQuery({ queryKey: ['grants', query], queryFn: () => api.grants(query), enabled, ...(poll ? {} : FINAL) })
// FE-045: account sales (contract 0.0.18). A read API without the route (circles before 0.0.18) answers 404 `not_found`: no retry.
export const useAccountEscrows = () => useQuery({ queryKey: ['account-escrows'], queryFn: api.accountEscrows, retry: false })
// FE-046: the detail is never polled. A delivered or cancelled sale is final; a held one only changes when an epoch is finalized (`ready`, `lockedEpochFinalized`) or
// when the list shows a new state, so both are in the key and a change reads the detail once.
export const useAccountEscrow = (grantId: number, state: string, finalizedHead: number | null, enabled = true) =>
  useQuery({
    queryKey: ['account-escrow', grantId, state, state === 'held' ? finalizedHead : null],
    queryFn: () => api.accountEscrow(grantId),
    enabled,
    retry: false,
    ...FINAL,
  })
/** Owner limit on the time an account sale may stay locked (CT-129, nanoseconds as text). Contracts before 0.0.18 have no such view. Read once per page load. */
export const useMaxEscrowTtl = () =>
  useQuery({ queryKey: ['chain', 'get_max_escrow_ttl'], queryFn: () => viewContract<string | number>('get_max_escrow_ttl'), retry: false, ...FINAL })

// On-chain data not yet in the read API: read from contract views (src/api/chain.ts).
/** USDT balance (smallest unit) recorded by `mt_on_transfer` and not yet withdrawn from Intents. */
export const useIntentsBalance = () =>
  useQuery({ queryKey: ['chain', 'intents_balance'], queryFn: () => viewContract<string>('intents_balance') })
export const useOwnIntents = (account: string | null) =>
  useQuery({ queryKey: ['own-intents', account], queryFn: () => api.intents(account!), enabled: account !== null, retry: false })
/** Hashes this account posted in the contract and has not removed (`intent_posted` events minus `intent_removed`, BE-045). */
export const usePostedIntents = (account: string | null) =>
  useQuery({ queryKey: ['posted-intents', account], queryFn: () => api.intentHashes(account!, 'posted'), enabled: account !== null, retry: false })
/** Latest withdrawal from Intents to the contract's NEP-141 account (BE-045). */
export const useIntentWithdrawals = () => useQuery({ queryKey: ['intent-withdrawals'], queryFn: api.intentWithdrawals })
/** Epoch pairs (edges) that still exist; empty after `prune_epoch` removes them. One page is enough to tell whether any exist. */
export const useEpochPairsLeft = (epoch: number | null, enabled: boolean) =>
  useQuery({
    queryKey: ['chain', 'pairs-left', epoch],
    queryFn: () => viewContract<unknown[]>('list_obligations', { epoch: epoch!, from_index: 0, limit: 1 }),
    enabled: epoch !== null && enabled,
  })

export const useInvoices = (query: Record<string, string>, enabled = true) =>
  useQuery({ queryKey: ['invoices', query], queryFn: () => api.invoices(query), enabled })
export const useInvoice = (hash: string | null) =>
  useQuery({ queryKey: ['invoice', hash], queryFn: () => api.invoice(hash!), enabled: hash !== null })

export const useOrders = (query: Record<string, string>, enabled = true) => useQuery({ queryKey: ['orders', query], queryFn: () => api.orders(query), enabled })
export const useOrder = (hash: string | null) => useQuery({ queryKey: ['order', hash], queryFn: () => api.order(hash!), enabled: hash !== null })
export const useDaoRegistry = () => useQuery({ queryKey: ['dao-registry'], queryFn: () => api.daoRegistry(), staleTime: 60_000 })
export const useOrderProofs = (hash: string | null, enabled: boolean) => useQuery({ queryKey: ['order-proofs', hash], queryFn: () => api.orderProofs(hash!), enabled: hash !== null && enabled })

export const usePurchase = (id: string | null) => useQuery({ queryKey: ['purchase', id], queryFn: () => api.purchase(id!), enabled: id !== null })

export const useTransfer = (id: string | null) => useQuery({ queryKey: ['transfer', id], queryFn: () => api.transfer(id!), enabled: id !== null })
