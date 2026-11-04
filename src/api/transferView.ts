// The answer of the backend for a transfer through the official feature of a platform (BE-074, `backend/docs/transfers.md`): camelCase fields. An unknown status is an error.
export const TRANSFER_STATUSES = ['paid_held', 'confirmed', 'cancelled'] as const
export type TransferStatus = (typeof TRANSFER_STATUSES)[number]
export type TransferView = {
  transferId: string
  listingHash: string
  buyer: string
  seller: string
  platform: 'domain' | 'game_item' | 'ticket'
  proofMethod: string
  transferRef: string
  status: TransferStatus
  windowUntil: number
  tradeOfferId: string | null
  proof: Record<string, unknown> | null
  cancelReason: string | null
  /** Instructions of a domain: set the TXT `x207-own=<id>` on the domain (only in the answer to the purchase). */
  instructions: { setTxtAfterTransfer: string; on: string } | null
  /** Shown only when the proof is met: for the seller to register. */
  voucher: Record<string, unknown> | null
  voucherSignature: string | null
}

const PLATFORMS = ['domain', 'game_item', 'ticket']

export function toTransferView(input: unknown): TransferView {
  const raw = (input ?? {}) as Record<string, unknown>
  const id = raw.transferId ?? raw.transfer_id
  const status = raw.status as TransferStatus
  const platform = raw.platform as TransferView['platform']
  if ((typeof id !== 'string' && typeof id !== 'number') || !TRANSFER_STATUSES.includes(status) || !PLATFORMS.includes(platform)) {
    throw new Error('Unrecognized transfer response: transferId, status or platform is invalid')
  }
  const instructions = raw.instructions as { setTxtAfterTransfer?: unknown; on?: unknown } | null | undefined
  return {
    transferId: String(id),
    listingHash: String(raw.listingHash ?? ''),
    buyer: String(raw.buyer ?? ''),
    seller: String(raw.seller ?? ''),
    platform,
    proofMethod: String(raw.proofMethod ?? ''),
    transferRef: String(raw.transferRef ?? ''),
    status,
    windowUntil: Number(raw.windowUntil ?? 0),
    tradeOfferId: typeof raw.tradeOfferId === 'string' ? raw.tradeOfferId : null,
    proof: raw.proof !== null && typeof raw.proof === 'object' ? (raw.proof as Record<string, unknown>) : null,
    cancelReason: typeof raw.cancelReason === 'string' ? raw.cancelReason : null,
    instructions: instructions && typeof instructions.setTxtAfterTransfer === 'string' && typeof instructions.on === 'string' ? { setTxtAfterTransfer: instructions.setTxtAfterTransfer, on: instructions.on } : null,
    voucher: raw.voucher !== null && typeof raw.voucher === 'object' ? (raw.voucher as Record<string, unknown>) : null,
    voucherSignature: typeof raw.voucherSignature === 'string' ? raw.voucherSignature : null,
  }
}
