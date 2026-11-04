import { viewContract } from '../api/chain'
import type { ListingView } from '../api/types'
import { CONTRACT_ID } from '../config'
import { keyFingerprint, listingHash, verifyListingSignature, type AssetClass, type Listing } from './barter'

// Batch 3 F1 (review BE-063): before signing a voucher for a listing, the buyer makes sure the listing is the one whose hash they typed, signed by its seller, and that the seller is
// an active member. The seller key is read from the CONTRACT (`member`), not from the read API: a malicious API cannot supply its own key.
export function listingFromView(view: ListingView): Listing {
  const side = (s: ListingView['offer']) => ({ asset_type: s.assetType, asset_class: s.assetClass as AssetClass, quantity: s.quantity, value: s.value })
  return {
    circle: CONTRACT_ID, account: view.account, offer: side(view.offer), want: side(view.want), terms: view.terms, detail: view.detail,
    expires_at: Math.floor(Date.parse(view.expiresAt) / 1000), discount_bps: view.discountBps, accept_payment: view.acceptPayment, discoverable: view.discoverable, nonce: view.nonce,
  }
}

export type MemberOnChain = { account_id: string; pubkey_voucher: string; status: string } | null
/** Member from the contract (`member` view), or `null` if not a member. */
export const memberOnChain = (account: string): Promise<MemberOnChain> => viewContract<MemberOnChain>('member', { account_id: account })

export type ListingCheckResult = { ok: true; listing: Listing; sellerFingerprint: string } | { ok: false; reason: string }

export async function checkListingToBuy(view: ListingView, typedHash: string): Promise<ListingCheckResult> {
  const listing = listingFromView(view)
  if ((await listingHash(listing)) !== typedHash) return { ok: false, reason: 'The listing hash from the server differs from the one you typed: do not buy.' }
  const seller = await memberOnChain(view.account)
  if (seller === null || seller.status !== 'active') return { ok: false, reason: `Seller ${view.account} is not an active member on the contract: do not buy.` }
  if (!(await verifyListingSignature(listing, view.signature, seller.pubkey_voucher))) {
    return { ok: false, reason: 'The listing signature does not match the seller voucher key on the contract: do not buy.' }
  }
  return { ok: true, listing, sellerFingerprint: await keyFingerprint(seller.pubkey_voucher) }
}
