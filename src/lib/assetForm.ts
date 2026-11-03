import { type AssetInput, type AssetKind } from '@x207/core'
import { toAtomic } from './amount'

// FE-023: bidang formulir listing per jenis aset on-chain (batch 1, katalog 1 sampai 10) dan perubahannya menjadi `AssetInput` untuk `buildAssetTemplate` (SD-061).
// Tidak ada logika pemeriksaan di sini: semua aturan ada di SDK, formulir hanya menerjemahkan teks ke angka.
export type FieldKind = 'text' | 'number' | 'credit' | 'token' | 'datetime' | 'select'
export type Field = { key: string; label: string; kind: FieldKind; optional?: boolean; options?: ReadonlyArray<[string, string]>; hint?: string }

const NFT: Field[] = [
  { key: 'nftContract', label: 'Kontrak NFT', kind: 'text' },
  { key: 'tokenId', label: 'ID token NFT', kind: 'text' },
]
const FT: Field[] = [
  { key: 'ftContract', label: 'Kontrak token', kind: 'text' },
  { key: 'symbol', label: 'Simbol', kind: 'text' },
  { key: 'decimals', label: 'Desimal token', kind: 'number' },
  { key: 'amount', label: 'Jumlah token', kind: 'token', hint: 'Jumlah penuh, mis. 2.5; dikirim sebagai satuan terkecil.' },
]
const MT: Field[] = [
  { key: 'mtContract', label: 'Kontrak multi-token', kind: 'text' },
  { key: 'tokenId', label: 'ID token', kind: 'text', hint: 'Saldo Intents: nep141:… atau nep245:…' },
  { key: 'amount', label: 'Jumlah (satuan terkecil)', kind: 'number' },
]
const TRI: Array<[string, string]> = [['', 'belum diperiksa'], ['yes', 'ya'], ['no', 'tidak']]

export const KIND_FIELDS: Record<AssetKind, { label: string; fields: Field[] }> = {
  nft: { label: '1 · NFT NEP-171', fields: [...NFT, { key: 'name', label: 'Nama', kind: 'text', optional: true }] },
  ticket: {
    label: '2 · Tiket acara (NFT)',
    fields: [...NFT, { key: 'eventName', label: 'Nama acara', kind: 'text' }, { key: 'startsAt', label: 'Acara mulai (UTC)', kind: 'datetime' }, { key: 'endsAt', label: 'Acara selesai (UTC)', kind: 'datetime' }],
  },
  'game-item': { label: '3 · Item game (NFT)', fields: [...NFT, { key: 'gameName', label: 'Nama game', kind: 'text' }, { key: 'collection', label: 'Koleksi', kind: 'text', optional: true }] },
  coupon: { label: '4 · Kupon atau voucher toko (NFT)', fields: [...NFT, { key: 'description', label: 'Isi kupon', kind: 'text' }, { key: 'validUntil', label: 'Berlaku sampai (UTC)', kind: 'datetime' }] },
  license: {
    label: '5 · Lisensi software (NFT)',
    fields: [...NFT, { key: 'product', label: 'Produk', kind: 'text' }, { key: 'termsHash', label: 'Hash syarat lisensi (64 hex)', kind: 'text' }, { key: 'seats', label: 'Jumlah kursi', kind: 'number' }],
  },
  ft: { label: '6 · Token fungible NEP-141', fields: FT },
  rwa: {
    label: '7 · Token RWA',
    fields: [
      ...FT,
      { key: 'wlCircle', label: 'Kontrak lingkaran ada di whitelist token', kind: 'select', options: TRI, optional: true },
      { key: 'wlGrantor', label: 'Pemberi ada di whitelist token', kind: 'select', options: TRI, optional: true },
      { key: 'wlBuyer', label: 'Pembeli ada di whitelist token', kind: 'select', options: TRI, optional: true },
    ],
  },
  lst: {
    label: '8 · Liquid staking token',
    fields: [...FT, { key: 'rateNear', label: 'Nilai tukar ke NEAR (info)', kind: 'text', optional: true }, { key: 'rateSource', label: 'Sumber nilai tukar', kind: 'text', optional: true }],
  },
  'intents-balance': { label: '9 · Saldo NEAR Intents', fields: [...MT, { key: 'label', label: 'Label', kind: 'text', optional: true }] },
  'pool-share': {
    label: '10 · Share pool likuiditas',
    fields: [
      { key: 'pool', label: 'Nama pool', kind: 'text' },
      { key: 'standard', label: 'Standar token share', kind: 'select', options: [['nep245', 'NEP-245 multi-token'], ['nep141', 'NEP-141']] },
      { key: 'mtContract', label: 'Kontrak multi-token (NEP-245)', kind: 'text', optional: true },
      { key: 'tokenId', label: 'ID token share (NEP-245)', kind: 'text', optional: true },
      { key: 'amount', label: 'Jumlah share', kind: 'text', hint: 'NEP-245: satuan terkecil. NEP-141: jumlah penuh, mis. 2.5.' },
      { key: 'ftContract', label: 'Kontrak token (hanya NEP-141)', kind: 'text', optional: true },
      { key: 'symbol', label: 'Simbol (hanya NEP-141)', kind: 'text', optional: true },
      { key: 'decimals', label: 'Desimal (hanya NEP-141)', kind: 'number', optional: true },
      { key: 'valueInfo', label: 'Nilai share (info)', kind: 'text', optional: true },
    ],
  },
}

export const COMMON_FIELDS: Field[] = [
  { key: 'price', label: 'Harga (credit)', kind: 'credit' },
  { key: 'hours', label: 'Penawaran berlaku (jam)', kind: 'number' },
]

/** "2.5" dengan 6 desimal token menjadi "2500000"; null bila bukan angka > 0 atau desimalnya lebih banyak dari desimal token. */
export function tokenToAtomic(input: string, decimals: number): string | null {
  const match = input.trim().match(/^(\d+)(?:\.(\d+))?$/)
  if (!match || !Number.isInteger(decimals) || decimals < 0 || decimals > 38 || (match[2] ?? '').length > decimals) return null
  const atomic = BigInt(match[1] + (match[2] ?? '').padEnd(decimals, '0'))
  return atomic > 0n ? atomic.toString() : null
}

/** Nilai `datetime-local` ("2026-12-01T10:00") dibaca sebagai UTC; 0 bila kosong atau tidak terbaca (SDK menolak 0). */
const seconds = (text: string): number => {
  const ms = Date.parse(/Z$|[+-]\d\d:\d\d$/.test(text) ? text : `${text}:00Z`)
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000)
}

/** Nilai formulir menjadi `AssetInput`, atau teks galat bila ada bidang yang bukan angka atau kosong. `now` dalam detik unix. */
export function toAssetInput(kind: AssetKind, v: Record<string, string>, now: number): AssetInput | string {
  const need = (key: string) => (v[key] ?? '').trim()
  const price = toAtomic(need('price'))
  if (price === null) return 'Harga harus angka credit > 0.'
  if (!/^[1-9]\d{0,3}$/.test(need('hours'))) return 'Jam penawaran harus 1 sampai 9999.'
  const common = { unitPrice: price, expiresAt: now + Number(need('hours')) * 3600 }
  const fungiblePool = kind === 'pool-share' && need('standard') === 'nep141'
  const only = (f: Field) => (kind !== 'pool-share' ? true : fungiblePool ? !['mtContract', 'tokenId'].includes(f.key) : true)
  const mtPool = kind === 'pool-share' && !fungiblePool
  const missing = KIND_FIELDS[kind].fields.filter((f) => f.kind !== 'select' && only(f) && (!f.optional || (fungiblePool && ['ftContract', 'symbol', 'decimals'].includes(f.key)) || (mtPool && ['mtContract', 'tokenId'].includes(f.key))) && need(f.key) === '')
  if (missing.length > 0) return `Isi: ${missing.map((f) => f.label).join(', ')}.`
  const tri = (key: string): boolean | undefined => (need(key) === 'yes' ? true : need(key) === 'no' ? false : undefined)
  const nft = { nftContract: need('nftContract'), tokenId: need('tokenId') }
  // FE-026 (X2): decimals and seats only as decimal integers; Number() would read "0x6" as 6 and "1e1" as 10
  const usesDecimals = ['ft', 'rwa', 'lst'].includes(kind) || fungiblePool
  if (usesDecimals && !/^\d{1,2}$/.test(need('decimals'))) return 'Desimal token harus bilangan bulat 0 sampai 38 (angka desimal biasa).'
  if (kind === 'license' && !/^[1-9]\d{0,8}$/.test(need('seats'))) return 'Jumlah kursi harus bilangan bulat >= 1 (angka desimal biasa).'
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
      return { kind, ...ft(), ...common, ...(need('rateNear') !== '' ? { rate: { nearPerToken: need('rateNear'), source: need('rateSource') || 'tanpa sumber', asOf: now } } : {}) }
    case 'intents-balance':
      return { kind, ...mt(), ...opt('label', 'label'), ...common }
    case 'pool-share':
      return fungiblePool
        ? { kind, pool: need('pool'), ...opt('valueInfo', 'valueInfo'), standard: 'nep141', ...ft(), ...common }
        : { kind, pool: need('pool'), ...opt('valueInfo', 'valueInfo'), standard: 'nep245', ...mt(), ...common }
  }
}
