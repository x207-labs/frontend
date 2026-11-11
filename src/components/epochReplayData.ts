// v4 dashboard: turns one epoch from the read API into the data the epoch scene plays back (the same scene as the landing,
// which carries a fixed snapshot of epoch 8). Amounts become hundredths of a credit, like the scene's own snapshot.
import type { ClearingReport, EpochPhase, Obligations, ReportMember } from '../api/types'

export type SceneOutcome = 'paid' | 'claimable' | 'claimed' | 'defaulted' | 'due' | 'flat'

/** How far the replay may play for an epoch in this phase. The scene has five steps (0 open, 1 clearing, 2 commit, 3 payment window, 4 finalized); an epoch plays to the end of the step it is in
 * and no further, so a step ends at its number plus .999 (4 would already be the first instant of "Finalized"). */
export const UNTIL: Record<EpochPhase, number> = { open: 0.999, cutoff: 0.999, clearing: 1.999, commit: 2.999, payment_window: 3.999, finalized: 5 }

export type SceneData = {
  epoch: number
  phase: EpochPhase
  /** where the replay stops: `UNTIL[phase]` */
  until: number
  committedAt: string | null
  /** [debtor, creditor, amount, cleared by the solver] in hundredths */
  edges: [number, number, number, number][]
  outcome: SceneOutcome[]
  /** short label per member, in the order of the indices used by `edges` */
  names: string[]
  accounts: string[]
  reported: { gross: number; cleared: number }
}

/** base units -> hundredths, rounded half away from zero (credit has `decimals` digits; "1500000" with 6 decimals -> 150) */
export function toHundredths(amount: string | null | undefined, decimals: number): number {
  if (!amount) return 0
  const v = BigInt(amount), neg = v < 0n, a = neg ? -v : v
  const shift = decimals - 2
  const h = shift >= 0 ? (a + (shift > 0 ? 10n ** BigInt(shift) / 2n : 0n)) / 10n ** BigInt(shift) : a * 10n ** BigInt(-shift)
  return Number(neg ? -h : h)
}

/** "agent-07.x207-v018.testnet" -> "agent-07"; long single names are cut to 10 characters */
export function shortName(account: string): string {
  const first = account.split('.')[0] ?? account
  return first.length > 10 ? first.slice(0, 9) + '…' : first
}

function outcomeOf(m: ReportMember | undefined): SceneOutcome {
  if (!m) return 'flat'
  if (m.settlement) return m.settlement
  if (m.status === 409) return 'defaulted'
  if (m.status === 402) return 'due'
  if (m.status === 202) return 'claimable'
  return BigInt(m.net || '0') === 0n ? 'flat' : 'paid'
}

/** null when the epoch has no edges to play (empty, or pruned before the indexer read them) */
export function toSceneData(ob: Obligations, report: ClearingReport | undefined): SceneData | null {
  if (!ob.edges.length) return null
  const accounts: string[] = []
  const index = new Map<string, number>()
  const at = (a: string) => {
    let i = index.get(a)
    if (i === undefined) { i = accounts.length; accounts.push(a); index.set(a, i) }
    return i
  }
  // members in the report's order first, so indices match the statement table; then anyone only seen on an edge
  for (const m of report?.members ?? []) at(m.account)
  const edges = ob.edges.map((e) => [at(e.debtor), at(e.creditor), toHundredths(e.amount, ob.decimals), toHundredths(e.cleared, ob.decimals)] as [number, number, number, number])
  const byAccount = new Map((report?.members ?? []).map((m) => [m.account, m]))
  const phase = report?.phase ?? ob.phase
  return {
    epoch: ob.epoch,
    phase,
    until: UNTIL[phase] ?? 5,
    committedAt: report?.committedAt ?? null,
    edges,
    outcome: accounts.map((a) => outcomeOf(byAccount.get(a))),
    names: accounts.map(shortName),
    accounts,
    reported: { gross: toHundredths(ob.totalObligation, ob.decimals), cleared: toHundredths(report?.cleared ?? null, report?.decimals ?? ob.decimals) },
  }
}
