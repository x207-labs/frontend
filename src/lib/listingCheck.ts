import { viewContract } from '../api/chain'
import type { ListingView } from '../api/types'
import { CONTRACT_ID } from '../config'
import { keyFingerprint, listingHash, verifyListingSignature, type AssetClass, type Listing } from './barter'

// Batch 3 F1 (review BE-063): sebelum menandatangani voucher untuk sebuah listing, pembeli memastikan listing itu memang yang ia ketik hashnya, ditandatangani penjualnya, dan penjualnya
// anggota yang aktif. Kunci penjual dibaca dari KONTRAK (`member`), tidak dari read API: API yang jahat tidak bisa memberi kunci sendiri.
export function listingFromView(view: ListingView): Listing {
  const side = (s: ListingView['offer']) => ({ asset_type: s.assetType, asset_class: s.assetClass as AssetClass, quantity: s.quantity, value: s.value })
  return {
    circle: CONTRACT_ID, account: view.account, offer: side(view.offer), want: side(view.want), terms: view.terms, detail: view.detail,
    expires_at: Math.floor(Date.parse(view.expiresAt) / 1000), discount_bps: view.discountBps, accept_payment: view.acceptPayment, discoverable: view.discoverable, nonce: view.nonce,
  }
}

export type MemberOnChain = { account_id: string; pubkey_voucher: string; status: string } | null
/** Anggota dari kontrak (view `member`), atau `null` bila bukan anggota. */
export const memberOnChain = (account: string): Promise<MemberOnChain> => viewContract<MemberOnChain>('member', { account_id: account })

export type ListingCheckResult = { ok: true; listing: Listing; sellerFingerprint: string } | { ok: false; reason: string }

export async function checkListingToBuy(view: ListingView, typedHash: string): Promise<ListingCheckResult> {
  const listing = listingFromView(view)
  if ((await listingHash(listing)) !== typedHash) return { ok: false, reason: 'Hash listing dari server tidak sama dengan yang Anda ketik: jangan beli.' }
  const seller = await memberOnChain(view.account)
  if (seller === null || seller.status !== 'active') return { ok: false, reason: `Penjual ${view.account} bukan anggota aktif di kontrak: jangan beli.` }
  if (!(await verifyListingSignature(listing, view.signature, seller.pubkey_voucher))) {
    return { ok: false, reason: 'Tanda tangan listing tidak cocok dengan kunci voucher penjual di kontrak: jangan beli.' }
  }
  return { ok: true, listing, sellerFingerprint: await keyFingerprint(seller.pubkey_voucher) }
}
