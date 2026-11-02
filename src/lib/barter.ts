// Format listing, penawaran dan tanda tangan marketplace di browser (FE-019, FE-020).
// Port dari `@x207/core` (`marketplace.ts`, `voucher.ts`): JSON kanonik, hash sha256, payload NEP-413 dan ed25519 lewat WebCrypto.
// `@x207/core` memakai `node:crypto`, jadi tidak bisa dibundel ke browser. Kebenarannya dijaga test vector `sdk/spec/test-vectors/barter/`.
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const NEP413_TAG = 2147484061
const PKCS8_ED25519_PREFIX = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20])

export type AssetClass = 'A' | 'B' | 'C' | 'D'
export const ASSET_CLASSES: readonly AssetClass[] = ['A', 'B', 'C', 'D']
export type ListingSide = { asset_type: string; asset_class: AssetClass; quantity: number; value: string }
export type Listing = {
  circle: string
  account: string
  offer: ListingSide
  want: ListingSide
  terms: string
  detail: string
  expires_at: number
  discount_bps: number
  accept_payment: boolean
  discoverable: boolean
  nonce: string
}
export type Offer = {
  circle: string
  listing_hash: string
  proposer: string
  round: number
  mode: 'pay' | 'barter'
  value: string
  quantity: number
  deliver_by: number
}

export function base58Encode(bytes: Uint8Array): string {
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1
  let n = 0n
  for (const b of bytes) n = n * 256n + BigInt(b)
  let out = ''
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out
    n /= 58n
  }
  return '1'.repeat(zeros) + out
}

export function base58Decode(text: string): Uint8Array {
  let n = 0n
  for (const ch of text) {
    const digit = ALPHABET.indexOf(ch)
    if (digit < 0) throw new Error('Karakter base58 tidak sah')
    n = n * 58n + BigInt(digit)
  }
  const bytes: number[] = []
  while (n > 0n) {
    bytes.unshift(Number(n % 256n))
    n /= 256n
  }
  let zeros = 0
  while (zeros < text.length && text[zeros] === '1') zeros += 1
  return Uint8Array.from([...new Array<number>(zeros).fill(0), ...bytes])
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)
const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
const u32le = (value: number): Uint8Array => {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value, true)
  return out
}
const borshString = (text: string): Uint8Array => {
  const bytes = utf8(text)
  return concat(u32le(bytes.length), bytes)
}

export async function sha256(data: Uint8Array | string): Promise<Uint8Array> {
  const bytes = typeof data === 'string' ? utf8(data) : data
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
}

/** sha256 dari payload NEP-413: `u32 tag` + borsh `{ message, nonce[32], recipient, callback_url: None }`. */
export async function nep413SigningHash(message: string, nonce: Uint8Array, recipient: string): Promise<Uint8Array> {
  if (nonce.length !== 32) throw new Error('nonce NEP-413 harus 32 byte')
  return sha256(concat(u32le(NEP413_TAG), borshString(message), nonce, borshString(recipient), Uint8Array.of(0)))
}

const side = (s: ListingSide) => ({ asset_type: s.asset_type, asset_class: s.asset_class, quantity: s.quantity, value: s.value })

/** JSON kanonik listing: urutan key tetap, tanpa spasi (spec marketplace 1). */
export const serializeListing = (l: Listing): string =>
  JSON.stringify({
    circle: l.circle, account: l.account, offer: side(l.offer), want: side(l.want), terms: l.terms, detail: l.detail,
    expires_at: l.expires_at, discount_bps: l.discount_bps, accept_payment: l.accept_payment, discoverable: l.discoverable, nonce: l.nonce,
  })

export const serializeOffer = (o: Offer): string =>
  JSON.stringify({
    circle: o.circle, listing_hash: o.listing_hash, proposer: o.proposer, round: o.round, mode: o.mode, value: o.value,
    quantity: o.quantity, deliver_by: o.deliver_by,
  })

export const listingHash = async (l: Listing): Promise<string> => toHex(await sha256(serializeListing(l)))
export const offerHash = async (o: Offer): Promise<string> => toHex(await sha256(serializeOffer(o)))

/** Kunci voucher `ed25519:<base58>` berisi seed 32 byte atau seed + kunci publik 64 byte; hanya seed yang dipakai. */
export function voucherSeed(secretKey: string): Uint8Array {
  const text = secretKey.trim()
  if (!text.startsWith('ed25519:')) throw new Error('Kunci voucher harus berformat ed25519:…')
  const bytes = base58Decode(text.slice('ed25519:'.length))
  if (bytes.length !== 32 && bytes.length !== 64) throw new Error('Kunci voucher harus 32 atau 64 byte')
  return bytes.slice(0, 32)
}

async function signDigest(digest: Uint8Array, secretKey: string): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', concat(PKCS8_ED25519_PREFIX, voucherSeed(secretKey)) as BufferSource, { name: 'Ed25519' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', key, digest as BufferSource))
  return `ed25519:${base58Encode(signature)}`
}

/** Tanda tangan NEP-413 atas `message` dengan nonce = sha256(message) dan `recipient` = akun kontrak lingkaran. */
export async function signMessageWithVoucher(message: string, recipient: string, secretKey: string): Promise<string> {
  return signDigest(await nep413SigningHash(message, await sha256(message), recipient), secretKey)
}

export const signListing = (l: Listing, secretKey: string) => signMessageWithVoucher(serializeListing(l), l.circle, secretKey)
export const signOffer = (o: Offer, secretKey: string) => signMessageWithVoucher(serializeOffer(o), o.circle, secretKey)
export const cancelListingMessage = (hash: string): string => `x207:cancel_listing:${hash}`
export const signCancelListing = (hash: string, circle: string, secretKey: string) =>
  signMessageWithVoucher(cancelListingMessage(hash), circle, secretKey)
