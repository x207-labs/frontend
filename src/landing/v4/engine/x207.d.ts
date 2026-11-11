// Types for x207.js: the epoch 8 snapshot and helpers of the v4 landing (ported from the approved HTML draft).
/** [debtor, creditor, amount, cleared by the solver], amounts in hundredths of a credit */
export type Edge = [number, number, number, number]
export type Outcome = 'paid' | 'claimable' | 'claimed' | 'defaulted' | 'flat'
/** What the app can play on top of the landing's five: `due` is status 402, unpaid but still inside the payment window. */
export type SceneOutcome = Outcome | 'due'
/**
 * What the epoch scene plays. The epoch 8 snapshot `X207` is one; the app builds its own from the read API.
 * `names` default to m00, m01, ...; members are the longest of `outcome`, `names` and the highest index an edge points at.
 */
export type SceneData = {
  /** [debtor, creditor, amount, cleared by the solver] in hundredths of a credit */
  edges: Edge[]
  /** result per member; a member missing from the list reads as `flat` */
  outcome: SceneOutcome[]
  names?: string[]
  /** figures the API reported (used by the landing's self-check; the scene does not read them) */
  reported?: Partial<{ gross: number; cleared: number; net: number; transfers: number }>
  /** where the scene may play up to, 0..5 (default 5): an epoch still in its payment window stops at 3.999, the end of that step */
  until?: number
  /** where the scene opens, 0..5 (default 0) */
  start?: number
  /** member labels on the canvas (default: only when there are 24 members or fewer) */
  labels?: boolean
}
export declare const X207: {
  circle: string
  contract: string
  codeHash: string
  api: string
  epoch: number
  committedAt: string
  paymentDeadline: string
  edges: Edge[]
  outcome: Outcome[]
  reported: { gross: number; cleared: number; net: number; transfers: number }
}
export declare function fmt(hundredths: number): string
export declare function signed(hundredths: number): string
export declare function name(index: number): string
/** The label of member `index`: from `names` when given, else m00, m01, ... */
export declare function labelOf(index: number, names?: string[]): string
/** How many members `data` has (15 for the epoch 8 snapshot, which is the default). */
export declare function memberCount(data?: SceneData): number
/** Everything recomputed from the raw edges, in hundredths: per member owes/owed/net, and the totals. */
export type Recomputed = {
  owes: number[]
  owed: number[]
  net: number[]
  gross: number
  cleared: number
  payIn: number
  payOut: number
  transfers: number
  sum: number
}
/** Recomputes `data`; without it, the epoch 8 snapshot. */
export declare function recompute(data?: SceneData): Recomputed
/** [css class, result code, label] per outcome */
export declare const STATUS: Record<SceneOutcome, [string, string, string]>
export declare function renderLedger(tbody: Element, tfoot: Element): void
export declare function renderChecks(ul: Element): void
export declare function el(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement
export declare function initGraph(root: Element): void
