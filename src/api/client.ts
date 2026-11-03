import { API_URL, CIRCLE } from '../config'
import { toInvoiceView } from './invoiceView'
import type {
  ClearingReport,
  DepositQuote,
  DepositQuoteRequest,
  Job,
  WithdrawIntent,
  WithdrawQuote,
  WithdrawQuoteRequest,
  WithdrawSubmit,
  DaoProposals,
  GrantList,
  IntentHashList,
  IntentList,
  IntentWithdrawals,
  EpochItem,
  LimitHistoryItem,
  EpochMetrics,
  MemberResponse,
  Member,
  Obligations,
  ObligationStage,
  Paged,
  ParamsHistory,
  ParamsResponse,
  SettlementItem,
  AcceptPreview,
  AcceptRequest,
  AcceptResult,
  BundleProposal,
  InvoiceList, InvoiceView, ListingCheck, ListingList,
  ListingView,
  MarketStats,
  OfferView,
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
  memberLimits: (account: string) =>
    get<Paged<LimitHistoryItem>>(`${circle}/members/${encodeURIComponent(account)}/limits`),
  grants: (query: Record<string, string>) => {
    const qs = new URLSearchParams(query).toString()
    return get<GrantList>(`${circle}/grants${qs ? `?${qs}` : ''}`)
  },
  daoProposals: () => get<DaoProposals>(`${circle}/proposals`),
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
  withdrawQuote: (body: WithdrawQuoteRequest) => post<WithdrawQuote>('/x207/settlement/withdraw/quote', body),
  withdrawIntent: (jobId: string) => post<WithdrawIntent>('/x207/settlement/withdraw/intent', { jobId }),
  withdrawSubmit: (jobId: string, signedIntent: object) =>
    post<WithdrawSubmit>('/x207/settlement/withdraw/submit', { jobId, signedIntent }),
  listings: (query: Record<string, string>) => {
    const qs = new URLSearchParams(query).toString()
    return get<ListingList>(`${circle}/listings${qs ? `?${qs}` : ''}`)
  },
  listing: (hash: string) => get<ListingView>(`${circle}/listings/${hash}`),
  createListing: (listing: object, signature: string) => post<ListingView>(`${circle}/listings`, { listing, signature }),
  checkListing: (listing: object, signature: string) => post<ListingCheck>(`${circle}/listings/check`, { listing, signature }),
  invoices: async (query: Record<string, string>): Promise<InvoiceList> => {
    const qs = new URLSearchParams(query).toString()
    const raw = await get<{ items?: unknown[]; nextCursor?: string | null }>(`${circle}/invoices${qs ? `?${qs}` : ''}`)
    return { items: (raw.items ?? []).map(toInvoiceView), nextCursor: raw.nextCursor ?? null }
  },
  invoice: async (hash: string): Promise<InvoiceView> => toInvoiceView(await get<unknown>(`${circle}/invoices/${hash}`)),
  createInvoice: (body: { document: object; installments: number; notice: object; signature: string }) => post<{ invoice_hash?: string; invoiceHash?: string }>(`${circle}/invoices`, body),
  approveInvoice: (hash: string, vouchers: Array<{ voucher: object; signature: string }>) => post<unknown>(`${circle}/invoices/${hash}/approve`, { vouchers }),
  rejectInvoice: (hash: string, notice: object, signature: string) => post<unknown>(`${circle}/invoices/${hash}/reject`, { notice, signature }),
  catchUpInstallment: (hash: string, index: number, voucher: object, signature: string) => post<unknown>(`${circle}/invoices/${hash}/installments/${index}/catch-up`, { voucher, signature }),
  cancelListing: (hash: string, signature: string) => post<ListingView>(`${circle}/listings/${hash}/cancel`, { signature }),
  offers: (hash: string) => get<{ items: OfferView[] }>(`${circle}/listings/${hash}/offers`),
  postOffer: (hash: string, offer: object, signature: string, inReplyTo?: string) =>
    post<OfferView>(`${circle}/listings/${hash}/offers`, { offer, signature, ...(inReplyTo ? { inReplyTo } : {}) }),
  previewAccept: (hash: string, offerHash: string, body: Omit<AcceptRequest, 'signature'>) =>
    post<AcceptPreview>(`${circle}/listings/${hash}/offers/${offerHash}/preview`, body),
  accept: (hash: string, offerHash: string, body: AcceptRequest) =>
    post<AcceptResult>(`${circle}/listings/${hash}/offers/${offerHash}/accept`, body),
  proposals: (account: string) =>
    get<{ items: BundleProposal[] }>(`${circle}/bundle-proposals?account=${encodeURIComponent(account)}`),
  signProposal: (termsHash: string, account: string, signature: string) =>
    post<BundleProposal>(`${circle}/bundle-proposals/${termsHash}/signatures`, { account, signature }),
  intents: (account: string) =>
    get<IntentList>(`${circle}/intents?status=all&limit=100&account=${encodeURIComponent(account)}`),
  intentHashes: (account: string, status: 'posted' | 'removed') =>
    get<IntentHashList>(`${circle}/intents/hashes?status=${status}&limit=100&account=${encodeURIComponent(account)}`),
  intentWithdrawals: () => get<IntentWithdrawals>(`${circle}/intents/withdrawals?limit=5`),
  marketStats: () => get<MarketStats>(`${circle}/marketplace/stats`),
  job: (jobId: string) => get<Job>(`/x207/settlement/jobs/${encodeURIComponent(jobId)}`),
}
