import { ORDER_CATALOG_NO, ORDER_KINDS, ORDER_PATTERN, PROOF_METHODS, normalizeOrder, serializeOrder, type OrderDocument, type OrderKind } from '@x207/core'
import type { OrderView } from '../api/types'
import { sha256Hex, signMessageWithVoucher } from './barter'
import { toAtomic } from './amount'

// FE-027: pesanan jasa (pipeline P6, ADR-45), dari Spec API Backend 5f. Aturan dokumen ada di SDK (SD-069: `normalizeOrder`); di sini hanya mengubah isian formulir menjadi
// dokumen, menghitung hash dengan sha256 browser atas JSON kanonik SDK, dan menandatangani notice.
export const KIND_LABEL: Record<OrderKind, string> = {
  prompt: '39 · Prompt atau workflow', research: '40 · Riset', translation: '41 · Terjemahan', annotation: '42 · Anotasi data', scraping: '43 · Pengumpulan data web',
  audit: '52 · Audit kode', loadtest: '53 · Uji beban', freelance: '83 · Freelance', bug: '88 · Uji produk (per bug)', lead: '51 · Referral dan lead (per konversi)',
  keeper: '46 · Jasa keeper (per tx)', solver: '48 · Jasa solver (per tx)', delegate: '16 · Jasa delegate (per suara)',
}
/** Jenis yang bisa dibuat dari formulir ini. `delegate` butuh dokumen mandat dan klaim transaksi (SD-072, BE-055) yang belum ada di halaman, jadi hanya tampil bila sudah ada. */
export const CREATABLE_KINDS = ORDER_KINDS.filter((k) => k !== 'delegate')
export const KIND_NOTE: Partial<Record<OrderKind, string>> = {
  scraping: 'Pengumpulan data dari situs web bisa melanggar ketentuan layanan (ToS) situs itu. Penjual bertanggung jawab atas caranya; x207 tidak memeriksanya.',
  loadtest: 'Uji beban hanya untuk situs yang Anda kuasai. Backend meminta bukti: berkas /.well-known/x207-loadtest atau DNS TXT berisi hash pesanan, sebelum pesanan diterima.',
  prompt: 'Hasil yang mudah disalin wajib punya contoh: hash contoh dikunci di pesanan sehingga tidak bisa disalin lalu disengketakan.',
}
export { ORDER_KINDS, ORDER_CATALOG_NO, ORDER_PATTERN, PROOF_METHODS }

export type MilestoneInput = { amount: string; due: string }
export type OrderForm = {
  kind: OrderKind | ''; seller: string; spec: string; sample: string; target: string; proofMethod: string; proofAmount: string; milestones: MilestoneInput[]
}
export const EMPTY_ORDER: OrderForm = { kind: '', seller: '', spec: '', sample: '', target: '', proofMethod: '', proofAmount: '', milestones: [{ amount: '', due: '' }] }

const seconds = (text: string): number => {
  const ms = Date.parse(/Z$|[+-]\d\d:\d\d$/.test(text) ? text : `${text}:00Z`)
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000)
}

/** Dokumen dari isian formulir, atau teks galat. Hash contoh dan spesifikasi dihitung di browser dari teks yang diketik. */
export async function toOrderDocument(f: OrderForm, circle: string, buyer: string, nonce: string): Promise<OrderDocument | string> {
  if (f.kind === '') return 'Pilih jenis jasa.'
  const milestones = []
  for (const [k, m] of f.milestones.entries()) {
    const amount = toAtomic(m.amount)
    if (amount === null) return `Tonggak ${k + 1}: jumlah harus angka credit > 0.`
    const due = seconds(m.due)
    if (due === 0) return `Tonggak ${k + 1}: isi tenggat (UTC).`
    milestones.push({ amount, due_at: due })
  }
  if (f.spec.trim() === '') return 'Isi spesifikasi kerja.'
  const proofAmount = toAtomic(f.proofAmount)
  const doc: OrderDocument = {
    circle, kind: f.kind, buyer, seller: f.seller.trim(), spec_hash: await sha256Hex(f.spec.trim()), milestones, nonce,
    sample_hash: f.sample.trim() === '' ? null : await sha256Hex(f.sample.trim()),
    target: f.target.trim() === '' ? null : f.target.trim().toLowerCase(),
    proof: ORDER_PATTERN[f.kind] === 'proof' ? { method: f.proofMethod, amount_per_tx: proofAmount ?? '' } : null,
  }
  try {
    normalizeOrder(doc)
    return doc
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

export const orderHashOf = (doc: OrderDocument): Promise<string> => sha256Hex(serializeOrder(doc))

/** Dokumen pesanan dari jawaban API (bentuk yang dihash SDK): tonggak diambil dari daftar tonggak jawaban itu. */
export function orderDocFromView(view: OrderView): OrderDocument {
  const o = view.order
  return {
    circle: o.circle, kind: o.kind as OrderKind, buyer: o.buyer, seller: o.seller, spec_hash: o.specHash, sample_hash: o.sampleHash, target: o.target,
    proof: o.proof === null ? null : { method: o.proof.method, amount_per_tx: o.proof.amountPerTx }, nonce: o.nonce,
    milestones: view.milestones.map((m) => ({ amount: m.amount, due_at: m.dueAt })),
  }
}

/**
 * Batch 3 F3 (review BE-063): sebelum menandatangani notice untuk sebuah pesanan, hash dihitung ulang dari dokumen yang DITAMPILKAN dan harus sama dengan hash yang dibuka pengguna dan
 * yang disebut jawaban API. API yang jahat tidak bisa memperlihatkan pesanan yang dikenal sambil membawa hash pesanan lain.
 */
export async function assertOrderHash(view: OrderView, opened: string): Promise<void> {
  let computed: string
  try {
    computed = await orderHashOf(orderDocFromView(view))
  } catch (e) {
    throw new Error(`Dokumen pesanan dari server tidak sah: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (computed !== opened || view.orderHash !== opened) throw new Error('Hash pesanan yang dihitung dari dokumen yang ditampilkan tidak sama dengan hash yang dibuka: notice tidak ditandatangani.')
}

/** Isi `POST orders`: dokumen dan tanda tangan pihak ini atas JSON kanonik; tanda tangan pihak lawan bisa ditempel (akun dan tanda tangan). */
export async function buildCreateOrder(doc: OrderDocument, account: string, secretKey: string, counterparty?: { account: string; signature: string }) {
  const signatures = [{ account, signature: await signMessageWithVoucher(serializeOrder(doc), doc.circle, secretKey) }, ...(counterparty ? [counterparty] : [])]
  return { order: normalizeOrder(doc), signatures }
}

export type MilestoneAction = 'delivered' | 'confirmed' | 'disputed' | 'cancelled'
export type OutcomeAction = 'proposed' | 'accepted' | 'rejected'
/** Notice tonggak: JSON kanonik seperti 5c dengan `order_hash` dan `milestone`; urutan kunci tetap. Kunci yang dipakai perlu dicocokkan dengan BE-054. */
export const milestoneNotice = (circle: string, orderHash: string, milestone: number, actor: string, action: MilestoneAction | OutcomeAction, at: number, deliverableHash: string | null = null, reason: string | null = null) =>
  ({ circle, order_hash: orderHash, milestone, actor, action, at, deliverable_hash: deliverableHash, reason })
export async function signNotice(notice: ReturnType<typeof milestoneNotice>, secretKey: string): Promise<string> {
  return signMessageWithVoucher(JSON.stringify(notice), notice.circle, secretKey)
}

/** Tanda "manusia" di listing: `human: true` di `detail` JSON listing (BE-050 tidak memeriksa kunci lain). */
export function withHumanMark(detail: string, human: boolean): string {
  let base: Record<string, unknown> = {}
  const text = detail.trim()
  if (text !== '') {
    try {
      const parsed: unknown = JSON.parse(text)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) base = parsed as Record<string, unknown>
      else base = { note: text }
    } catch {
      base = { note: text }
    }
  }
  if (human) base.human = true
  else delete base.human
  return Object.keys(base).length === 0 ? '' : JSON.stringify(base)
}
export function isHumanListing(detail: string): boolean {
  try {
    const parsed: unknown = JSON.parse(detail)
    return typeof parsed === 'object' && parsed !== null && (parsed as { human?: unknown }).human === true
  } catch {
    return false
  }
}
