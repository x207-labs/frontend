import { catchUpVoucher, installmentVoucher, planInstallments, serializeInvoice, type InvoiceDocument, type InvoicePairState } from '@x207/core'
import type { InvoiceView } from '../api/types'
import { sha256Hex, signMessageWithVoucher, signVoucherInBrowser } from './barter'
import { toAtomic } from './amount'

// FE-025: alur invoice di browser, dari Spec API Backend 5e. Aturan format ada di SDK (SD-065: dokumen, hash, rencana cicilan, voucher); di sini hanya penandatanganan dan
// pemeriksaan sebelum debtor menandatangani. Hash dihitung dengan sha256 browser atas JSON kanonik SDK (`invoiceHash` SDK memakai node:crypto).
export const invoiceHashOf = (doc: InvoiceDocument): Promise<string> => sha256Hex(serializeInvoice(doc))

export type InvoiceAction = 'requested' | 'rejected'
/** Notice invoice: JSON kanonik seperti 5c dengan `invoice_hash` di tempat `listing_hash`; urutan kunci tetap. Kunci yang dipakai di sini perlu dicocokkan dengan BE-051. */
export const invoiceNotice = (circle: string, invoiceHash: string, actor: string, action: InvoiceAction, at: number, reason: string | null = null) =>
  ({ circle, invoice_hash: invoiceHash, actor, action, at, reason })
const noticeText = (n: ReturnType<typeof invoiceNotice>): string => JSON.stringify(n)

export type CreateInput = { circle: string; issuer: string; debtor: string; id: string; amount: string; memo: string; installments: string; secretKey: string; now: number }

/** Isi `POST invoices`: dokumen, jumlah cicilan, notice `requested` dan tanda tangan issuer; atau teks galat dari aturan SDK. */
export async function buildCreateInvoice(i: CreateInput): Promise<{ body: { document: InvoiceDocument; installments: number; notice: ReturnType<typeof invoiceNotice>; signature: string }; invoiceHash: string } | string> {
  const amount = toAtomic(i.amount)
  if (amount === null) return 'Jumlah harus angka credit > 0 (paling banyak 6 desimal).'
  if (!/^(?:[1-9]|1\d|2[0-4])$/.test(i.installments.trim())) return 'Jumlah cicilan harus bilangan bulat 1 sampai 24.'
  const document: InvoiceDocument = { id: i.id.trim(), issuer: i.issuer, debtor: i.debtor.trim(), amount, memo: i.memo.trim() }
  try {
    const invoiceHash = await invoiceHashOf(document) // also runs the checks of the SDK on the document
    planInstallments({ circle: i.circle, doc: document, firstEpoch: 1, count: Number(i.installments) })
    const notice = invoiceNotice(i.circle, invoiceHash, i.issuer, 'requested', i.now)
    return { body: { document, installments: Number(i.installments), notice, signature: await signMessageWithVoucher(noticeText(notice), i.circle, i.secretKey) }, invoiceHash }
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/**
 * Voucher cicilan yang ditandatangani debtor saat menyetujui: satu per cicilan, seq 1 di epochnya. Sebelum menandatangani, dokumen diperiksa terhadap hash dan jadwal dari server
 * dihitung ulang dengan rencana SDK (epoch berurutan, jumlah sama): debtor tidak menandatangani apa pun yang tidak cocok (CT-076).
 */
/** Batch 3 F3 (review BE-063): hash dihitung ulang dari dokumen yang ditampilkan dan harus sama dengan hash yang dibuka pengguna dan yang disebut jawaban API. */
export async function assertInvoiceHash(view: InvoiceView, opened: string): Promise<void> {
  if (view.invoiceHash !== opened || (await invoiceHashOf(view.document)) !== opened) throw new Error('Hash invoice yang dihitung dari dokumen yang ditampilkan tidak sama dengan hash yang dibuka: tidak ditandatangani.')
}

export async function buildApproval(circle: string, view: InvoiceView, secretKey: string, opened: string = view.invoiceHash): Promise<Array<{ voucher: object; signature: string }> | string> {
  const doc = view.document
  try {
    if (view.invoiceHash !== opened) return 'Hash invoice dari server bukan yang Anda buka: jangan setujui.'
    if ((await invoiceHashOf(doc)) !== view.invoiceHash) return 'Hash invoice tidak cocok dengan dokumennya: jangan setujui.'
    const first = view.installments[0]
    if (!first) return 'Invoice tidak punya jadwal cicilan.'
    const plan = planInstallments({ circle, doc, firstEpoch: first.epoch, count: view.installments.length })
    const same = plan.installments.every((p, k) => view.installments[k]?.epoch === p.epoch && view.installments[k]?.amount === p.amount && view.installments[k]?.index === p.index)
    if (!same) return 'Jadwal cicilan dari server tidak sama dengan rencana yang dihitung dari dokumen: jangan setujui.'
    return await Promise.all(plan.installments.map(async (p) => {
      const voucher = installmentVoucher(plan, p.index)
      return { voucher, signature: await signVoucherInBrowser(voucher, secretKey) }
    }))
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

export async function buildRejection(circle: string, view: InvoiceView, actor: string, reason: string, now: number, secretKey: string): Promise<{ notice: object; signature: string }> {
  const notice = invoiceNotice(circle, view.invoiceHash, actor, 'rejected', now, reason.trim() === '' ? null : reason.trim())
  return { notice, signature: await signMessageWithVoucher(noticeText(notice), circle, secretKey) }
}

/** Voucher susulan setelah cicilan gagal, di atas keadaan pasangan di epoch tujuan (dari kontrak). Sekali per cicilan; dipanggil hanya setelah gagal, tidak pernah di depan. */
export async function buildCatchUp(circle: string, view: InvoiceView, index: number, state: InvoicePairState, alreadyShifted: boolean, secretKey: string): Promise<{ voucher: object; signature: string } | string> {
  try {
    const first = view.installments[0]
    if (!first) return 'Invoice tidak punya jadwal cicilan.'
    const plan = planInstallments({ circle, doc: view.document, firstEpoch: first.epoch, count: view.installments.length })
    const voucher = catchUpVoucher(plan, index, state, alreadyShifted)
    return { voucher, signature: await signVoucherInBrowser(voucher, secretKey) }
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
