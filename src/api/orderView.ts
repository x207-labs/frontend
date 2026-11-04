import type { MilestoneStatus, OrderMandateView, OrderView } from './types'

// The order response from the backend (BE-054) is normalized to a single shape: `order_hash`, `needs_bond`, `target_verified`, `deliverable_hash` as in spec 5f, or camelCase.
// Unknown statuses are rejected with an error, not guessed.
type Raw = Record<string, unknown>
const pick = (raw: Raw, snake: string, camel: string): unknown => raw[camel] ?? raw[snake]
const MILESTONE_STATUSES: readonly MilestoneStatus[] = ['open', 'delivered', 'confirmed', 'disputed', 'paid', 'cancelled']
const orNull = <T,>(v: T | undefined | null): T | null => v ?? null

function toMandate(input: unknown): OrderMandateView | null {
  if (input === undefined || input === null) return null
  const m = input as Raw
  if (!Array.isArray(m.kinds)) throw new Error('Mandate from the server is invalid: kinds is not a list')
  return { circle: String(m.circle), dao: String(m.dao), kinds: m.kinds.map(String), rulesHash: String(pick(m, 'rules_hash', 'rulesHash')) }
}

export function toOrderView(input: unknown): OrderView {
  const raw = (input ?? {}) as Raw
  const order = (raw.order ?? {}) as Raw
  const hash = pick(raw, 'order_hash', 'orderHash')
  if (typeof hash !== 'string' || typeof raw.status !== 'string') throw new Error('Unrecognized order response: order_hash or status is invalid')
  const proof = (order.proof ?? null) as Raw | null
  const milestones = Array.isArray(raw.milestones) ? (raw.milestones as Raw[]) : []
  const verified = pick(raw, 'target_verified', 'targetVerified')
  return {
    orderHash: hash,
    order: {
      circle: String(order.circle), kind: String(order.kind), buyer: String(order.buyer), seller: String(order.seller), specHash: String(pick(order, 'spec_hash', 'specHash')),
      sampleHash: orNull(pick(order, 'sample_hash', 'sampleHash') as string | null | undefined), target: orNull(order.target as string | null | undefined),
      proof: proof === null ? null : { method: String(proof.method), amountPerTx: String(pick(proof, 'amount_per_tx', 'amountPerTx')) }, nonce: String(order.nonce),
      mandateHash: orNull(pick(order, 'mandate_hash', 'mandateHash') as string | null | undefined),
    },
    mandate: toMandate(raw.mandate),
    status: raw.status,
    needsBond: Boolean(pick(raw, 'needs_bond', 'needsBond')),
    targetVerified: typeof verified === 'boolean' ? verified : null,
    signedBy: Array.isArray(pick(raw, 'signed_by', 'signedBy')) ? (pick(raw, 'signed_by', 'signedBy') as unknown[]).map(String) : [],
    milestones: milestones.map((m, k) => {
      const status = m.status as MilestoneStatus
      if (!MILESTONE_STATUSES.includes(status)) throw new Error(`Unknown milestone status: ${String(m.status)}`)
      return {
        index: Number(m.index ?? k + 1), amount: String(m.amount), dueAt: Number(pick(m, 'due_at', 'dueAt')), status,
        deliverableHash: orNull(pick(m, 'deliverable_hash', 'deliverableHash') as string | null | undefined), at: m.at === undefined || m.at === null ? null : Number(m.at),
        outcome: (m.outcome as string | null | undefined) ?? null, confirmBy: pick(m, 'confirm_by', 'confirmBy') == null ? null : Number(pick(m, 'confirm_by', 'confirmBy')),
        autoConfirmed: Boolean(pick(m, 'auto_confirmed', 'autoConfirmed')), disputeReason: (pick(m, 'dispute_reason', 'disputeReason') as string | null | undefined) ?? null,
      }
    }),
  }
}
