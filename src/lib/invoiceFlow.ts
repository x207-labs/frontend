import { catchUpVoucher, installmentVoucher, planInstallments, serializeInvoice, type InvoiceDocument, type InvoicePairState } from '@x207/core'
import type { InvoiceView } from '../api/types'
import { sha256Hex, signMessageWithVoucher, signVoucherInBrowser } from './barter'
import { toAtomic } from './amount'

// FE-025: invoice flow in the browser, from Backend API Spec 5e. Format rules live in the SDK (SD-065: document, hash, installment plan, voucher); here only signing and
// checks before the debtor signs. The hash is computed with the browser's sha256 over the SDK canonical JSON (the SDK `invoiceHash` uses node:crypto).
export const invoiceHashOf = (doc: InvoiceDocument): Promise<string> => sha256Hex(serializeInvoice(doc))

export type InvoiceAction = 'requested' | 'rejected'
/** Invoice notice: canonical JSON like 5c with `invoice_hash` in place of `listing_hash`; fixed key order. The keys used here must be checked against BE-051. */
export const invoiceNotice = (circle: string, invoiceHash: string, actor: string, action: InvoiceAction, at: number, reason: string | null = null) =>
  ({ circle, invoice_hash: invoiceHash, actor, action, at, reason })
const noticeText = (n: ReturnType<typeof invoiceNotice>): string => JSON.stringify(n)

export type CreateInput = { circle: string; issuer: string; debtor: string; id: string; amount: string; memo: string; installments: string; secretKey: string; now: number }

/** Body of `POST invoices`: document, number of installments, `requested` notice and issuer signature; or an error text from the SDK rules. */
export async function buildCreateInvoice(i: CreateInput): Promise<{ body: { document: InvoiceDocument; installments: number; notice: ReturnType<typeof invoiceNotice>; signature: string }; invoiceHash: string } | string> {
  const amount = toAtomic(i.amount)
  if (amount === null) return 'Amount must be a credit number > 0 (at most 6 decimals).'
  if (!/^(?:[1-9]|1\d|2[0-4])$/.test(i.installments.trim())) return 'Number of installments must be a whole number from 1 to 24.'
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
 * Installment vouchers the debtor signs on approval: one per installment, seq 1 in its epoch. Before signing, the document is checked against the hash and the schedule from the server
 * is recomputed with the SDK plan (consecutive epochs, equal amounts): the debtor signs nothing that does not match (CT-076).
 */
/** Batch 3 F3 (review BE-063): the hash is recomputed from the displayed document and must equal the hash the user opened and the one the API response names. */
export async function assertInvoiceHash(view: InvoiceView, opened: string): Promise<void> {
  if (view.invoiceHash !== opened || (await invoiceHashOf(view.document)) !== opened) throw new Error('The invoice hash computed from the displayed document does not match the opened hash: not signed.')
}

export async function buildApproval(circle: string, view: InvoiceView, secretKey: string, opened: string = view.invoiceHash): Promise<Array<{ voucher: object; signature: string }> | string> {
  const doc = view.document
  try {
    if (view.invoiceHash !== opened) return 'The invoice hash from the server is not the one you opened: do not approve.'
    if ((await invoiceHashOf(doc)) !== view.invoiceHash) return 'The invoice hash does not match its document: do not approve.'
    const first = view.installments[0]
    if (!first) return 'The invoice has no installment schedule.'
    const plan = planInstallments({ circle, doc, firstEpoch: first.epoch, count: view.installments.length })
    const same = plan.installments.every((p, k) => view.installments[k]?.epoch === p.epoch && view.installments[k]?.amount === p.amount && view.installments[k]?.index === p.index)
    if (!same) return 'The installment schedule from the server does not match the plan computed from the document: do not approve.'
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

/** Follow-up voucher after a failed installment, on top of the pair state in the target epoch (from the contract). Once per installment; called only after a failure, never ahead of time. */
export async function buildCatchUp(circle: string, view: InvoiceView, index: number, state: InvoicePairState, alreadyShifted: boolean, secretKey: string): Promise<{ voucher: object; signature: string } | string> {
  try {
    const first = view.installments[0]
    if (!first) return 'The invoice has no installment schedule.'
    const plan = planInstallments({ circle, doc: view.document, firstEpoch: first.epoch, count: view.installments.length })
    const voucher = catchUpVoucher(plan, index, state, alreadyShifted)
    return { voucher, signature: await signVoucherInBrowser(voucher, secretKey) }
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
