import type { PurchaseStatus, PurchaseView } from './types'

// The license purchase response from the backend (BE-056) is normalized: `purchase_id`, `cipher_hash`, `dispute_until` as in spec 5g, or camelCase. The key release (the seller-signed `key_released` notice)
// is read from `release` and `release_signature`. Unknown statuses are rejected with an error.
type Raw = Record<string, unknown>
const pick = (raw: Raw, snake: string, camel: string): unknown => raw[camel] ?? raw[snake]
const STATUSES: readonly PurchaseStatus[] = ['paid_held', 'cipher_posted', 'key_released', 'confirmed', 'disputed', 'refuted', 'cancelled']

export function toPurchaseView(input: unknown): PurchaseView {
  const raw = (input ?? {}) as Raw
  const id = pick(raw, 'purchase_id', 'purchaseId')
  const status = raw.status as PurchaseStatus
  if ((typeof id !== 'string' && typeof id !== 'number') || !STATUSES.includes(status)) throw new Error('Unrecognized purchase response: purchase_id or status is invalid')
  const source = raw.source as Raw | null | undefined
  const release = pick(raw, 'release', 'release') as Raw | null | undefined
  const until = pick(raw, 'dispute_until', 'disputeUntil')
  return {
    purchaseId: String(id),
    listingHash: String(pick(raw, 'listing_hash', 'listingHash') ?? ''),
    status,
    source: source && (source.kind === 'https' || source.kind === 'ipfs') ? { kind: source.kind, ref: String(source.ref) } : null,
    cipherHash: (pick(raw, 'cipher_hash', 'cipherHash') as string | null | undefined) ?? null,
    release: release ? (release as unknown as PurchaseView['release']) : null,
    releaseSignature: (pick(raw, 'release_signature', 'releaseSignature') as string | null | undefined) ?? null,
    disputeUntil: until === undefined || until === null ? null : Number(until),
    buyer: String(raw.buyer ?? ''), seller: String(raw.seller ?? ''), contentHash: (pick(raw, 'content_hash', 'contentHash') as string | null | undefined) ?? null,
    licenseId: (pick(raw, 'license_id', 'licenseId') as string | null | undefined) ?? null, exclusive: Boolean(raw.exclusive), needsBond: Boolean(pick(raw, 'needs_bond', 'needsBond')),
    autoConfirmed: Boolean(pick(raw, 'auto_confirmed', 'autoConfirmed')), disputeReason: (pick(raw, 'dispute_reason', 'disputeReason') as string | null | undefined) ?? null,
  }
}
