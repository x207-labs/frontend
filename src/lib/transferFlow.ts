import {
  TRANSFER_PLATFORM_METHOD, TRANSFER_WINDOW_SECONDS, TransferError, normalizeTransfer, ownTxt, sellTxt, transferDocumentHash, transferNeedsBond, transferResource, transferVoucher,
  type TransferDocument, type TransferPlatform,
} from '@x207/core'
import type { ListingView } from '../api/types'
import { signVoucherInBrowser } from './barter'
import type { PairState } from './licenseFlow'

// FE-033: transfer through the official feature of a platform (P4, ADR-49). The format and the checks are the SDK (SD-077); here only the preparing of the document, the reading of a
// listing, the voucher and the notices that the backend (BE-074) takes. Nothing of a platform is asked from the browser: the backend asks DNS, RDAP or Steam.
export { TRANSFER_WINDOW_SECONDS, ownTxt, sellTxt, TransferError }

export const TRANSFER_ASSET_TYPE: Readonly<Record<TransferPlatform, string>> = { domain: 'transfer:domain', game_item: 'transfer:game-item', ticket: 'transfer:ticket' }
export const PLATFORM_LABEL: Readonly<Record<TransferPlatform, string>> = { domain: 'Domain', game_item: 'Game item (Steam)', ticket: 'Ticket' }
export const PROOF_LABEL: Readonly<Record<string, string>> = {
  dns_txt: 'DNS TXT record and registry (RDAP) check by the backend',
  trade_api: 'Steam trade offer accepted and out of its hold, checked by the backend',
  buyer_confirm: 'the buyer signs a confirmation',
}

export type TransferInput = { circle: string; seller: string; platform: TransferPlatform; transferRef: string; estimateSeconds: number; value: string; nonce: string }
export type PreparedTransfer = { document: TransferDocument; documentHash: string; resource: string; assetType: string; detail: string; needsBond: boolean }

/** The document of a transfer listing from the form: the checks of the SDK run here, and the detail is what goes in `Listing.detail` (nothing secret in it). */
export function prepareTransfer(i: TransferInput): PreparedTransfer {
  const document = normalizeTransfer({
    circle: i.circle, seller: i.seller, platform: i.platform, transfer_ref: i.transferRef.trim(), proof_method: TRANSFER_PLATFORM_METHOD[i.platform], estimate_seconds: i.estimateSeconds, value: i.value, nonce: i.nonce,
  })
  const documentHash = transferDocumentHash(document)
  return {
    document, documentHash, resource: transferResource(documentHash), assetType: TRANSFER_ASSET_TYPE[i.platform], needsBond: transferNeedsBond(document),
    detail: JSON.stringify({
      kind: 'transfer', transfer_doc: documentHash, platform: document.platform, transfer_ref: document.transfer_ref, proof_method: document.proof_method, estimate_seconds: document.estimate_seconds, nonce: document.nonce,
    }),
  }
}

export type TransferListing = { doc: TransferDocument; documentHash: string; needsBond: boolean; windowSeconds: number }

/**
 * Reads the detail of a listing and rebuilds the document from the signed listing (circle, seller, value) and the detail; the hash must be `transfer_doc`, so nothing the buyer sees
 * can differ from what the seller signed. `null` when the listing is not a transfer listing or the document is not valid.
 */
export function parseTransferListing(circle: string, view: ListingView): TransferListing | null {
  let raw: unknown
  try {
    raw = JSON.parse(view.detail)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const d = raw as Record<string, unknown>
  if (d.kind !== 'transfer' || typeof d.transfer_doc !== 'string') return null
  try {
    const doc = normalizeTransfer({
      circle, seller: view.account, platform: d.platform as TransferPlatform, transfer_ref: String(d.transfer_ref), proof_method: d.proof_method as TransferDocument['proof_method'],
      estimate_seconds: Number(d.estimate_seconds), value: view.offer.value, nonce: String(d.nonce),
    })
    const documentHash = transferDocumentHash(doc)
    if (documentHash !== d.transfer_doc) return null
    return { doc, documentHash, needsBond: transferNeedsBond(doc), windowSeconds: TRANSFER_WINDOW_SECONDS[doc.platform] }
  } catch {
    return null
  }
}

/** The voucher of the buyer for the transfer, signed in the browser. `state` counts the vouchers that purchases and transfers still hold (B7-C3). */
export async function buildTransferPurchase(args: { listing: TransferListing; buyer: string; epoch: number; state: PairState; secretKey: string }) {
  const voucher = transferVoucher({ doc: args.listing.doc, buyer: args.buyer, epoch: args.epoch, state: args.state })
  return { voucher, signature: await signVoucherInBrowser(voucher, args.secretKey) }
}

/** The notice of BE-074: keys `circle, transfer_id, actor, action, at`, action `confirmed` (the buyer of a ticket) or `cancelled`. */
export const transferNotice = (circle: string, transferId: string, actor: string, action: 'confirmed' | 'cancelled', at: number) => ({ circle, transfer_id: Number(transferId), actor, action, at })

/** Seconds left of the window, never below 0; `null` without a window. */
export const windowSecondsLeft = (windowUntil: number, nowSeconds: number): number => Math.max(0, windowUntil - nowSeconds)
