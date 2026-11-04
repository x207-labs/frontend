// Marketplace listing, offer and signature formats in the browser (FE-019, FE-020).
// Port of `@x207/core` (`marketplace.ts`, `voucher.ts`): canonical JSON, sha256 hash, NEP-413 payload and ed25519 via WebCrypto.
// `@x207/core` uses `node:crypto`, so it cannot be bundled for the browser. Correctness is guarded by the test vectors in `sdk/spec/test-vectors/barter/`.
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
    if (digit < 0) throw new Error('Invalid base58 character')
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

/** sha256 of the NEP-413 payload: `u32 tag` + borsh `{ message, nonce[32], recipient, callback_url: None }`. */
export async function nep413SigningHash(message: string, nonce: Uint8Array, recipient: string): Promise<Uint8Array> {
  if (nonce.length !== 32) throw new Error('NEP-413 nonce must be 32 bytes')
  return sha256(concat(u32le(NEP413_TAG), borshString(message), nonce, borshString(recipient), Uint8Array.of(0)))
}

const side = (s: ListingSide) => ({ asset_type: s.asset_type, asset_class: s.asset_class, quantity: s.quantity, value: s.value })

/** Canonical listing JSON: fixed key order, no whitespace (marketplace spec 1). */
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

/** A voucher key `ed25519:<base58>` holds a 32-byte seed or seed + 64-byte public key; only the seed is used. */
export function voucherSeed(secretKey: string): Uint8Array {
  const text = secretKey.trim()
  if (!text.startsWith('ed25519:')) throw new Error('Voucher key must have the format ed25519:…')
  const bytes = base58Decode(text.slice('ed25519:'.length))
  if (bytes.length !== 32 && bytes.length !== 64) throw new Error('Voucher key must be 32 or 64 bytes')
  return bytes.slice(0, 32)
}

async function signDigest(digest: Uint8Array, secretKey: string): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', concat(PKCS8_ED25519_PREFIX, voucherSeed(secretKey)) as BufferSource, { name: 'Ed25519' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', key, digest as BufferSource))
  return `ed25519:${base58Encode(signature)}`
}

/** NEP-413 signature over `message` with nonce = sha256(message) and `recipient` = the circle contract account. */
export async function signMessageWithVoucher(message: string, recipient: string, secretKey: string): Promise<string> {
  return signDigest(await nep413SigningHash(message, await sha256(message), recipient), secretKey)
}

export const signListing = (l: Listing, secretKey: string) => signMessageWithVoucher(serializeListing(l), l.circle, secretKey)
export const signOffer = (o: Offer, secretKey: string) => signMessageWithVoucher(serializeOffer(o), o.circle, secretKey)
export const cancelListingMessage = (hash: string): string => `x207:cancel_listing:${hash}`
export const signCancelListing = (hash: string, circle: string, secretKey: string) =>
  signMessageWithVoucher(cancelListingMessage(hash), circle, secretKey)

export type BundleTerms = { circle: string; epoch: number; legs: Array<{ payer: string; payee: string; max_amount: string }>; search_leg?: { payer: string; payee: string } }

const byBytes = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Canonical bundle terms JSON: legs sorted by (payer, payee), `search_leg` last key if present; same as the SDK `serializeBundleTerms`. */
export const serializeBundleTerms = (t: BundleTerms): string =>
  JSON.stringify({
    circle: t.circle,
    epoch: t.epoch,
    legs: [...t.legs]
      .sort((a, b) => byBytes(a.payer, b.payer) || byBytes(a.payee, b.payee))
      .map((l) => ({ payer: l.payer, payee: l.payee, max_amount: l.max_amount })),
    ...(t.search_leg ? { search_leg: { payer: t.search_leg.payer, payee: t.search_leg.payee } } : {}),
  })

const MAX_BUNDLE_LEGS = 64
const sameKeys = (value: object, keys: string[]): boolean => {
  const have = Object.keys(value).sort()
  return have.length === keys.length && have.every((k, i) => k === [...keys].sort()[i])
}
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export type BundleCheck = { ok: true; terms: BundleTerms } | { ok: false; reason: string }

/**
 * Check before the voucher key signs a message from the server (finding FE-1). The server supplies `message`, `recipient` and `terms_hash`, so
 * `sha256(message) = terms_hash` proves nothing. What the browser checks: the signature recipient is this circle contract; the message
 * is exactly the canonical bundle terms (not a voucher, listing or other message); the circle and epoch inside match; the signing account is
 * a payer or payee; and that account's outgoing legs do not exceed the amounts in the displayed breakdown (if a breakdown exists).
 */
export function checkBundleToSign(input: { message: string; recipient: string; account: string; contract: string; epoch: number; breakdown?: Record<string, string> }): BundleCheck {
  const fail = (reason: string): BundleCheck => ({ ok: false, reason })
  if (input.recipient !== input.contract) return fail(`The signature recipient (${input.recipient}) is not this circle's contract (${input.contract}). Cancelled.`)
  let parsed: unknown
  try {
    parsed = JSON.parse(input.message)
  } catch {
    return fail('The message is not bundle terms (not JSON). Cancelled.')
  }
  const shapeOk =
    isObject(parsed) &&
    (sameKeys(parsed, ['circle', 'epoch', 'legs']) || sameKeys(parsed, ['circle', 'epoch', 'legs', 'search_leg'])) &&
    typeof parsed.circle === 'string' &&
    Number.isSafeInteger(parsed.epoch) &&
    (parsed.epoch as number) >= 1 &&
    Array.isArray(parsed.legs) &&
    parsed.legs.length >= 2 &&
    parsed.legs.length <= MAX_BUNDLE_LEGS &&
    parsed.legs.every((l) => isObject(l) && sameKeys(l, ['payer', 'payee', 'max_amount']) && typeof l.payer === 'string' && typeof l.payee === 'string' && typeof l.max_amount === 'string' && /^[1-9]\d*$/.test(l.max_amount)) &&
    (parsed.search_leg === undefined || (isObject(parsed.search_leg) && sameKeys(parsed.search_leg, ['payer', 'payee']) && typeof parsed.search_leg.payer === 'string' && typeof parsed.search_leg.payee === 'string'))
  if (!shapeOk) return fail('The message is not bundle terms. Cancelled.')
  const terms = parsed as unknown as BundleTerms
  if (serializeBundleTerms(terms) !== input.message) return fail('The message is not canonical bundle terms (spacing, key order, or leg order differs). Cancelled.')
  if (terms.circle !== input.contract) return fail(`Bundle terms are for another circle (${terms.circle}), not this circle's contract (${input.contract}). Cancelled.`)
  if (terms.epoch !== input.epoch) return fail(`The epoch in the message (${terms.epoch}) differs from the breakdown epoch (${input.epoch}). Cancelled.`)
  if (!terms.legs.some((l) => l.payer === input.account || l.payee === input.account)) return fail('Your account is not a payer or payee in any leg. Cancelled.')
  if (input.breakdown) {
    const bound = Object.values(input.breakdown).reduce((sum, v) => (typeof v === 'string' && /^\d+$/.test(v) ? sum + BigInt(v) : sum), 0n)
    const outgoing = terms.legs.filter((l) => l.payer === input.account).reduce((sum, l) => sum + BigInt(l.max_amount), 0n)
    if (outgoing > bound) return fail(`Your outgoing legs (${outgoing}) exceed the breakdown shown (${bound}). Cancelled.`)
  }
  return { ok: true, terms }
}

export const termsHash = async (t: BundleTerms): Promise<string> => toHex(await sha256(serializeBundleTerms(t)))
export const sha256Hex = async (text: string): Promise<string> => toHex(await sha256(text))

// FE-025: vouchers are signed in the browser (ADR-17 and SD-065). Message = canonical voucher JSON, nonce = sha256("x207:<payer>:<payee>:<epoch>:<seq>"), recipient = the circle contract account.
// The result equals `signVoucher` from `@x207/core` (deterministic ed25519); the tests compare them.
export type VoucherFields = { circle: string; payer: string; payee: string; epoch: number; seq: number; cumulativeAmount: string; unit: string; resource: string }
export async function signVoucherInBrowser(v: VoucherFields, secretKey: string): Promise<string> {
  const message = JSON.stringify({ circle: v.circle, payer: v.payer, payee: v.payee, epoch: v.epoch, seq: v.seq, cumulativeAmount: v.cumulativeAmount, unit: v.unit, resource: v.resource })
  const nonce = await sha256(`x207:${v.payer}:${v.payee}:${v.epoch}:${v.seq}`)
  return signDigest(await nep413SigningHash(message, nonce, v.circle), secretKey)
}

/** Verifies a NEP-413 signature over `message` with public key `ed25519:<base58>` (WebCrypto); `false` for anything invalid. */
export async function verifyMessageWithVoucher(message: string, recipient: string, signature: string, publicKey: string): Promise<boolean> {
  try {
    if (!signature.startsWith('ed25519:') || !publicKey.startsWith('ed25519:')) return false
    const pub = base58Decode(publicKey.slice('ed25519:'.length))
    const sig = base58Decode(signature.slice('ed25519:'.length))
    if (pub.length !== 32 || sig.length !== 64) return false
    const key = await crypto.subtle.importKey('raw', pub as BufferSource, { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify('Ed25519', key, sig as BufferSource, (await nep413SigningHash(message, await sha256(message), recipient)) as BufferSource)
  } catch {
    return false
  }
}
export const verifyListingSignature = (l: Listing, signature: string, publicKey: string): Promise<boolean> => verifyMessageWithVoucher(serializeListing(l), l.circle, signature, publicKey)

/** Public key fingerprint for eyeball comparison: first 8 bytes of sha256 of the key, grouped hex. */
export async function keyFingerprint(publicKey: string): Promise<string> {
  const digest = await sha256(publicKey)
  return toHex(digest.slice(0, 8)).replace(/(.{4})/g, '$1 ').trim()
}
