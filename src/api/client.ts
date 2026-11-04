import { API_URL, BROKER_URL, CIRCLE } from '../config'
import { toInvoiceView } from './invoiceView'
import { toOrderView } from './orderView'
import { toPurchaseView } from './purchaseView'
import { toTransferView, type TransferView } from './transferView'
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
  InvoiceList, InvoiceView, OnchainProofView, OrderList, OrderView, PurchaseView, RentChallenge, RentView, ListingCheck, ListingList,
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

/** The wait that the server asks for (header `Retry-After`, seconds) goes into the details of the error, so the page can say it (BE-066: `429 rate_limited`). */
function withRetryAfter(res: Response, details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const wait = Number(res.headers.get('Retry-After'))
  return Number.isFinite(wait) && wait > 0 ? { ...details, retryAfter: Math.ceil(wait) } : details
}

// 207 Multi-Status is within the 2xx range, so the clearing report is read as success.
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`)
  if (res.ok) return res.json() as Promise<T>
  const body = await res.json().catch(() => null)
  const error = body?.error
  throw new ApiError(
    res.status,
    error?.code ?? 'http_error',
    error?.message ?? `Read API menjawab HTTP ${res.status}`,
    withRetryAfter(res, error?.details),
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
    withRetryAfter(res, error?.details),
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
  orders: async (query: Record<string, string>): Promise<OrderList> => {
    const qs = new URLSearchParams(query).toString()
    const raw = await get<{ items?: unknown[]; nextCursor?: string | null }>(`${circle}/orders${qs ? `?${qs}` : ''}`)
    return { items: (raw.items ?? []).map(toOrderView), nextCursor: raw.nextCursor ?? null }
  },
  order: async (hash: string): Promise<OrderView> => toOrderView(await get<unknown>(`${circle}/orders/${hash}`)),
  /** DAO registry owned by circle governance (BE-061): the list of known DAO accounts. `null` if the backend does not provide it. */
  daoRegistry: async (): Promise<string[] | null> => {
    try {
      const raw = await get<{ items?: Array<{ dao?: unknown }> }>(`${circle}/marketplace/dao-registry`)
      return (raw.items ?? []).map((i) => String(i.dao))
    } catch {
      return null
    }
  },
  /** Claim one delegate vote transaction (BE-055): seller-signed notice; the backend checks the transaction over RPC. */
  claimVote: (hash: string, txHash: string, notice: object, signature: string) => post<unknown>(`${circle}/orders/${hash}/claims`, { tx_hash: txHash, notice, signature }),
  createOrder: (body: { order: object; signatures: Array<{ account: string; signature: string }>; mandate?: object }) => post<{ order_hash?: string; orderHash?: string }>(`${circle}/orders`, body),
  orderMilestone: (hash: string, index: number, notice: object, signature: string) => post<unknown>(`${circle}/orders/${hash}/milestones/${index}`, { notice, signature }),
  orderOutcome: (hash: string, notice: object, signature: string) => post<unknown>(`${circle}/orders/${hash}/outcomes`, { notice, signature }),
  orderTargetCheck: (hash: string) => post<{ target_verified?: boolean; targetVerified?: boolean }>(`${circle}/orders/${hash}/target-check`, {}),
  orderProofs: async (hash: string): Promise<OnchainProofView[]> => {
    const raw = await get<{ items?: Array<Record<string, unknown>> }>(`${circle}/orders/${hash}/onchain-proofs`)
    return (raw.items ?? []).map((p) => ({
      txHash: String(p.txHash ?? p.tx_hash), method: String(p.method), signer: String(p.signer),
      ...(p.receiver === undefined ? {} : { receiver: String(p.receiver), proposalId: Number(p.proposalId ?? p.proposal_id), action: String(p.action), proposalKind: String(p.proposalKind ?? p.proposal_kind) }),
      ...(p.at === undefined ? {} : { at: String(p.at) }),
    }))
  },
  purchase: async (id: string): Promise<PurchaseView> => toPurchaseView(await get<unknown>(`${circle}/purchases/${encodeURIComponent(id)}`)),
  createPurchase: (listingHash: string, voucher: object, signature: string) => post<{ purchase_id?: string | number; purchaseId?: string | number }>(`${circle}/listings/${listingHash}/purchases`, { voucher, signature }),
  /** BE-074: a purchase through the official feature of a platform; the answer is the transfer with `status: "paid_held"` and the window. */
  createTransfer: async (listingHash: string, voucher: object, signature: string, buyerRef?: string): Promise<TransferView> =>
    toTransferView(await post<unknown>(`${circle}/listings/${listingHash}/transfers`, { voucher, signature, ...(buyerRef === undefined ? {} : { buyer_ref: buyerRef }) })),
  transfer: async (id: string): Promise<TransferView> => toTransferView(await get<unknown>(`${circle}/transfers/${encodeURIComponent(id)}`)),
  /** Asks the platform for the proof (domain: body `{}`; game item: `{ tradeoffer_id }` the first time). Needs no signature. */
  transferProof: async (id: string, body: { tradeoffer_id?: string } = {}): Promise<TransferView> =>
    toTransferView(await post<unknown>(`${circle}/transfers/${encodeURIComponent(id)}/proof`, body)),
  /** The signed notice `confirmed` (the buyer of a ticket) or `cancelled` (the buyer or the seller while the voucher is held). */
  transferNotice: async (id: string, notice: object, signature: string): Promise<TransferView> =>
    toTransferView(await post<unknown>(`${circle}/transfers/${encodeURIComponent(id)}`, { notice, signature })),
  purchaseNotice: (id: string, notice: object, signature: string) => post<unknown>(`${circle}/purchases/${encodeURIComponent(id)}`, { notice, signature }),
  /** BE-069: the seller reveals the code and salt once; the backend asks the issuer and stores only the verdict and its time. */
  codeCheck: (listingHash: string, notice: object, signature: string, code: string, salt: string) =>
    post<{ listingHash: string; verdict: 'valid' | 'used' | 'unknown'; checkedAt: number; validUntilMs: number | null }>(`${circle}/listings/${listingHash}/code-check`, { notice, signature, code, salt }),
  takedown: (listingHash: string, claim: string, evidenceHash: string, signature: string) => post<unknown>(`${circle}/listings/${listingHash}/takedown`, { claim, evidence_hash: evidenceHash, signature }),
  /** Access rental broker (BE-060), a server separate from the read API: the state of one access and stopping the rental with a signed notice. */
  rent: async (grantId: number): Promise<RentView> => {
    const res = await fetch(`${BROKER_URL}/grants/${grantId}/access`)
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new ApiError(res.status, body?.error ?? 'http_error', body?.message ?? `Broker menjawab HTTP ${res.status}`, undefined)
    return body as RentView
  },
  /** `grantee_ref` proof challenge (BE-057): `{required:false}` for providers that do not ask for it. */
  rentChallenge: async (grantId: number): Promise<RentChallenge> => {
    const res = await fetch(`${BROKER_URL}/grants/${grantId}/access/challenge`)
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new ApiError(res.status, body?.error ?? 'http_error', body?.message ?? `Broker menjawab HTTP ${res.status}`, undefined)
    return body as RentChallenge
  },
  stopRent: async (grantId: number, notice: object, signature: string): Promise<RentView> => {
    const res = await fetch(`${BROKER_URL}/grants/${grantId}/access/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notice, signature }) })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new ApiError(res.status, body?.error ?? 'http_error', body?.message ?? `Broker menjawab HTTP ${res.status}`, undefined)
    return body as RentView
  },
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
