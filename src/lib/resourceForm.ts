import { DEFAULT_MAX_QUANTITY, METERED_KINDS, METERED_PRESETS, endpointProblem, estimateMeteredAmount, resourceListingDetail, type MeteredKind, type MeteredUnit } from '@x207/core'
import { toAtomic } from './amount'

// FE-024: formulir listing sumber daya terukur (pipeline P5, kelas D, dua belas jenis). Tidak ada aturan sendiri: jenis, satuan, batas, peringatan, pemeriksaan endpoint, dan bentuk
// `detail` datang dari SDK (`METERED_PRESETS`, `resourceListingDetail`); formulir hanya mengubah teks menjadi harga satuan dan menghitung perkiraan biaya.
export const KIND_LABEL: Record<MeteredKind, string> = {
  cpu: '31 · Idle CPU',
  gpu: '32 · GPU per hour',
  storage: '33 · Storage',
  cdn: '34 · Cache and CDN',
  inference: '35 · Own-model inference',
  'fine-tuning': '36 · Fine-tuning',
  'data-feed': '44 · Data feed or oracle',
  'iot-sensor': '45 · IoT sensor data',
  'gas-relayer': '47 · Gas relayer',
  'priority-slot': '49 · Priority queue slot',
  'proxy-bandwidth': '55 · Proxy and bandwidth',
  'home-device': '90 · Home device',
}
export const UNIT_LABEL: Record<MeteredUnit, string> = { call: 'per call', minute: 'per minute', day: 'per day', GB: 'per GB', job: 'per job', request: 'per request' }

export { METERED_KINDS, METERED_PRESETS }

export type ResourceValues = { kind: MeteredKind | ''; unit: string; unitPrice: string; endpoint: string; quantity: string }
export const EMPTY_RESOURCE: ResourceValues = { kind: '', unit: '', unitPrice: '', endpoint: '', quantity: '1' }

export type ResourceTemplate = {
  assetType: string
  assetClass: 'D'
  unit: MeteredUnit
  /** Harga satu satuan, satuan credit terkecil. */
  unitPriceAtomic: string
  maxQuantity: number
  detail: string
  warnings: string[]
  /** Perkiraan biaya untuk `quantity` satuan, satuan credit terkecil; `null` bila jumlahnya belum sah. */
  estimateAtomic: string | null
}

/** Nilai formulir menjadi template listing, atau teks galat. Satuan bawaan: satuan pertama preset jenisnya. */
export function toResourceTemplate(v: ResourceValues): ResourceTemplate | string {
  if (v.kind === '') return 'Choose a resource type.'
  const preset = METERED_PRESETS[v.kind]
  const unit = (v.unit === '' ? preset.units[0] : v.unit) as MeteredUnit
  if (!preset.units.includes(unit)) return `Unit ${unit} does not fit this type; choose ${preset.units.join(' or ')}.`
  const unitPriceAtomic = toAtomic(v.unitPrice)
  if (unitPriceAtomic === null) return 'Price per unit must be a credit number > 0 (at most 6 decimals).'
  const problem = endpointProblem(v.endpoint.trim())
  if (problem !== null) return problem
  return {
    assetType: preset.assetType,
    assetClass: 'D',
    unit,
    unitPriceAtomic,
    maxQuantity: DEFAULT_MAX_QUANTITY[unit],
    detail: resourceListingDetail({ kind: v.kind, unit, unitPriceAtomic, endpoint: v.endpoint.trim() }),
    warnings: [...preset.warnings],
    estimateAtomic: estimateMeteredAmount(unitPriceAtomic, v.quantity),
  }
}
