import { describe, expect, it } from 'vitest'
import {
  base58Decode, base58Encode, cancelListingMessage, listingHash, offerHash, serializeListing, serializeOffer, signCancelListing,
  serializeBundleTerms, signListing, signOffer, signMessageWithVoucher, termsHash, voucherSeed, type Listing, type Offer,
} from './barter'

// Vectors from sdk/spec/test-vectors/barter/listing.json; keys kA and kB from keys.json.
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

describe('lib/barter matches the SDK test vectors', () => {
  it('listing hash and signature', async () => {
    expect(serializeListing(listing)).toContain('"account":"translator.x207-circle.near","offer":{"asset_type":"translate-calls"')
    expect(await listingHash(listing)).toBe(HASH)
    expect(await signListing(listing, SEED_A)).toBe(
      'ed25519:4pdjmQqGZ3pPHjadnnSzGBQUueeLRG2m7igTYqdyZTnSMFa8MUTxq6DQF4tyBNH7NYsqVWBtBMm6p3tkBr5FGwwu',
    )
  })

  it('offer hash and signature', async () => {
    expect(serializeOffer(offer)).toBe(
      '{"circle":"x207-circle.near","listing_hash":"' + HASH + '","proposer":"summarizer.x207-circle.near","round":1,"mode":"barter","value":"100000000","quantity":5000,"deliver_by":1793000000}',
    )
    expect(await offerHash(offer)).toBe('a77013b91ae1ab54c31440deefcb19a174b623e80fa45adc2bcabbe5f60e4938')
    expect(await signOffer(offer, SEED_B)).toBe(
      'ed25519:2NjyCCTMztrpbzWtQwzjmiUgfdAKjnYdJwHtXXY2duYQrZHCqxkqB1xaDxv3U5AyNdSkhG3N9B6JcASV6PFAaSPF',
    )
  })

  it('a 64-byte key (seed + public) gives the same signature as the seed alone', async () => {
    const pub = base58Decode('AKnL4NNf3DGWZJS6cPknBuEGnVsV4A4m5tgebLHaRSZ9')
    const full = `ed25519:${base58Encode(Uint8Array.from([...new Array<number>(32).fill(1), ...pub]))}`
    expect(await signListing(listing, full)).toBe(await signListing(listing, SEED_A))
  })

  it('cancellation: message and signature are deterministic per hash and circle', async () => {
    expect(cancelListingMessage(HASH)).toBe(`x207:cancel_listing:${HASH}`)
    const a = await signCancelListing(HASH, 'x207-circle.near', SEED_A)
    expect(a).toBe(await signMessageWithVoucher(cancelListingMessage(HASH), 'x207-circle.near', SEED_A))
    expect(a).not.toBe(await signCancelListing(HASH, 'other.near', SEED_A))
  })

  it('a key with the wrong format is rejected', () => {
    expect(() => voucherSeed('abc')).toThrow(/ed25519:/)
    expect(() => voucherSeed('ed25519:1111')).toThrow(/32 or 64 bytes/)
  })

  it('base58 round trip including leading zero bytes', () => {
    const bytes = Uint8Array.from([0, 0, 1, 2, 255])
    expect(base58Decode(base58Encode(bytes))).toEqual(bytes)
  })
})

describe('lib/barter bundle terms match the A→B→C→A vector', () => {
  const terms = {
    circle: 'x207-circle.near',
    epoch: 42,
    legs: [
      { payer: 'scraper.x207-circle.near', payee: 'translator.x207-circle.near', max_amount: '6000000' },
      { payer: 'translator.x207-circle.near', payee: 'summarizer.x207-circle.near', max_amount: '10000000' },
      { payer: 'summarizer.x207-circle.near', payee: 'scraper.x207-circle.near', max_amount: '8000000' },
    ],
  }
  it('canonical JSON sorts the legs and the hash equals the one of the SDK', async () => {
    const message = serializeBundleTerms(terms)
    expect(message.indexOf('summarizer.x207-circle.near","payee":"scraper')).toBeLessThan(message.indexOf('"payer":"translator'))
    expect(await termsHash(terms)).toBe('f5d18602740f25fac33c0b84c831477246cd4c04bc9b19e7fddda2887637535d')
  })
  it('the signature of participant translator (kA) equals the vector', async () => {
    expect(await signMessageWithVoucher(serializeBundleTerms(terms), terms.circle, SEED_A)).toBe(
      'ed25519:2qtxR6to99mHKxRSe4FLhTgCuULeGJzHaiBvL5aj37Jeb4V2kCLRTXpPLjbNbXLfuJMDHuokwQPXQo8RWTnMzg6c',
    )
  })
})
