import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from './client'
import { viewContract } from './chain'
import type { ObligationStage } from './types'

export const useEpochs = () => useQuery({ queryKey: ['epochs'], queryFn: api.epochs })
export const useMember = (account: string | null) =>
  useQuery({
    queryKey: ['member', account],
    queryFn: () => api.member(account!),
    enabled: account !== null,
    retry: false,
  })
export const useMembers = () => useQuery({ queryKey: ['members'], queryFn: api.members })
export const useParams = () => useQuery({ queryKey: ['params'], queryFn: api.params })
export const useParamsHistory = () =>
  useQuery({ queryKey: ['params', 'history'], queryFn: api.paramsHistory })

// Per-epoch hooks stay idle until an epoch is selected (TC-FE-002-05).
export const useReport = (epoch: number | null) =>
  useQuery({
    queryKey: ['report', epoch],
    queryFn: () => api.report(epoch!),
    enabled: epoch !== null,
  })
export const useObligations = (epoch: number | null, stage: ObligationStage) =>
  useQuery({
    queryKey: ['obligations', epoch, stage],
    queryFn: () => api.obligations(epoch!, stage),
    enabled: epoch !== null,
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
export const useAllMetrics = (epochs: number[]) =>
  useQueries({
    queries: epochs.map((epoch) => ({
      queryKey: ['metrics', epoch],
      queryFn: () => api.metrics(epoch),
    })),
  })

export const useListings = (query: Record<string, string>) =>
  useQuery({ queryKey: ['listings', query], queryFn: () => api.listings(query) })
export const useMarketStats = () => useQuery({ queryKey: ['market-stats'], queryFn: api.marketStats })
export const useOffers = (hash: string | null) =>
  useQuery({ queryKey: ['offers', hash], queryFn: () => api.offers(hash!), enabled: hash !== null })
export const useProposals = (account: string | null) =>
  useQuery({ queryKey: ['proposals', account], queryFn: () => api.proposals(account!), enabled: account !== null })
export const useMemberLimits = (account: string | null) =>
  useQuery({ queryKey: ['limits', account], queryFn: () => api.memberLimits(account!), enabled: account !== null, retry: false })
export const useDaoProposals = () => useQuery({ queryKey: ['dao-proposals'], queryFn: api.daoProposals })
export const useGrants = (query: Record<string, string>, enabled = true) =>
  useQuery({ queryKey: ['grants', query], queryFn: () => api.grants(query), enabled })

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
