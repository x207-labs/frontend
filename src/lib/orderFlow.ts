import { ORDER_CATALOG_NO, ORDER_KINDS, ORDER_PATTERN, PROOF_METHODS, normalizeMandate, normalizeOrder, orderClaimNotice, serializeMandate, serializeOrder, type DelegateMandate, type OrderDocument, type OrderKind } from '@x207/core'
import type { OrderMandateView, OrderView } from '../api/types'
import { sha256Hex, signMessageWithVoucher } from './barter'
import { toAtomic } from './amount'

// FE-027: service orders (pipeline P6, ADR-45), from Backend API Spec 5f. The document rules live in the SDK (SD-069: `normalizeOrder`); here we only turn form input into
// a document, compute the hash with the browser's sha256 over the SDK canonical JSON, and sign the notice.
export const KIND_LABEL: Record<OrderKind, string> = {
  prompt: '39. Prompt or workflow', research: '40. Research', translation: '41. Translation', annotation: '42. Data annotation', scraping: '43. Web data collection',
  audit: '52. Code audit', loadtest: '53. Load test', freelance: '83. Freelance', bug: '88. Product testing (per bug)', lead: '51. Referral and leads (per conversion)',
  keeper: '46. Keeper service (per tx)', solver: '48. Solver service (per tx)', delegate: '16. Delegate service (per vote)',
}
/** Every kind can be created from this form; `delegate` uses extra mandate fields (FE-030). */
export const CREATABLE_KINDS = ORDER_KINDS
export const KIND_NOTE: Partial<Record<OrderKind, string>> = {
  scraping: 'Collecting data from a website may violate that site\'s terms of service (ToS). The seller is responsible for how it is done; x207 does not check it.',
  loadtest: 'Load tests are only for sites you control. The backend asks for proof before accepting the order: a /.well-known/x207-loadtest file or a DNS TXT record containing the order hash.',
  prompt: 'Results that are easy to copy must have a sample: the sample hash is locked in the order so it cannot be copied and then disputed.',
  delegate: 'The delegate is paid per proposal they vote on, approve or reject, under the public mandate below. Other DAO actions (finalize, remove vote) are not paid, and each proposal is paid once. The mandate names the proposal kinds that may be paid, not how to vote: only the hash of the rules text is locked.',
}
export { ORDER_KINDS, ORDER_CATALOG_NO, ORDER_PATTERN, PROOF_METHODS }

export type MilestoneInput = { amount: string; due: string }
export type OrderForm = {
  kind: OrderKind | ''; seller: string; spec: string; sample: string; target: string; proofMethod: string; proofAmount: string; milestones: MilestoneInput[]
  /** `delegate` only: DAO account, proposal kinds (comma-separated), and rule text. */
  dao: string; kinds: string; rules: string
}
export const EMPTY_ORDER: OrderForm = { kind: '', seller: '', spec: '', sample: '', target: '', proofMethod: '', proofAmount: '', milestones: [{ amount: '', due: '' }], dao: '', kinds: '', rules: '' }

const seconds = (text: string): number => {
  const ms = Date.parse(/Z$|[+-]\d\d:\d\d$/.test(text) ? text : `${text}:00Z`)
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000)
}

/** Document from form input, or an error text. The example and spec hashes are computed in the browser from the typed text. */
/** Mandate from form input (`delegate`), or an error text; the rule text hash is computed in the browser. */
export async function toMandate(f: OrderForm, circle: string): Promise<DelegateMandate | string> {
  if (f.rules.trim() === '') return 'Enter the mandate rules text (only its hash is locked).'
  const kinds = f.kinds.split(/[\s,]+/).filter((k) => k !== '')
  const mandate: DelegateMandate = { circle, dao: f.dao.trim(), kinds, rules_hash: await sha256Hex(f.rules.trim()) }
  try {
    return normalizeMandate(mandate)
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
/** Browser sha256 over the canonical mandate JSON; same as the SDK `mandateHash` without `node:crypto`. */
export const mandateHashOf = (m: DelegateMandate): Promise<string> => sha256Hex(serializeMandate(m))

export async function toOrderDocument(f: OrderForm, circle: string, buyer: string, nonce: string, mandateHash: string | null = null): Promise<OrderDocument | string> {
  if (f.kind === '') return 'Choose a service kind.'
  const milestones = []
  for (const [k, m] of f.milestones.entries()) {
    const amount = toAtomic(m.amount)
    if (amount === null) return `Milestone ${k + 1}: amount must be a credit number > 0.`
    const due = seconds(m.due)
    if (due === 0) return `Milestone ${k + 1}: enter a due date (UTC).`
    milestones.push({ amount, due_at: due })
  }
  if (f.spec.trim() === '') return 'Enter the work specification.'
  const proofAmount = toAtomic(f.proofAmount)
  const doc: OrderDocument = {
    circle, kind: f.kind, buyer, seller: f.seller.trim(), spec_hash: await sha256Hex(f.spec.trim()), milestones, nonce,
    sample_hash: f.sample.trim() === '' ? null : await sha256Hex(f.sample.trim()),
    target: f.target.trim() === '' ? null : f.target.trim().toLowerCase(),
    proof: ORDER_PATTERN[f.kind] === 'proof' ? { method: f.proofMethod, amount_per_tx: proofAmount ?? '' } : null,
    ...(f.kind === 'delegate' ? { mandate_hash: mandateHash } : {}),
  }
  try {
    normalizeOrder(doc)
    return doc
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

export const orderHashOf = (doc: OrderDocument): Promise<string> => sha256Hex(serializeOrder(doc))

/** Order document from the API response (the shape the SDK hashes): milestones are taken from that response's milestone list. */
export function orderDocFromView(view: OrderView): OrderDocument {
  const o = view.order
  return {
    circle: o.circle, kind: o.kind as OrderKind, buyer: o.buyer, seller: o.seller, spec_hash: o.specHash, sample_hash: o.sampleHash, target: o.target,
    proof: o.proof === null ? null : { method: o.proof.method, amount_per_tx: o.proof.amountPerTx }, nonce: o.nonce,
    ...(o.kind === 'delegate' ? { mandate_hash: o.mandateHash } : {}),
    milestones: view.milestones.map((m) => ({ amount: m.amount, due_at: m.dueAt })),
  }
}

/**
 * Batch 3 F3 (review BE-063): before signing a notice for an order, the hash is recomputed from the DISPLAYED document and must equal the hash the user opened and
 * the one the API response names. A malicious API cannot show a known order while carrying the hash of a different order.
 */
export async function assertOrderHash(view: OrderView, opened: string): Promise<void> {
  let computed: string
  try {
    computed = await orderHashOf(orderDocFromView(view))
  } catch (e) {
    throw new Error(`Order document from the server is invalid: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (computed !== opened || view.orderHash !== opened) throw new Error('The order hash computed from the displayed document does not match the opened hash: notice not signed.')
  if (view.order.kind === 'delegate') await assertMandate(view)
}

/** The displayed mandate must be the one whose hash is in the order, and it must exist for this circle: the server cannot show a mandate other than the locked one. */
export async function assertMandate(view: OrderView): Promise<void> {
  const m = view.mandate
  if (m === null) throw new Error('Delegate order without a mandate from the server: not signed.')
  if (m.circle !== view.order.circle) throw new Error('The mandate is not for this order\'s circle: not signed.')
  let hash: string
  try {
    hash = await mandateHashOf({ circle: m.circle, dao: m.dao, kinds: m.kinds, rules_hash: m.rulesHash })
  } catch (e) {
    throw new Error(`Mandate from the server is invalid: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (hash !== view.order.mandateHash) throw new Error('The displayed mandate does not match the mandate whose hash is in the order: not signed.')
}
export const mandateOf = (m: OrderMandateView): DelegateMandate => ({ circle: m.circle, dao: m.dao, kinds: m.kinds, rules_hash: m.rulesHash })

/** Body of `POST orders`: the document and this party's signature over the canonical JSON; the counterparty's signature can be attached (account and signature). */
export async function buildCreateOrder(doc: OrderDocument, account: string, secretKey: string, counterparty?: { account: string; signature: string }, mandate?: DelegateMandate) {
  const signatures = [{ account, signature: await signMessageWithVoucher(serializeOrder(doc), doc.circle, secretKey) }, ...(counterparty ? [counterparty] : [])]
  return { order: normalizeOrder(doc), signatures, ...(mandate ? { mandate } : {}) }
}

/** Notice claiming one vote transaction (SD-072): keys `circle, order_hash, actor, action, at, tx_hash`, signed like other notices. Only the seller (delegate) claims. */
export async function signClaim(circle: string, orderHash: string, actor: string, at: number, txHash: string, secretKey: string) {
  const notice = orderClaimNotice({ circle, orderHash, actor, at, txHash })
  return { notice, signature: await signMessageWithVoucher(JSON.stringify(notice), circle, secretKey) }
}
/** Reason a claim was rejected (BE-055) in user-facing language. */
export const CLAIM_REASON: Record<string, string> = {
  tx_not_found: 'The RPC does not know this transaction.', tx_failed: 'The transaction failed on chain.', wrong_signer: 'This transaction was not signed by the seller.',
  wrong_receiver: 'This transaction is not to the DAO in the mandate.', not_a_vote: 'This transaction is not an approve or reject vote (VoteApprove or VoteReject).',
  kind_not_in_mandate: 'The proposal kind is not in the mandate.', already_claimed: 'This transaction or proposal has already been claimed.', before_order: 'This vote was cast before the order was created.',
}

export type MilestoneAction = 'delivered' | 'confirmed' | 'disputed' | 'cancelled'
export type OutcomeAction = 'proposed' | 'accepted' | 'rejected'
/** Milestone notice: canonical JSON like 5c with `order_hash` and `milestone`; fixed key order. The keys used must be checked against BE-054. */
export const milestoneNotice = (circle: string, orderHash: string, milestone: number, actor: string, action: MilestoneAction | OutcomeAction, at: number, deliverableHash: string | null = null, reason: string | null = null) =>
  ({ circle, order_hash: orderHash, milestone, actor, action, at, deliverable_hash: deliverableHash, reason })
export async function signNotice(notice: ReturnType<typeof milestoneNotice>, secretKey: string): Promise<string> {
  return signMessageWithVoucher(JSON.stringify(notice), notice.circle, secretKey)
}

/** The "human" flag on a listing: `human: true` in the listing JSON `detail` (BE-050 does not check other keys). */
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
