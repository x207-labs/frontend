import {
  ContentHasher, LicenseError, createRelease, encryptContent, fetchCiphertext, httpsSource, ipfsSource, licenseDocumentHash, licenseResource, verifyDelivery, contentHash, makeCheatProof,
  type CheatProof, type CheatReason, type ContentSource, type LicenseDocument, type LicenseRelease,
} from '@x207/core'
import type { PurchaseView } from '../api/types'
import { sha256Hex, signMessageWithVoucher, signVoucherInBrowser } from './barter'
import { fromHex, toHex } from './hex'

// FE-028: content licenses (pipeline P7, ADR-46), from Backend API Spec 5g. All crypto lives in the SDK (SD-070: content hash, encryption, sealed key, delivery check, cheating proof,
// download source); here we only prepare the license document, download with progress, verify, and sign the notice with the voucher key.
export const LICENSE_ASSET_TYPES = [
  'data:dataset', 'model:weights', 'ads:promo-slot', 'design:template', 'creative:licensed-asset', 'plugin:preset', 'course:own-class', 'content:own-work', 'data:own-anonymized',
] as const
export const IPFS_GATEWAYS = ['https://ipfs.io', 'https://dweb.link']

/** Download source; tests replace this with a fake source. */
export const licenseSources: { current: Partial<Record<'https' | 'ipfs', ContentSource>> } = {
  current: { https: httpsSource(), ipfs: ipfsSource({ gateways: IPFS_GATEWAYS }) },
}

export type SellInput = { circle: string; seller: string; bytes: Uint8Array; assetType: string; licenseId: string; licenseText: string; previewText: string; exclusive: boolean; nonce: string }
export type PreparedLicense = {
  document: LicenseDocument
  documentHash: string
  resource: string
  /** `Listing.detail` for a license listing: hash, kind, and resource; no file and no key. */
  detail: string
  assetType: string
  ciphertext: Uint8Array
  /** Original file size (bytes): signed along with the release. */
  contentSize: number
  cipherHash: string
  /** File key (hex): only the seller holds it; released to the buyer in sealed form after the buyer pays (held). */
  contentKey: string
}

/** License document from the file and form input; the hash is computed in the browser. The file is encrypted here, and the seller posts its ciphertext to any source. */
export async function prepareLicense(i: SellInput): Promise<PreparedLicense> {
  const document: LicenseDocument = {
    circle: i.circle, seller: i.seller, content_hash: new ContentHasher().update(i.bytes).digest(), license_id: i.licenseId.trim(),
    license_hash: await sha256Hex(i.licenseText.trim()), preview_hash: i.previewText.trim() === '' ? null : await sha256Hex(i.previewText.trim()), exclusive: i.exclusive, nonce: i.nonce,
  }
  const documentHash = licenseDocumentHash(document) // runs the checks of the SDK on the document
  const { ciphertext, key } = encryptContent(i.bytes)
  return {
    document, documentHash, resource: licenseResource(documentHash), assetType: i.assetType,
    detail: JSON.stringify({
      kind: 'license', asset_type: i.assetType, license_id: document.license_id, license_hash: document.license_hash, content_hash: document.content_hash, exclusive: document.exclusive, license_doc: documentHash,
      ...(i.previewText.trim() === '' ? {} : { preview: i.previewText.trim(), preview_hash: document.preview_hash }),
    }),
    ciphertext, contentSize: i.bytes.length, cipherHash: contentHash(ciphertext), contentKey: toHex(key),
  }
}

export type DownloadResult =
  | { state: 'ok'; content: Uint8Array }
  | { state: 'cheated'; reason: CheatReason; proof: CheatProof }
  | { state: 'refused'; reason: string }

/**
 * Buyer: downloads the ciphertext from the source (with progress), checks `cipher_hash`, then the seller's release and the content against `content_hash`. A wrong source or signature
 * is not cheating and yields no proof; wrong content yields a cheating proof anyone can check.
 */
export async function receiveLicense(view: PurchaseView, sellerPublicKey: string, buyerSecretKey: string, onProgress: (received: number) => void, saved?: Uint8Array): Promise<DownloadResult> {
  if (view.source === null || view.cipherHash === null || view.release === null || view.releaseSignature === null) return { state: 'refused', reason: 'The seller has not yet posted the ciphertext and released the key.' }
  if (view.release.cipher_hash !== view.cipherHash) return { state: 'refused', reason: 'The cipher_hash in the release differs from the one the seller recorded.' }
  let ciphertext: Uint8Array
  if (saved) {
    // FE-097: a file the buyer saved from the source is checked against the same cipher_hash as a download, so nothing is trusted that a download would not be.
    if (contentHash(saved) !== view.cipherHash) return { state: 'refused', reason: 'The file you chose does not match cipher_hash: it is not the file the seller posted. This is not proof of cheating.' }
    ciphertext = saved
  } else {
    try {
      ciphertext = await fetchCiphertext(view.source, view.cipherHash, licenseSources.current, { onProgress })
    } catch (e) {
      if (e instanceof LicenseError && e.code === 'cipher_hash_mismatch') return { state: 'refused', reason: 'The downloaded bytes do not match cipher_hash: wrong source, not proof of cheating.' }
      // FE-097: fetch rejects with a TypeError when the host does not answer, refuses other sites (CORS), or is outside the page's connect-src; the browser does not say which.
      if (e instanceof TypeError) return { state: 'refused', reason: DOWNLOAD_BLOCKED }
      return { state: 'refused', reason: e instanceof Error ? e.message : String(e) }
    }
  }
  const verdict = verifyDelivery({ ciphertext, release: view.release as LicenseRelease, signature: view.releaseSignature, sellerPublicKey, buyerSecretKey, purchaseId: view.purchaseId })
  if (verdict.ok) return { state: 'ok', content: verdict.content }
  if ('proof' in verdict) return { state: 'cheated', reason: verdict.reason, proof: verdict.proof }
  const text: Record<string, string> = {
    cipher_hash_mismatch: 'The downloaded bytes do not match cipher_hash: wrong source, not proof of cheating.',
    bad_signature: 'The release signature does not match the seller key.',
    sealed_key_unopenable: 'The sealed key cannot be opened with your voucher key. This cannot be proven as cheating; dispute it for another reason.',
    wrong_purchase: 'This key release is for another purchase: do not use it.',
  }
  return { state: 'refused', reason: text[verdict.reason] ?? verdict.reason }
}

export const DOWNLOAD_BLOCKED =
  'This browser could not download the file from the source. The host did not answer, does not let other sites download from it, or is not a host this dashboard may connect to. Open the source, save the file, then choose it below.'

/** FE-097: the address the buyer opens to save the ciphertext by hand. A link is a navigation, which the page's connect-src does not govern. */
export function sourceUrl(source: { kind: 'https' | 'ipfs'; ref: string }): string | null {
  if (source.kind === 'ipfs') return /^[A-Za-z0-9]+$/.test(source.ref) ? `${IPFS_GATEWAYS[0]}/ipfs/${source.ref}` : null
  try {
    const url = new URL(source.ref)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export { makeCheatProof }

/** Cheating proof to send to the backend: no ciphertext (the backend downloads it from `source` and matches `cipher_hash`), only the release, signature, and box key. */
export const proofForApi = (proof: CheatProof) => ({ release: proof.release, signature: proof.signature, box_key: proof.box_key })

export type PurchaseAction = 'confirmed' | 'disputed' | 'cancelled'
export const purchaseNotice = (circle: string, purchaseId: string, actor: string, action: PurchaseAction, at: number, reason: string | null = null, proof: ReturnType<typeof proofForApi> | null = null) =>
  ({ circle, purchase_id: purchaseId, actor, action, at, reason, proof })
export const signPurchaseNotice = (notice: ReturnType<typeof purchaseNotice>, secretKey: string): Promise<string> => signMessageWithVoucher(JSON.stringify(notice), notice.circle, secretKey)

export type PairState = { seq: number; cumulativeAmount: string }
/** Purchase voucher held by the backend: continues the state of the (buyer, seller) pair in the open epoch. */
export async function buildPurchase(args: { circle: string; buyer: string; seller: string; epoch: number; amount: string; state: PairState; licenseDocHash: string; secretKey: string }) {
  const voucher = {
    circle: args.circle, payer: args.buyer, payee: args.seller, epoch: args.epoch, seq: args.state.seq + 1,
    cumulativeAmount: (BigInt(args.state.cumulativeAmount) + BigInt(args.amount)).toString(), unit: 'credit', resource: `x207:license:${args.licenseDocHash}`,
  }
  return { voucher, signature: await signVoucherInBrowser(voucher, args.secretKey) }
}

export const takedownMessage = (circle: string, listingHash: string, claim: string, evidenceHash: string): string => JSON.stringify({ circle, listing_hash: listingHash, claim, evidence_hash: evidenceHash })
export { fromHex, toHex }

export type CipherPostedSource = { kind: 'https' | 'ipfs'; ref: string }
/** Seller notice `cipher_posted`: keys `circle, purchase_id, actor, action, at, source, cipher_hash` (BE-056). */
export const cipherPostedNotice = (circle: string, purchaseId: string, actor: string, at: number, source: CipherPostedSource, cipherHash: string) =>
  ({ circle, purchase_id: purchaseId, actor, action: 'cipher_posted', at, source, cipher_hash: cipherHash })
export const signSellerNotice = (notice: object, circle: string, secretKey: string): Promise<string> => signMessageWithVoucher(JSON.stringify(notice), circle, secretKey)

/** Key release for one purchase: the file key is sealed to the buyer's public key and signed by the seller with the SDK `signRelease`; this itself is the `key_released` notice. */
export function buildKeyRelease(args: { circle: string; licenseDoc: string; purchaseId: string; buyer: string; buyerPublicKey: string; contentHash: string; prepared: PreparedLicense; at: number; sellerSecretKey: string }) {
  return createRelease({
    circle: args.circle, license_hash: args.licenseDoc, buyer: args.buyer, buyerPublicKey: args.buyerPublicKey, content_hash: args.contentHash, content_size: args.prepared.contentSize, purchase_id: args.purchaseId, ciphertext: args.prepared.ciphertext,
    contentKey: fromHex(args.prepared.contentKey), at: args.at, sellerSecretKey: args.sellerSecretKey,
  })
}
