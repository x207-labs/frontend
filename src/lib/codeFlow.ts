import {
  CODE_DISPUTE_WINDOW_SECONDS, UNVERIFIABLE_CODE_LIMIT, checkCodeDocument, splitCodePayload, codeDocumentHash, codeOverLimit, normalizeCode, VERIFIABLE_CODE_LIMIT, codeResource, contentHash, createCodeRelease, encryptCode,
  type CodeDocument,
} from '@x207/core'
import type { ListingView, PurchaseView } from '../api/types'
import { signVoucherInBrowser } from './barter'
import { fromHex, toHex } from './hex'
import { receiveLicense, type DownloadResult, type PairState } from './licenseFlow'

// FE-032: kode sekali tukar (pipeline P3, ADR-48). Format dan kripto ada di SDK (SD-076, memakai ulang pertukaran adil SD-070); di sini hanya menyiapkan dokumen kode, membaca
// listing, dan menerima kode. Kode asli ada di browser penjual dan, setelah kunci dilepas, di browser pembeli. Hanya untuk kode yang bisa dicek, penjual mengirim kode dan salt satu kali ke backend saat pengecekan penerbit (backend tidak menyimpannya).
export { CODE_DISPUTE_WINDOW_SECONDS, UNVERIFIABLE_CODE_LIMIT, VERIFIABLE_CODE_LIMIT, codeOverLimit }

export type CodeSellInput = { circle: string; seller: string; code: string; issuer: string; verifiable: boolean; value: string; nonce: string }
export type PreparedCode = {
  document: Required<CodeDocument>
  documentHash: string
  resource: string
  /** `Listing.detail` untuk listing kode: tanpa kode dan tanpa kunci. */
  detail: string
  code: string
  /** Salt acak 32 byte (heks): ada di payload terenkripsi, tidak di listing. */
  salt: string
  ciphertext: Uint8Array
  cipherHash: string
  contentKey: string
}

/** Dokumen kode dari isian. Melempar `CodeError` (mis. `code_over_limit_unbonded`) bila SDK menolak. Kode dienkripsi di sini. */
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

/** Membaca detail listing kode; `null` bila bukan listing kode. Kode tidak pernah ada di listing, hanya hash-nya. */
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

/** Pembeli: mengunduh dan memeriksa kiriman; hasil `ok` memuat kode (teks). Kode salah menghasilkan bukti curang seperti lisensi. */
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

/** Voucher pembelian kode: sama dengan lisensi, resource `x207:code:<hash dokumen>`. */
export async function buildCodePurchase(args: { circle: string; buyer: string; seller: string; epoch: number; amount: string; state: PairState; codeDocHash: string; secretKey: string }) {
  const voucher = {
    circle: args.circle, payer: args.buyer, payee: args.seller, epoch: args.epoch, seq: args.state.seq + 1,
    cumulativeAmount: (BigInt(args.state.cumulativeAmount) + BigInt(args.amount)).toString(), unit: 'credit', resource: codeResource(args.codeDocHash),
  }
  return { voucher, signature: await signVoucherInBrowser(voucher, args.secretKey) }
}

/** Rilis kunci kode untuk satu pembeli (notice `key_released` BE-056). */
export function buildCodeKeyRelease(args: { prepared: PreparedCode; purchaseId: string; buyer: string; buyerPublicKey: string; at: number; sellerSecretKey: string }) {
  return createCodeRelease({
    doc: args.prepared.document, code: args.prepared.code, buyer: args.buyer, buyerPublicKey: args.buyerPublicKey, salt: fromHex(args.prepared.salt), purchase_id: args.purchaseId, ciphertext: args.prepared.ciphertext,
    contentKey: fromHex(args.prepared.contentKey), at: args.at, sellerSecretKey: args.sellerSecretKey,
  })
}

/** Sisa jendela sengketa dalam detik (>= 0), dari `disputeUntil` (detik unix). */
export const disputeSecondsLeft = (disputeUntil: number | null, nowSeconds: number): number | null => (disputeUntil === null ? null : Math.max(0, disputeUntil - nowSeconds))

/** Notice `check` (BE-069): kunci `circle, listing_hash, actor, action, at` dalam urutan itu; tanda tangannya mengikat listing, jadi cek satu listing tidak berlaku untuk listing lain. */
export const codeCheckNotice = (circle: string, listingHash: string, actor: string, at: number) => ({ circle, listing_hash: listingHash, actor, action: 'check', at })
