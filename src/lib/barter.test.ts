import { describe, expect, it } from 'vitest'
import {
  base58Decode, base58Encode, cancelListingMessage, listingHash, offerHash, serializeListing, serializeOffer, signCancelListing,
  signListing, signOffer, signMessageWithVoucher, voucherSeed, type Listing, type Offer,
} from './barter'

// Vector dari sdk/spec/test-vectors/barter/listing.json; kunci kA dan kB dari keys.json.
const SEED_A = `ed25519:${base58Encode(Uint8Array.from(new Array<number>(32).fill(1)))}`
const SEED_B = `ed25519:${base58Encode(Uint8Array.from(new Array<number>(32).fill(2)))}`
const listing: Listing = {
  circle: 'x207-circle.near',
  account: 'translator.x207-circle.near',
  offer: { asset_type: 'translate-calls', asset_class: 'D', quantity: 5000, value: '100000000' },
  want: { asset_type: 'summarize-calls', asset_class: 'D', quantity: 5000, value: '100000000' },
  terms: 'delivery within 7 days',
  detail: '5000 translation calls, any language pair',
  expires_at: 1793600000,
  discount_bps: 1000,
  accept_payment: true,
  discoverable: true,
  nonce: 'l1',
}
const HASH = '2f4f3bc3a4c63f350a33dc0e8bdbd90cdfe5a6b03767cad4fb214f006e6f6c5e'
const offer: Offer = {
  circle: 'x207-circle.near', listing_hash: HASH, proposer: 'summarizer.x207-circle.near', round: 1, mode: 'barter',
  value: '100000000', quantity: 5000, deliver_by: 1793000000,
}

describe('lib/barter cocok dengan test vector SDK', () => {
  it('hash dan tanda tangan listing', async () => {
    expect(serializeListing(listing)).toContain('"account":"translator.x207-circle.near","offer":{"asset_type":"translate-calls"')
    expect(await listingHash(listing)).toBe(HASH)
    expect(await signListing(listing, SEED_A)).toBe(
      'ed25519:4pdjmQqGZ3pPHjadnnSzGBQUueeLRG2m7igTYqdyZTnSMFa8MUTxq6DQF4tyBNH7NYsqVWBtBMm6p3tkBr5FGwwu',
    )
  })

  it('hash dan tanda tangan penawaran', async () => {
    expect(serializeOffer(offer)).toBe(
      '{"circle":"x207-circle.near","listing_hash":"' + HASH + '","proposer":"summarizer.x207-circle.near","round":1,"mode":"barter","value":"100000000","quantity":5000,"deliver_by":1793000000}',
    )
    expect(await offerHash(offer)).toBe('a77013b91ae1ab54c31440deefcb19a174b623e80fa45adc2bcabbe5f60e4938')
    expect(await signOffer(offer, SEED_B)).toBe(
      'ed25519:2NjyCCTMztrpbzWtQwzjmiUgfdAKjnYdJwHtXXY2duYQrZHCqxkqB1xaDxv3U5AyNdSkhG3N9B6JcASV6PFAaSPF',
    )
  })

  it('kunci 64 byte (seed + publik) memberi tanda tangan sama dengan seed saja', async () => {
    const pub = base58Decode('AKnL4NNf3DGWZJS6cPknBuEGnVsV4A4m5tgebLHaRSZ9')
    const full = `ed25519:${base58Encode(Uint8Array.from([...new Array<number>(32).fill(1), ...pub]))}`
    expect(await signListing(listing, full)).toBe(await signListing(listing, SEED_A))
  })

  it('pembatalan: pesan dan tanda tangan deterministik per hash dan lingkaran', async () => {
    expect(cancelListingMessage(HASH)).toBe(`x207:cancel_listing:${HASH}`)
    const a = await signCancelListing(HASH, 'x207-circle.near', SEED_A)
    expect(a).toBe(await signMessageWithVoucher(cancelListingMessage(HASH), 'x207-circle.near', SEED_A))
    expect(a).not.toBe(await signCancelListing(HASH, 'other.near', SEED_A))
  })

  it('kunci salah format ditolak', () => {
    expect(() => voucherSeed('abc')).toThrow(/ed25519:/)
    expect(() => voucherSeed('ed25519:1111')).toThrow(/32 atau 64 byte/)
  })

  it('base58 bolak-balik termasuk byte nol di depan', () => {
    const bytes = Uint8Array.from([0, 0, 1, 2, 255])
    expect(base58Decode(base58Encode(bytes))).toEqual(bytes)
  })
})
