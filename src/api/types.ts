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
/** `intent` dari 1Click apa adanya; FE-011 membaca `payload` NEP-413 bila ada. */
export type WithdrawIntent = { jobId: string; intent: { standard?: string; payload?: { message: string; nonce: string; recipient: string } } & Record<string, unknown> }
export type WithdrawSubmit = { jobId: string; status: string; intentHash: string }

// Marketplace barter (F9): Spec API Backend M11, route di backend/src/marketplace/.
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
  /** Sputnik `vote_counts`: peran -> [setuju, tolak, hapus]. */
  votes: Record<string, [number, number, number]>
}
export type DaoProposals = { circle: string; dao: string; items: DaoProposal[]; nextCursor: string | null }

// GET …/grants (BE-038, FE-017): grant D11 seperti event menceritakannya.
export type GrantStatus = 'offered' | 'active' | 'revoked' | 'expired'
export type RevokeReason = 'grantor' | 'grantee' | 'operator' | 'expired' | 'defaulted'
/**
 * Escrow kelas A dari `GET /grants` (BE-038, BE-046, BE-048). `nft`: NFT dan token-nya. `mt` (CT-092): kontrak multi-token, id token, dan jumlah persis dalam satuan token itu. `ft` (CT-090): kontrak token dan jumlah persis dalam satuan TOKEN itu
 * (teks, bukan credit). `state`: held, completing, cancelling, delivered, cancelled, atau stuck.
 */
export type GrantEscrow =
  | { kind: 'nft'; nftContract: string; tokenId: string; state: string }
  | { kind: 'ft'; ftContract: string; amount: string; state: string }
  | { kind: 'mt'; mtContract: string; tokenId: string; amount: string; state: string }

export type Grant = {
  /** `null` untuk grant tanpa escrow (kelas B sampai D); ada untuk grant kelas A. */
  escrow?: GrantEscrow | null
  grantId: number
  assetType: string
  grantor: string
  grantee: string | null
  class: 'A' | 'B' | 'C' | 'D' | 'X'
  unit: string
  unitPrice: string
  /** Nanodetik sejak epoch Unix, sebagai string. */
  expiresAt: string
  deliveryPubkey: string | null
  status: GrantStatus
  revokeReason: RevokeReason | null
  changedBlock: number
}
export type GrantList = { circle: string; unit: 'credit'; decimals: number; items: Grant[]; nextCursor: string | null }

/** `GET /x207/circles/{circle}/intents` (BE-035): intent barter off-chain dengan status `post_intent` on-chain dari event `intent_posted`. */
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

/** `GET /x207/circles/{circle}/intents/hashes` (BE-045): hash yang dipasang anggota di kontrak (`posted`) atau sudah dihapus (`removed`), dari event `intent_posted` dan `intent_removed`. */
export type IntentHashItem = { intentHash: string; accountId: string; status: 'posted' | 'removed'; postedAtNs: string; changedBlock: number }
export type IntentHashList = { circle: string; items: IntentHashItem[]; nextCursor: string | null }

/** `GET /x207/circles/{circle}/intents/withdrawals` (BE-045): penarikan saldo dari Intents (`withdraw_intents_balance`), terbaru dulu. */
export type IntentWithdrawals = Amounts & {
  circle: string
  totalWithdrawn: string
  withdrawals: number
  items: Array<{ amount: string; changedBlock: number; receiptId: string }>
  nextCursor: string | null
}

// Invoice dan cicilan (FE-025): Spec API Backend 5e, dibangun dari spec dengan mock; BE-051 belum ada. Jawaban backend dinormalkan oleh `toInvoiceView`
// (snake_case seperti di spec atau camelCase seperti read API lain), jadi bentuk akhirnya tetap satu.
export type InvoiceStatus = 'requested' | 'approved' | 'registered' | 'rejected' | 'expired' | 'missed'
export type InstallmentStatus = 'scheduled' | 'registered' | 'shifted' | 'missed'
export type InstallmentReason = 'headroom' | 'blocked_by_debtor'
export type InvoiceDocumentView = { id: string; issuer: string; debtor: string; amount: string; memo: string }
/** `epoch` adalah epoch jadwal asli dan tidak berubah; `voucherEpoch` tempat voucher yang ditunggu (satu epoch lebih lambat setelah digeser). */
export type InstallmentView = { index: number; epoch: number; amount: string; status: InstallmentStatus; reason: InstallmentReason | null; voucherEpoch: number | null; shifted: boolean }
export type InvoiceView = { invoiceHash: string; document: InvoiceDocumentView; status: InvoiceStatus; needsBond: boolean; rejectReason: string | null; createdAt: string | null; installments: InstallmentView[] }
export type InvoiceList = { items: InvoiceView[]; nextCursor: string | null }

// Pesanan jasa (FE-027): Spec API Backend 5f, dibangun dari spec dengan mock; BE-054 belum ada. Dinormalkan oleh `toOrderView` (snake_case seperti di spec atau camelCase).
export type MilestoneStatus = 'open' | 'delivered' | 'confirmed' | 'disputed' | 'paid' | 'cancelled'
export type OrderMilestoneView = {
  index: number; amount: string; dueAt: number; status: MilestoneStatus; deliverableHash: string | null; at: number | null
  outcome: string | null; confirmBy: number | null; autoConfirmed: boolean; disputeReason: string | null
}
export type OrderDocView = {
  circle: string; kind: string; buyer: string; seller: string; specHash: string
  sampleHash: string | null; target: string | null; proof: { method: string; amountPerTx: string } | null; nonce: string
}
export type OrderView = { orderHash: string; order: OrderDocView; status: string; needsBond: boolean; targetVerified: boolean | null; signedBy: string[]; milestones: OrderMilestoneView[] }
export type OrderList = { items: OrderView[]; nextCursor: string | null }
export type OnchainProofView = { txHash: string; method: string; signer: string }

// Penyerahan lisensi (FE-028): Spec API Backend 5g, dibangun dari spec dengan mock; BE-056 belum ada. Dinormalkan oleh `toPurchaseView`.
export type PurchaseStatus = 'paid_held' | 'cipher_posted' | 'key_released' | 'confirmed' | 'disputed' | 'refuted' | 'cancelled'
export type PurchaseRelease = { circle: string; license_hash: string; buyer: string; content_hash: string; cipher_hash: string; sealed_key: string; at: number }
export type PurchaseView = {
  purchaseId: string; listingHash: string; status: PurchaseStatus; source: { kind: 'https' | 'ipfs'; ref: string } | null; cipherHash: string | null
  release: PurchaseRelease | null; releaseSignature: string | null; disputeUntil: number | null
  buyer: string; seller: string; contentHash: string | null; licenseId: string | null; exclusive: boolean; needsBond: boolean; autoConfirmed: boolean; disputeReason: string | null
}
