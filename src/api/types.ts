// Temporary hand-written types from the Backend API Spec, until @x207/core
// provides them (SD-004, SD-010; TC-FE-002-07). Field names follow the spec.

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

/** `edgesUnavailable`: the contract pruned the pairs of this epoch, so the indexer's figures come from what it read before the prune. */
export type EpochItem = { epoch: number; phase: EpochPhase; proposalDeadline: string | null; cutoffAt?: string | null; edgesUnavailable?: boolean }

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
  // Contract 0.0.5 to 0.0.13 parameters; a read API that predates them leaves them out.
  bond_threshold?: string
  bond_bps?: number
  max_search_share_bps?: number
  prune_delay_epochs?: number
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

// POST /x207/settlement/deposit/quote and GET /x207/settlement/jobs/{jobId} (Backend API Spec 6.2, 6.5).
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

// POST /x207/settlement/withdraw/{quote,intent,submit} (Spec API Backend 6.3, 6.4).
export type WithdrawQuoteRequest = {
  circle: string
  account: string
  destinationAsset: string
  amount: string
  recipient: string
  refundTo: string
  acceptHighFee: boolean
  dry: boolean
}
export type WithdrawQuote = {
  jobId: string
  status: string
  dry: boolean
  amountIn: string
  amountOut: string
  withdrawFee: string
  variableFeeBpsEstimate: number
  totalFeePct: number
  threshold: { chain: string; minAmount: string; ok: boolean }
  timeEstimateSeconds: number
  warnings: string[]
}
/** `intent` from 1Click as is; FE-011 reads the NEP-413 `payload` if present. */
export type WithdrawIntent = { jobId: string; intent: { standard?: string; payload?: { message: string; nonce: string; recipient: string } } & Record<string, unknown> }
export type WithdrawSubmit = { jobId: string; status: string; intentHash: string }

// Barter marketplace (F9): Backend API Spec M11, routes in backend/src/marketplace/.
export type ListingStatus = 'open' | 'matched' | 'cancelled' | 'expired'
export type ListingSideView = { assetType: string; assetClass: string; quantity: number; value: string }
export type ListingView = {
  listingHash: string
  account: string
  offer: ListingSideView
  want: ListingSideView
  terms: string
  detail: string
  expiresAt: string
  discountBps: number
  acceptPayment: boolean
  discoverable: boolean
  nonce: string
  signature: string
  status: ListingStatus
}
/** BE-052: answer of the dry run `POST listings/check`; nothing is stored. */
export type ListingCheck = { valid: true; listingHash: string; account: string; offerAssetType: string; expiresAt: number; stored: false }
export type ListingList = { items: ListingView[]; nextCursor: string | null }
export type OfferStatus = 'pending' | 'countered' | 'accepted' | 'closed'
export type OfferView = {
  offerHash: string
  listingHash: string
  proposer: string
  counterparty: string
  awaiting: string
  round: number
  mode: 'pay' | 'barter'
  value: string
  quantity: number
  deliverBy: string
  signature: string
  inReplyTo: string | null
  status: OfferStatus
}
export type MarketStats = {
  listings: { open: number; matched: number; cancelled: number; expired: number; total: number }
  matches: { count: number; payment: number; bundle: number; pay: number; barter: number; listingValue: string; discountValue: string }
  timeToMatchSeconds: { samples: number; min: number | null; max: number | null; average: number | null; median: number | null }
  searcherRevenue: { total: string; matchesWithSearcher: number; bySearcher: { account: string; total: string }[] }
  offersPending: number
}
export type QuickBreakdown =
  | { mode: 'pay'; counterpartyPays: string; sellerReceives: string; searcher: string; discount: string }
  | { mode: 'barter'; cashback: string; searcher: string; sellerBears: string; counterpartyGives: string }
export type BundleLeg = { payer: string; payee: string; max_amount: string }
export type AcceptPreview = {
  kind: 'payment' | 'bundle'
  epoch: number
  mode: 'pay' | 'barter'
  discountValue: string
  searcherValue: string
  searcher: string | null
  breakdown: QuickBreakdown
  bundle: { termsHash: string; message: string; nonce: string; recipient: string; terms: { circle: string; epoch: number; legs: BundleLeg[] }; participants: string[] } | null
  payment: { payer: string; payee: string; amount: string } | null
}
export type AcceptRequest = { account: string; signature?: string; epoch?: number; searcher?: string; searcherShareBps?: number }
export type BundleProposal = {
  termsHash: string
  status: 'proposed' | 'ready'
  epoch: number
  terms: { circle: string; epoch: number; legs: BundleLeg[] }
  participants: string[]
  missing: string[]
  listingHash: string | null
}
export type AcceptResult = {
  match: { kind: 'payment' | 'bundle'; termsHash: string | null }
  offer: OfferView
  result: { kind: 'payment'; payer: string; payee: string; amount: string } | { kind: 'bundle'; proposal: BundleProposal }
}

// GET …/members/{account}/limits (Spec API Backend 2.1, FE-013).
export type LimitHistoryItem = {
  epoch: number | null
  oldLimit: string
  newLimit: string
  status: string
  reason: string
  blockHeight: number
}

// GET …/proposals (Spec API Backend 3.5, FE-015): proposal Sputnik DAO `set_params`.
export type DaoProposal = {
  id: number
  status: 'InProgress' | 'Approved' | 'Rejected' | 'Removed' | 'Expired' | 'Moved' | 'Failed'
  proposer: string
  description: string
  method: string
  params: Partial<Params> | null
  submittedAt: string
  /** Sputnik `vote_counts`: role -> [approve, reject, remove]. */
  votes: Record<string, [number, number, number]>
}
export type DaoProposals = { circle: string; dao: string; items: DaoProposal[]; nextCursor: string | null }

// GET …/grants (BE-038, FE-017): grant D11 seperti event menceritakannya.
export type GrantStatus = 'offered' | 'active' | 'revoked' | 'expired'
export type RevokeReason = 'grantor' | 'grantee' | 'operator' | 'expired' | 'defaulted'
/**
 * Class A escrow from `GET /grants` (BE-038, BE-046, BE-048). `nft`: the NFT and its token. `mt` (CT-092): multi-token contract, token id, and the exact amount in that token's unit. `ft` (CT-090): token contract and the exact amount in that TOKEN's unit
 * (text, not credit). `state`: held, completing, cancelling, delivered, cancelled, or stuck.
 */
export type GrantEscrow =
  | { kind: 'nft'; nftContract: string; tokenId: string; state: string }
  | { kind: 'ft'; ftContract: string; amount: string; state: string }
  | { kind: 'mt'; mtContract: string; tokenId: string; amount: string; state: string }

export type Grant = {
  /** `null` for grants without escrow (class B to D); present for class A grants. */
  escrow?: GrantEscrow | null
  grantId: number
  assetType: string
  grantor: string
  grantee: string | null
  class: 'A' | 'B' | 'C' | 'D' | 'X'
  unit: string
  unitPrice: string
  /** Nanoseconds since the Unix epoch, as a string. */
  expiresAt: string
  deliveryPubkey: string | null
  status: GrantStatus
  revokeReason: RevokeReason | null
  changedBlock: number
}
export type GrantList = { circle: string; unit: 'credit'; decimals: number; items: Grant[]; nextCursor: string | null }

/** `GET /x207/circles/{circle}/intents` (BE-035): off-chain barter intents with the on-chain `post_intent` status from the `intent_posted` event. */
export type IntentView = {
  intentHash: string
  intentHashBase58: string
  account: string
  offer: { service: string; calls: number; value: string }
  need: { service: string; calls: number; value: string }
  expiresAt: string
  status: string
  onchain: { method: 'post_intent'; args: { intent_hash: string }; posted: boolean; blockHeight?: number }
}
export type IntentList = { items: IntentView[]; nextCursor: string | null }

/** `GET /x207/circles/{circle}/intents/hashes` (BE-045): hashes members posted in the contract (`posted`) or have since removed (`removed`), from the `intent_posted` and `intent_removed` events. */
export type IntentHashItem = { intentHash: string; accountId: string; status: 'posted' | 'removed'; postedAtNs: string; changedBlock: number }
export type IntentHashList = { circle: string; items: IntentHashItem[]; nextCursor: string | null }

/** `GET /x207/circles/{circle}/intents/withdrawals` (BE-045): balance withdrawals from Intents (`withdraw_intents_balance`), newest first. */
export type IntentWithdrawals = Amounts & {
  circle: string
  totalWithdrawn: string
  withdrawals: number
  items: Array<{ amount: string; changedBlock: number; receiptId: string }>
  nextCursor: string | null
}

// Invoices and installments (FE-025): Backend API Spec 5e, built from the spec with mocks; BE-051 does not exist yet. Backend responses are normalized by `toInvoiceView`
// (snake_case as in the spec or camelCase as in other read APIs), so the final shape stays single.
export type InvoiceStatus = 'requested' | 'approved' | 'registered' | 'rejected' | 'expired' | 'missed'
export type InstallmentStatus = 'scheduled' | 'registered' | 'shifted' | 'missed'
export type InstallmentReason = 'headroom' | 'blocked_by_debtor'
export type InvoiceDocumentView = { id: string; issuer: string; debtor: string; amount: string; memo: string }
/** `epoch` is the original schedule epoch and never changes; `voucherEpoch` is where the awaited voucher lands (one epoch later after a shift). */
export type InstallmentView = { index: number; epoch: number; amount: string; status: InstallmentStatus; reason: InstallmentReason | null; voucherEpoch: number | null; shifted: boolean }
export type InvoiceView = { invoiceHash: string; document: InvoiceDocumentView; status: InvoiceStatus; needsBond: boolean; rejectReason: string | null; createdAt: string | null; installments: InstallmentView[] }
export type InvoiceList = { items: InvoiceView[]; nextCursor: string | null }

// Service orders (FE-027): Backend API Spec 5f, built from the spec with mocks; BE-054 does not exist yet. Normalized by `toOrderView` (snake_case as in the spec or camelCase).
export type MilestoneStatus = 'open' | 'delivered' | 'confirmed' | 'disputed' | 'paid' | 'cancelled'
export type OrderMilestoneView = {
  index: number; amount: string; dueAt: number; status: MilestoneStatus; deliverableHash: string | null; at: number | null
  outcome: string | null; confirmBy: number | null; autoConfirmed: boolean; disputeReason: string | null
}
export type OrderDocView = {
  circle: string; kind: string; buyer: string; seller: string; specHash: string
  sampleHash: string | null; target: string | null; proof: { method: string; amountPerTx: string } | null; nonce: string
  /** `delegate` orders only (SD-072): sha256 of the mandate. */
  mandateHash: string | null
}
/** Public mandate of a `delegate` order: the SDK `DelegateMandate` in camelCase. */
export type OrderMandateView = { circle: string; dao: string; kinds: string[]; rulesHash: string }
export type OrderView = { orderHash: string; order: OrderDocView; status: string; needsBond: boolean; targetVerified: boolean | null; signedBy: string[]; milestones: OrderMilestoneView[]; mandate: OrderMandateView | null }
export type OrderList = { items: OrderView[]; nextCursor: string | null }
/** On-chain proof; for `delegate` orders also the contract called, proposal, action, and proposal kind (claims the backend checks over RPC). */
export type OnchainProofView = { txHash: string; method: string; signer: string; receiver?: string; proposalId?: number; action?: string; proposalKind?: string; at?: string }

// License handover (FE-028): Backend API Spec 5g, built from the spec with mocks; BE-056 does not exist yet. Normalized by `toPurchaseView`.
export type PurchaseStatus = 'paid_held' | 'cipher_posted' | 'key_released' | 'confirmed' | 'disputed' | 'refuted' | 'cancelled'
export type PurchaseRelease = { circle: string; license_hash: string; buyer: string; content_hash: string; cipher_hash: string; sealed_key: string; at: number; content_size: number; cipher_size: number; key_commitment: string; purchase_id: string }
export type PurchaseView = {
  purchaseId: string; listingHash: string; status: PurchaseStatus; source: { kind: 'https' | 'ipfs'; ref: string } | null; cipherHash: string | null
  release: PurchaseRelease | null; releaseSignature: string | null; disputeUntil: number | null
  buyer: string; seller: string; contentHash: string | null; licenseId: string | null; exclusive: boolean; needsBond: boolean; autoConfirmed: boolean; disputeReason: string | null
}

export type RentChallenge = { required: boolean; grantId?: number; circle?: string; granteeRef?: string; nonce?: string; challenge?: string; expiresAt?: string }
// P2 access rental (FE-029): broker response `GET /grants/{id}/access` (broker README, BE-060).
export type RentStatus = 'active' | 'revoke_pending' | 'revoked'
export type RentView = {
  grantId: number; provider: string; granteeRef: string; /** `verified`, `unproven: …` or `not_applicable` (the provider has no way to prove the reference; BE-057, batch 4). */ proof?: string | null; /** `grantee_unproven` while the reference is not `verified`. */ warnings?: string[]; status: RentStatus; paidUntil: string; providerExpiresAt: string | null; reason: string | null
  revokePending: { attempts: number; nextRetryAt: string | null; lastError: string | null } | null; today: { day: string; cost: string | null; billed: string | null } | null
}
