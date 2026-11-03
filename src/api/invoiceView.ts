import type { InstallmentStatus, InvoiceStatus, InvoiceView } from './types'

// Jawaban invoice dari backend (BE-051) dinormalkan ke satu bentuk. Spec 5e menulis `invoice_hash` dan `needs_bond`; read API lain memakai camelCase. Keduanya diterima,
// jadi frontend tidak patah bila A2 memilih salah satu. Nilai yang tidak dikenal ditolak dengan galat, bukan ditebak.
type Raw = Record<string, unknown>
const pick = (raw: Raw, snake: string, camel: string): unknown => raw[camel] ?? raw[snake]
const STATUSES: readonly InvoiceStatus[] = ['requested', 'approved', 'registered', 'rejected', 'expired', 'missed']
const INSTALLMENT_STATUSES: readonly InstallmentStatus[] = ['scheduled', 'registered', 'shifted', 'missed']

export function toInvoiceView(input: unknown): InvoiceView {
  const raw = (input ?? {}) as Raw
  const document = (raw.document ?? {}) as Raw
  const hash = pick(raw, 'invoice_hash', 'invoiceHash')
  const status = raw.status as InvoiceStatus
  if (typeof hash !== 'string' || !STATUSES.includes(status)) throw new Error('Jawaban invoice tidak dikenal: invoice_hash atau status tidak sah')
  const installments = Array.isArray(raw.installments) ? (raw.installments as Raw[]) : []
  return {
    invoiceHash: hash,
    document: { id: String(document.id), issuer: String(document.issuer), debtor: String(document.debtor), amount: String(document.amount), memo: String(document.memo ?? '') },
    status,
    needsBond: Boolean(pick(raw, 'needs_bond', 'needsBond')),
    installments: installments.map((i) => {
      const s = i.status as InstallmentStatus
      if (!INSTALLMENT_STATUSES.includes(s)) throw new Error(`Status cicilan tidak dikenal: ${String(i.status)}`)
      const reason = i.reason
      return { index: Number(i.index), epoch: Number(i.epoch), amount: String(i.amount), status: s, reason: reason === 'headroom' || reason === 'blocked_by_debtor' ? reason : null }
    }),
  }
}
