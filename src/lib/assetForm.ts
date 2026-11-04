import { type AssetInput, type AssetKind } from '@x207/core'
import { toAtomic } from './amount'

// FE-023: listing form fields per on-chain asset kind (batch 1, catalog 1 to 10) and their conversion into `AssetInput` for `buildAssetTemplate` (SD-061).
// No validation logic here: all rules live in the SDK, the form only translates text into numbers.
export type FieldKind = 'text' | 'number' | 'credit' | 'token' | 'datetime' | 'select'
export type Field = { key: string; label: string; kind: FieldKind; optional?: boolean; options?: ReadonlyArray<[string, string]>; hint?: string }

const NFT: Field[] = [
  { key: 'nftContract', label: 'NFT contract', kind: 'text' },
  { key: 'tokenId', label: 'NFT token ID', kind: 'text' },
]
const FT: Field[] = [
  { key: 'ftContract', label: 'Token contract', kind: 'text' },
  { key: 'symbol', label: 'Symbol', kind: 'text' },
  { key: 'decimals', label: 'Token decimals', kind: 'number' },
  { key: 'amount', label: 'Token amount', kind: 'token', hint: 'Full amount, e.g. 2.5; sent in the smallest unit.' },
]
const MT: Field[] = [
  { key: 'mtContract', label: 'Multi-token contract', kind: 'text' },
  { key: 'tokenId', label: 'Token ID', kind: 'text', hint: 'Intents balance: nep141:… or nep245:…' },
  { key: 'amount', label: 'Amount (smallest unit)', kind: 'number' },
]
const TRI: Array<[string, string]> = [['', 'not checked'], ['yes', 'yes'], ['no', 'no']]

export const KIND_FIELDS: Record<AssetKind, { label: string; fields: Field[] }> = {
  nft: { label: '1 · NFT NEP-171', fields: [...NFT, { key: 'name', label: 'Name', kind: 'text', optional: true }] },
  ticket: {
    label: '2 · Event ticket (NFT)',
    fields: [...NFT, { key: 'eventName', label: 'Event name', kind: 'text' }, { key: 'startsAt', label: 'Event starts (UTC)', kind: 'datetime' }, { key: 'endsAt', label: 'Event ends (UTC)', kind: 'datetime' }],
  },
  'game-item': { label: '3 · Game item (NFT)', fields: [...NFT, { key: 'gameName', label: 'Game name', kind: 'text' }, { key: 'collection', label: 'Collection', kind: 'text', optional: true }] },
  coupon: { label: '4 · Store coupon or voucher (NFT)', fields: [...NFT, { key: 'description', label: 'Coupon content', kind: 'text' }, { key: 'validUntil', label: 'Valid until (UTC)', kind: 'datetime' }] },
  license: {
    label: '5 · Software license (NFT)',
    fields: [...NFT, { key: 'product', label: 'Product', kind: 'text' }, { key: 'termsHash', label: 'License terms hash (64 hex)', kind: 'text' }, { key: 'seats', label: 'Number of seats', kind: 'number' }],
  },
  ft: { label: '6 · Fungible token NEP-141', fields: FT },
  rwa: {
    label: '7 · RWA token',
    fields: [
      ...FT,
      { key: 'wlCircle', label: 'Circle contract is on the token whitelist', kind: 'select', options: TRI, optional: true },
      { key: 'wlGrantor', label: 'Grantor is on the token whitelist', kind: 'select', options: TRI, optional: true },
      { key: 'wlBuyer', label: 'Buyer is on the token whitelist', kind: 'select', options: TRI, optional: true },
    ],
  },
  lst: {
    label: '8 · Liquid staking token',
    fields: [...FT, { key: 'rateNear', label: 'Exchange rate to NEAR (info)', kind: 'text', optional: true }, { key: 'rateSource', label: 'Exchange rate source', kind: 'text', optional: true }],
  },
  'intents-balance': { label: '9 · NEAR Intents balance', fields: [...MT, { key: 'label', label: 'Label', kind: 'text', optional: true }] },
  'pool-share': {
    label: '10 · Liquidity pool share',
    fields: [
      { key: 'pool', label: 'Pool name', kind: 'text' },
      { key: 'standard', label: 'Share token standard', kind: 'select', options: [['nep245', 'NEP-245 multi-token'], ['nep141', 'NEP-141']] },
      { key: 'mtContract', label: 'Multi-token contract (NEP-245)', kind: 'text', optional: true },
      { key: 'tokenId', label: 'Share token ID (NEP-245)', kind: 'text', optional: true },
      { key: 'amount', label: 'Share amount', kind: 'text', hint: 'NEP-245: smallest unit. NEP-141: full amount, e.g. 2.5.' },
      { key: 'ftContract', label: 'Token contract (NEP-141 only)', kind: 'text', optional: true },
      { key: 'symbol', label: 'Symbol (NEP-141 only)', kind: 'text', optional: true },
      { key: 'decimals', label: 'Decimals (NEP-141 only)', kind: 'number', optional: true },
      { key: 'valueInfo', label: 'Share value (info)', kind: 'text', optional: true },
    ],
  },
}

export const COMMON_FIELDS: Field[] = [
  { key: 'price', label: 'Price (credit)', kind: 'credit' },
  { key: 'hours', label: 'Offer valid for (hours)', kind: 'number' },
]

/** "2.5" with 6 token decimals becomes "2500000"; null if it is not a number > 0 or has more decimals than the token. */
export function tokenToAtomic(input: string, decimals: number): string | null {
  const match = input.trim().match(/^(\d+)(?:\.(\d+))?$/)
  if (!match || !Number.isInteger(decimals) || decimals < 0 || decimals > 38 || (match[2] ?? '').length > decimals) return null
  const atomic = BigInt(match[1] + (match[2] ?? '').padEnd(decimals, '0'))
  return atomic > 0n ? atomic.toString() : null
}

/** A `datetime-local` value ("2026-12-01T10:00") is read as UTC; 0 if empty or unreadable (the SDK rejects 0). */
const seconds = (text: string): number => {
  const ms = Date.parse(/Z$|[+-]\d\d:\d\d$/.test(text) ? text : `${text}:00Z`)
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000)
}

/** Form values become `AssetInput`, or an error text if a field is not a number or is empty. `now` in unix seconds. */
export function toAssetInput(kind: AssetKind, v: Record<string, string>, now: number): AssetInput | string {
  const need = (key: string) => (v[key] ?? '').trim()
  const price = toAtomic(need('price'))
  if (price === null) return 'Price must be a credit number > 0.'
  if (!/^[1-9]\d{0,3}$/.test(need('hours'))) return 'Offer hours must be 1 to 9999.'
  const common = { unitPrice: price, expiresAt: now + Number(need('hours')) * 3600 }
  const fungiblePool = kind === 'pool-share' && need('standard') === 'nep141'
  const only = (f: Field) => (kind !== 'pool-share' ? true : fungiblePool ? !['mtContract', 'tokenId'].includes(f.key) : true)
  const mtPool = kind === 'pool-share' && !fungiblePool
  const missing = KIND_FIELDS[kind].fields.filter((f) => f.kind !== 'select' && only(f) && (!f.optional || (fungiblePool && ['ftContract', 'symbol', 'decimals'].includes(f.key)) || (mtPool && ['mtContract', 'tokenId'].includes(f.key))) && need(f.key) === '')
  if (missing.length > 0) return `Fill in: ${missing.map((f) => f.label).join(', ')}.`
  const tri = (key: string): boolean | undefined => (need(key) === 'yes' ? true : need(key) === 'no' ? false : undefined)
  const nft = { nftContract: need('nftContract'), tokenId: need('tokenId') }
  // FE-026 (X2): decimals and seats only as decimal integers; Number() would read "0x6" as 6 and "1e1" as 10
  const usesDecimals = ['ft', 'rwa', 'lst'].includes(kind) || fungiblePool
  if (usesDecimals && !/^\d{1,2}$/.test(need('decimals'))) return 'Token decimals must be an integer from 0 to 38 (plain decimal digits).'
  if (kind === 'license' && !/^[1-9]\d{0,8}$/.test(need('seats'))) return 'Number of seats must be an integer >= 1 (plain decimal digits).'
  const decimals = usesDecimals ? Number(need('decimals')) : 0
  const ftAmount = (): string => tokenToAtomic(need('amount'), decimals) ?? ''
  const ft = () => ({ ftContract: need('ftContract'), symbol: need('symbol'), decimals, amount: ftAmount() })
  const mt = () => ({ mtContract: need('mtContract'), tokenId: need('tokenId'), amount: need('amount') })
  const opt = <T extends string>(key: string, name: T): { [K in T]?: string } => (need(key) === '' ? {} : ({ [name]: need(key) } as { [K in T]?: string }))
  switch (kind) {
    case 'nft':
      return { kind, ...nft, ...opt('name', 'name'), ...common }
    case 'ticket':
      return { kind, ...nft, event: { name: need('eventName'), startsAt: seconds(need('startsAt')), endsAt: seconds(need('endsAt')) }, ...common }
    case 'game-item':
      return { kind, ...nft, game: { name: need('gameName'), ...opt('collection', 'collection') }, ...common }
    case 'coupon':
      return { kind, ...nft, description: need('description'), validUntil: seconds(need('validUntil')), ...common }
    case 'license':
      return { kind, ...nft, product: need('product'), termsHash: need('termsHash'), seats: Number(need('seats')), ...common }
    case 'ft':
      return { kind, ...ft(), ...common }
    case 'rwa': {
      const wl = [tri('wlCircle'), tri('wlGrantor')]
      const checked = wl[0] !== undefined || wl[1] !== undefined
      return {
        kind, ...ft(), ...common,
        ...(checked ? { whitelist: { circleContract: wl[0] ?? false, grantor: wl[1] ?? false, ...(tri('wlBuyer') !== undefined ? { buyer: tri('wlBuyer')! } : {}) } } : {}),
      }
    }
    case 'lst':
      return { kind, ...ft(), ...common, ...(need('rateNear') !== '' ? { rate: { nearPerToken: need('rateNear'), source: need('rateSource') || 'no source', asOf: now } } : {}) }
    case 'intents-balance':
      return { kind, ...mt(), ...opt('label', 'label'), ...common }
    case 'pool-share':
      return fungiblePool
        ? { kind, pool: need('pool'), ...opt('valueInfo', 'valueInfo'), standard: 'nep141', ...ft(), ...common }
        : { kind, pool: need('pool'), ...opt('valueInfo', 'valueInfo'), standard: 'nep245', ...mt(), ...common }
  }
}
