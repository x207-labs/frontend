import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from './client'
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

// Hook per epoch diam sampai ada epoch terpilih (TC-FE-002-05).
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
