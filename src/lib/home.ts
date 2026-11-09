import type { EpochItem, MemberResponse, SettlementItem } from '../api/types'
import { formatCredit, formatTime } from './format'

export type HomeAction = { key: string; tone: 'urgent' | 'todo' | 'info'; text: string; to: string; cta: string }

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
