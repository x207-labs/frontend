import type { EpochItem, EpochMetrics, EpochPhase, Member, MemberResponse, SettlementItem } from '../api/types'
import { formatCredit, formatTime } from './format'

export type HomeAction = { key: string; tone: 'urgent' | 'todo' | 'info'; text: string; to: string; cta: string }

const grouped = new Intl.NumberFormat('en-US')

/** Credit with exactly two decimals and thousands separators, for tables (rounded half up, no float). `-` for a value that cannot be read. */
export function formatCredit2(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '-'
  try {
    const negative = raw.startsWith('-')
    const cents = (BigInt(raw.replace(/^[-+]/, '')) + 5000n) / 10000n
    return `${negative && cents > 0n ? '-' : ''}${grouped.format(cents / 100n)}.${String(cents % 100n).padStart(2, '0')}`
  } catch {
    return '-'
  }
}

/** The epoch length the contract reports (seconds) in words: `10 minutes`, `1 hour`, `90 seconds`. */
export function epochLengthText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'not available'
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (seconds % 3600 === 0) return plural(seconds / 3600, 'hour')
  if (seconds % 60 === 0) return plural(seconds / 60, 'minute')
  return plural(seconds, 'second')
}

/** One epoch that carried vouchers, as the Home statement, the cards and the table show it. Amounts stay in the smallest unit (strings). */
export type VoucherEpoch = {
  epoch: number
  phase: EpochPhase
  vouchers: number
  participants: number
  /** `totalVoucherValue`: what members owed each other before clearing. */
  owed: string
  /** What the solver's loops cancelled; `null` until a clearing result exists. */
  cancelled: string | null
  /** The residual that moves as cash (`netDebt`); `null` until a clearing result exists. */
  moved: string | null
  /** Cancelled share of the owed amount, 0 to 1. */
  clearedRatio: number | null
  /** Moved share of the owed amount in percent with one decimal (`18.7`); `null` when nothing is owed or nothing is known yet. */
  movedPercent: number | null
  defaultRate: number | null
}

export function voucherEpoch(m: EpochMetrics): VoucherEpoch {
  let movedPercent: number | null = null
  try {
    const owed = BigInt(m.totalVoucherValue)
    if (m.netDebt !== null && owed > 0n) movedPercent = Number((BigInt(m.netDebt) * 1000n) / owed) / 10
  } catch {
    movedPercent = null
  }
  return {
    epoch: m.epoch,
    phase: m.phase,
    vouchers: m.voucherCount,
    participants: m.graph.participants,
    owed: m.totalVoucherValue,
    cancelled: m.cleared,
    moved: m.netDebt,
    clearedRatio: m.clearedRatio,
    movedPercent,
    defaultRate: m.defaultRate,
  }
}

/** How a listed epoch ended, as one of the x207 result codes; `null` while it is still being cleared (the phase is shown as text instead). */
export function epochOutcome(v: VoucherEpoch): { code: 200 | 402 | 409; label: string } | null {
  if (v.phase === 'finalized') return v.defaultRate !== null && v.defaultRate > 0 ? { code: 409, label: 'Default, covered from stake' } : { code: 200, label: 'Settled' }
  if (v.phase === 'payment_window') return { code: 402, label: 'Payment window open' }
  return null
}

/** Members of the circle in numbers for Home: all, active, suspended, and the stake held in total (smallest unit). */
export function memberTotals(items: Member[]): { total: number; active: number; suspended: number; staked: string } {
  return {
    total: items.length,
    active: items.filter((m) => m.status === 'active').length,
    suspended: items.filter((m) => m.status === 'suspended').length,
    staked: items.reduce((sum, m) => sum + BigInt(m.stake), 0n).toString(),
  }
}

/** The epoch the member is in now: the newest one that is not finalized yet, else the newest one. */
export function currentEpoch(items: EpochItem[]): EpochItem | null {
  const live = items.filter((e) => e.phase !== 'finalized')
  const pool = live.length > 0 ? live : items
  return pool.reduce<EpochItem | null>((best, e) => (best === null || e.epoch > best.epoch ? e : best), null)
}

export const sumAmounts = (items: SettlementItem[]) => items.reduce((total, s) => total + BigInt(s.amount), 0n).toString()

/**
 * What the member should do next, built only from what the read API says (FE-056). No row means nothing is owed or claimable, so the list says so instead of staying empty.
 * An unknown member (the read API answers 404) is sent to onboarding.
 */
export function homeActions(member: MemberResponse | null, settlements: SettlementItem[]): HomeAction[] {
  if (member === null) {
    return [{ key: 'join', tone: 'todo', text: 'This account is not a member of the circle yet.', to: '/onboarding', cta: 'Join the circle' }]
  }
  const actions: HomeAction[] = []
  for (const s of settlements.filter((x) => x.status === 'defaulted')) {
    actions.push({ key: `default-${s.epoch}`, tone: 'urgent', text: `Epoch ${s.epoch}: the payment window closed with ${formatCredit(s.amount)} credit unpaid.`, to: '/settlement', cta: 'See the settlement' })
  }
  for (const s of settlements.filter((x) => x.status === 'due')) {
    const by = s.due ? ` by ${formatTime(s.due)}` : ''
    actions.push({ key: `due-${s.epoch}`, tone: 'urgent', text: `Epoch ${s.epoch}: pay ${formatCredit(s.amount)} credit${by}.`, to: '/settlement', cta: 'Pay residual' })
  }
  for (const s of settlements.filter((x) => x.status === 'claimable')) {
    actions.push({
      key: `claim-${s.epoch}`,
      tone: 'todo',
      text: s.claimableNow === false ? `Epoch ${s.epoch}: ${formatCredit(s.amount)} credit to claim once the epoch is finalized.` : `Epoch ${s.epoch}: claim ${formatCredit(s.amount)} credit.`,
      to: '/settlement',
      cta: s.claimableNow === false ? 'See the settlement' : 'Claim',
    })
  }
  if (member.status === 'pending') {
    actions.push({ key: 'pending', tone: 'info', text: 'Your membership is pending. It becomes active once the circle admits the account.', to: '/onboarding', cta: 'See onboarding' })
  }
  if (member.status === 'suspended') {
    actions.push({ key: 'suspended', tone: 'urgent', text: 'Your membership is suspended, so new obligations are refused.', to: '/risk', cta: 'See the risk page' })
  }
  if (actions.length === 0) {
    actions.push({ key: 'clear', tone: 'info', text: 'Nothing to do. No payment is due and nothing is waiting to be claimed.', to: '/marketplace', cta: 'Browse the marketplace' })
  }
  return actions
}
