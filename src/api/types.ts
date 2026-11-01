// Tipe sementara yang ditulis tangan dari Spec API Backend, sampai @x207/core
// menyediakannya (SD-004, SD-010; TC-FE-002-07). Nama field mengikuti spec.

export type EpochPhase = 'open' | 'cutoff' | 'clearing' | 'commit' | 'payment_window' | 'finalized'
export type MemberStatus = 'pending' | 'active' | 'suspended' | 'exited'
export type SettlementStatus = 'due' | 'paid' | 'defaulted' | 'claimable' | 'claimed'
export type ObligationStage = 'cutoff' | 'live' | 'cleared'

type Amounts = { unit: 'credit'; decimals: number }

export type Paged<T> = Amounts & { items: T[]; nextCursor: string | null }

export type Member = {
  account: string
  status: MemberStatus
  stake: string
  limit: string
  outstandingDebt: string
  headroom: string
  termsHash: string
  pubkeyVoucher: string
  settledHistory: string
  joinedAt: string
  exitRequestedEpoch: number | null
}
export type MemberResponse = Amounts & Member & { circle: string }

export type EpochItem = { epoch: number; phase: EpochPhase; proposalDeadline: string | null }

export type ObligationEdge = {
  debtor: string
  creditor: string
  amount: string
  seq: number
  cleared: string | null
  remaining: string | null
}
export type Obligations = Amounts & {
  circle: string
  epoch: number
  phase: EpochPhase
  stage: ObligationStage
  edgeCount: number
  totalObligation: string
  edges: ObligationEdge[]
}

export type SettlementItem = {
  epoch: number
  phase: EpochPhase
  role: 'debtor' | 'creditor'
  net: string
  amount: string
  status: SettlementStatus
  claimableNow?: boolean
  destination?: 'near' | 'intents' | null
  txHash?: string | null
  due?: string
  paidAmount?: string
  stakeSlashed?: string
  haircut?: string
  account?: string
}

export type ReportMember = {
  account: string
  status: 200 | 402 | 202 | 409
  net: string
  cleared?: string
  settlement: SettlementStatus | null
  amount?: string
  due?: string
  claimable?: boolean
  stakeSlashed?: string
  haircut: string
}
export type ClearingReport = Amounts & {
  circle: string
  network: string
  epoch: number
  phase: EpochPhase
  committed: boolean
  finalized: boolean
  totalObligation: string
  cleared: string | null
  clearedRatio: number | null
  committedAt: string | null
  paymentDeadline: string | null
  members: ReportMember[]
}

export type EpochMetrics = Amounts & {
  circle: string
  epoch: number
  phase: EpochPhase
  totalVoucherValue: string
  cleared: string | null
  clearedRatio: number | null
  voucherCount: number
  residualTransfers: number | null
  transferSavings: number | null
  debtBefore: string | null
  debtAfter: string | null
  debtReduction: number | null
  netDebt: string | null
  defaultRate: number | null
  clearingTimeSeconds: number | null
  graph: { participants: number; edges: number; density: number }
}

export type Params = {
  epoch_length: number
  payment_window: number
  proposal_window: number
  base_limit_ratio: number
  limit_growth: number
  limit_cap: string
  limit_decay: number
  fees: { clearing_fee_bps: number; solver_fee_bps: number }
  admission: string
}
export type ParamsResponse = {
  circle: string
  currentEpoch: number
  active: Params
  nextEpoch: Partial<Params> | null
  nextEpochEffective: number | null
}
export type ParamsHistoryItem = {
  field: string
  oldValue: unknown
  newValue: unknown
  effectiveEpoch: number
  blockHeight: number
}
export type ParamsHistory = { items: ParamsHistoryItem[]; nextCursor: string | null }

// POST /x207/settlement/deposit/quote dan GET /x207/settlement/jobs/{jobId} (Spec API Backend 6.2, 6.5).
export type DepositQuoteRequest = {
  purpose: 'stake' | 'settle'
  circle: string
  account: string
  amount?: string
  epoch?: number
  originAsset: string
  refundType: 'INTENTS' | 'ORIGIN_CHAIN'
  refundTo: string
  dry: boolean
}
export type JobStatus =
  | 'waiting_deposit'
  | 'processing'
  | 'ready_withdraw'
  | 'completed'
  | 'refunded'
  | 'failed'
  | 'expired'
export type DepositQuote = Amounts & {
  jobId: string
  status: JobStatus
  purpose: 'stake' | 'settle'
  originAsset: string
  destinationAsset: string
  amountIn: string
  amountOut: string
  recipient: string
  recipientType: 'INTENTS'
  depositAddress: string
  quoteDeadline: string
  timeEstimateSeconds: number
  paymentDeadline?: string
  warnings: string[]
  nextSteps: string[]
}
export type Job = {
  jobId: string
  kind: string
  status: JobStatus
  oneClickStatus: string
  account: string
  epoch?: number | null
  depositAddress?: string
  amountOut?: string
  updatedAt: string
}
