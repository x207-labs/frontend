import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { ObligationStage } from './types'

export const useEpochs = () => useQuery({ queryKey: ['epochs'], queryFn: api.epochs })
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
