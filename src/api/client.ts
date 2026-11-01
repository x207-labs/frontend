import { API_URL, CIRCLE } from '../config'
import type {
  ClearingReport,
  DepositQuote,
  DepositQuoteRequest,
  Job,
  EpochItem,
  EpochMetrics,
  MemberResponse,
  Member,
  Obligations,
  ObligationStage,
  Paged,
  ParamsHistory,
  ParamsResponse,
  SettlementItem,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: Record<string, unknown>

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

// 207 Multi-Status termasuk rentang 2xx, jadi laporan kliring dibaca sebagai sukses.
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`)
  if (res.ok) return res.json() as Promise<T>
  const body = await res.json().catch(() => null)
  const error = body?.error
  throw new ApiError(
    res.status,
    error?.code ?? 'http_error',
    error?.message ?? `Read API menjawab HTTP ${res.status}`,
    error?.details,
  )
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.ok) return res.json() as Promise<T>
  const payload = await res.json().catch(() => null)
  const error = payload?.error
  throw new ApiError(
    res.status,
    error?.code ?? 'http_error',
    error?.message ?? `Read API menjawab HTTP ${res.status}`,
    error?.details,
  )
}

const circle = `/x207/circles/${encodeURIComponent(CIRCLE)}`

export const api = {
  epochs: () => get<Paged<EpochItem>>(`${circle}/epochs`),
  members: () => get<Paged<Member>>(`${circle}/members`),
  member: (account: string) =>
    get<MemberResponse>(`${circle}/members/${encodeURIComponent(account)}`),
  memberSettlements: (account: string) =>
    get<Paged<SettlementItem>>(`${circle}/members/${encodeURIComponent(account)}/settlements`),
  report: (epoch: number) => get<ClearingReport>(`${circle}/epochs/${epoch}`),
  obligations: (epoch: number, stage: ObligationStage) =>
    get<Obligations>(`${circle}/epochs/${epoch}/obligations?stage=${stage}`),
  epochSettlements: (epoch: number, status?: string) =>
    get<Paged<SettlementItem>>(
      `${circle}/epochs/${epoch}/settlements${status ? `?status=${status}` : ''}`,
    ),
  metrics: (epoch: number) => get<EpochMetrics>(`${circle}/epochs/${epoch}/metrics`),
  params: () => get<ParamsResponse>(`${circle}/params`),
  paramsHistory: () => get<ParamsHistory>(`${circle}/params/history`),
  depositQuote: (body: DepositQuoteRequest) => post<DepositQuote>('/x207/settlement/deposit/quote', body),
  job: (jobId: string) => get<Job>(`/x207/settlement/jobs/${encodeURIComponent(jobId)}`),
}
