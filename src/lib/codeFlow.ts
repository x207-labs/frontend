import {
  CODE_DISPUTE_WINDOW_SECONDS, UNVERIFIABLE_CODE_LIMIT, checkCodeDocument, splitCodePayload, codeDocumentHash, codeOverLimit, normalizeCode, VERIFIABLE_CODE_LIMIT, codeResource, contentHash, createCodeRelease, encryptCode,
  type CodeDocument,
} from '@x207/core'
import type { ListingView, PurchaseView } from '../api/types'
import { signVoucherInBrowser } from './barter'
import { fromHex, toHex } from './hex'
import { receiveLicense, type DownloadResult, type PairState } from './licenseFlow'

// FE-032: single-use exchange codes (pipeline P3, ADR-48). Format and crypto live in the SDK (SD-076, reusing the SD-070 fair exchange); here we only prepare the code document, read
// the listing, and receive the code. The real code lives in the seller's browser and, after the key is released, in the buyer's browser. Only for checkable codes, the seller sends the code and salt once to the backend during the issuer check (the backend does not store them).
export { CODE_DISPUTE_WINDOW_SECONDS, UNVERIFIABLE_CODE_LIMIT, VERIFIABLE_CODE_LIMIT, codeOverLimit }

export type CodeSellInput = { circle: string; seller: string; code: string; issuer: string; verifiable: boolean; value: string; nonce: string }
export type PreparedCode = {
  document: Required<CodeDocument>
  documentHash: string
  resource: string
  /** `Listing.detail` for a code listing: no code and no key. */
  detail: string
  code: string
  /** Random 32-byte salt (hex): lives in the encrypted payload, not in the listing. */
  salt: string
  ciphertext: Uint8Array
  cipherHash: string
  contentKey: string
}

/** Code document from form input. Throws `CodeError` (e.g. `code_over_limit_unbonded`) if the SDK rejects. The code is encrypted here. */
export function prepareCode(i: CodeSellInput): PreparedCode {
  const { ciphertext, key, code_commitment, salt } = encryptCode(i.code)
  const document = checkCodeDocument({ circle: i.circle, seller: i.seller, code_commitment, issuer: i.issuer.trim(), value: i.value, verifiable: i.verifiable, arbiter: null, nonce: i.nonce })
  const documentHash = codeDocumentHash(document)
  return {
    document, documentHash, resource: codeResource(documentHash), code: i.code,
    detail: JSON.stringify({
      kind: 'code', code_doc: documentHash, code_commitment, issuer: document.issuer, value: document.value, verifiable: document.verifiable, nonce: document.nonce,
    }),
    salt: toHex(salt), ciphertext, cipherHash: contentHash(ciphertext), contentKey: toHex(key),
  }
}

export type CodeListing = { docHash: string; codeCommitment: string; issuer: string; value: string; verifiable: boolean; nonce: string; overLimit: boolean }

/** Reads the detail of a code listing; `null` if it is not a code listing. The code is never in the listing, only its hash. */
export function parseCodeListing(view: ListingView): CodeListing | null {
  let raw: unknown
  try {
    raw = JSON.parse(view.detail)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const d = raw as Record<string, unknown>
  if (d.kind !== 'code' || typeof d.code_doc !== 'string' || typeof d.code_commitment !== 'string' || typeof d.issuer !== 'string') return null
  const value = typeof d.value === 'string' ? d.value : view.offer.value
  const verifiable = typeof d.verifiable === 'boolean' ? d.verifiable : d.issuer !== 'none'
  let overLimit = false
  try {
    overLimit = codeOverLimit({ value, verifiable })
  } catch {
    overLimit = true
  }
  return { docHash: d.code_doc, codeCommitment: d.code_commitment, issuer: d.issuer, value, verifiable, nonce: typeof d.nonce === 'string' ? d.nonce : '', overLimit }
}

/** The code document of the listing that the buyer looked at, rebuilt from the signed listing (circle, seller and value come from the listing, the rest from its detail). */
export const codeDocumentOfListing = (circle: string, view: ListingView, listing: CodeListing): CodeDocument => ({
  circle, seller: view.account, code_commitment: listing.codeCommitment, issuer: listing.issuer, value: view.offer.value, verifiable: listing.verifiable, arbiter: null, nonce: listing.nonce,
})

export type CodeReceive = { state: 'ok'; code: string } | Exclude<DownloadResult, { state: 'ok' }>

/** Buyer: downloads and checks the delivery; an `ok` result carries the code (text). A wrong code yields a cheating proof like licenses. */
export async function receiveCode(view: PurchaseView, sellerPublicKey: string, buyerSecretKey: string, onProgress: (received: number) => void, doc?: CodeDocument): Promise<CodeReceive> {
  // the release must be for the document of the listing that the buyer looked at (B6-F4), not only for what the purchase view of the same backend says
  if (doc !== undefined && view.release !== null) {
    const normal = normalizeCode(doc)
    const r = view.release
    if (r.license_hash !== codeDocumentHash(normal) || r.content_hash !== normal.code_commitment || r.circle !== normal.circle) return { state: 'refused', reason: 'The key release is not for the document of the listing you looked at: the code is not downloaded.' }
  }
  const result = await receiveLicense(view, sellerPublicKey, buyerSecretKey, onProgress)
  if (result.state !== 'ok') return result
  const parts = splitCodePayload(result.content)
  if (parts === null || (view.contentHash !== null && contentHash(result.content) !== view.contentHash)) return { state: 'refused', reason: 'The opened content does not match the listing code_commitment.' }
  return { state: 'ok', code: parts.code }
}

/** Code purchase voucher: same as license, resource `x207:code:<document hash>`. */
export async function buildCodePurchase(args: { circle: string; buyer: string; seller: string; epoch: number; amount: string; state: PairState; codeDocHash: string; secretKey: string }) {
  const voucher = {
    circle: args.circle, payer: args.buyer, payee: args.seller, epoch: args.epoch, seq: args.state.seq + 1,
    cumulativeAmount: (BigInt(args.state.cumulativeAmount) + BigInt(args.amount)).toString(), unit: 'credit', resource: codeResource(args.codeDocHash),
  }
  return { voucher, signature: await signVoucherInBrowser(voucher, args.secretKey) }
}

/** Code key release for one buyer (`key_released` notice, BE-056). */
export function buildCodeKeyRelease(args: { prepared: PreparedCode; purchaseId: string; buyer: string; buyerPublicKey: string; at: number; sellerSecretKey: string }) {
  return createCodeRelease({
    doc: args.prepared.document, code: args.prepared.code, buyer: args.buyer, buyerPublicKey: args.buyerPublicKey, salt: fromHex(args.prepared.salt), purchase_id: args.purchaseId, ciphertext: args.prepared.ciphertext,
    contentKey: fromHex(args.prepared.contentKey), at: args.at, sellerSecretKey: args.sellerSecretKey,
  })
}

/** Remaining dispute window in seconds (>= 0), from `disputeUntil` (unix seconds). */
export const disputeSecondsLeft = (disputeUntil: number | null, nowSeconds: number): number | null => (disputeUntil === null ? null : Math.max(0, disputeUntil - nowSeconds))

/** `check` notice (BE-069): keys `circle, listing_hash, actor, action, at` in that order; its signature binds the listing, so a check of one listing is not valid for another. */
export const codeCheckNotice = (circle: string, listingHash: string, actor: string, at: number) => ({ circle, listing_hash: listingHash, actor, action: 'check', at })

// B7-C3: the backend counts the vouchers that other purchases of the same buyer, seller and epoch still hold (not registered yet), so a second code from the same seller must continue
// from the highest of them: seq above the highest held seq, cumulative = the highest held cumulative + the price. The contract knows only what the seller has registered, so the page
// remembers the vouchers it signed while the page is open and asks the backend which of those purchases are still alive (a cancelled purchase holds nothing).
export type HeldVoucher = { purchaseId: string; payee: string; epoch: number; seq: number; cumulativeAmount: string }
// In memory only: the page stores nothing in the browser besides the wallet marker (TC-FE-SEC-13). After a reload the memory is empty; then a second purchase that does not continue
// the pair is refused by the backend with a message that says why, and the buyer waits for the first one to close.
let held: HeldVoucher[] = []
export function rememberHeld(h: HeldVoucher): void {
  held = [...held.filter((x) => x.purchaseId !== h.purchaseId), h]
}
export const forgetHeld = (): void => {
  held = []
}
export const recallHeld = (payee: string, epoch: number): HeldVoucher[] => held.filter((h) => h.payee === payee && h.epoch === epoch)

/** The state of the pair for the next voucher: the higher of the registered state and the live held vouchers. */
export function pairStateWithHeld(registered: PairState, live: readonly HeldVoucher[]): PairState {
  let seq = registered.seq
  let cumulative = BigInt(registered.cumulativeAmount)
  for (const h of live) {
    if (h.seq > seq) seq = h.seq
    if (BigInt(h.cumulativeAmount) > cumulative) cumulative = BigInt(h.cumulativeAmount)
  }
  return { seq, cumulativeAmount: cumulative.toString() }
}
