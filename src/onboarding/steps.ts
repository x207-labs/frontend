// FE-060: where a visitor is in the four onboarding steps. Pure: the page feeds it the wallet account, what the read API says about the member,
// and the two things only the visitor can tell us (they got test funds, they made a first payment).
import type { Member } from '../api/types'
import { displayAccount } from '../lib/account'

export const STEP_IDS = ['login', 'funds', 'join', 'payment'] as const
export type StepId = (typeof STEP_IDS)[number]
export type StepStatus = 'done' | 'current' | 'upcoming'

/** `loading`: the read API has not answered yet. `none`: the account is not a member (member_not_found). `member`: it is. */
export type MemberState = { kind: 'loading' } | { kind: 'none' } | { kind: 'member'; member: Pick<Member, 'stake' | 'outstandingDebt' | 'settledHistory'> }

export type Acknowledged = { funds: boolean; payment: boolean }

export type StepsInput = { account: string | null; member: MemberState; acknowledged: Acknowledged }

export type StepView = { id: StepId; status: StepStatus; note: string }

// Amounts come from the read API as base-10 strings; anything else counts as zero rather than throwing in the render.
function positive(value: string | undefined): boolean {
  try {
    return value !== undefined && BigInt(value) > 0n
  } catch {
    return false
  }
}

export const isStaked = (member: Pick<Member, 'stake'>): boolean => positive(member.stake)

export function computeSteps({ account, member, acknowledged }: StepsInput): StepView[] {
  const loading = member.kind === 'loading' && account !== null
  const m = member.kind === 'member' ? member.member : null
  const staked = positive(m?.stake)
  const done: Record<StepId, boolean> = {
    login: account !== null,
    // A registered member paid the join deposit, so it had funds, whatever the visitor ticked.
    funds: acknowledged.funds || m !== null,
    join: staked,
    // Debt or settled history means the member has already paid or been paid through the circle.
    payment: acknowledged.payment || positive(m?.outstandingDebt) || positive(m?.settledHistory),
  }
  const firstOpen = STEP_IDS.find((id) => !done[id])
  const notes: Record<StepId, string> = {
    // FE-073: the short form, as in the account menu; a 64-hex implicit account in full ran out of the step card
    login: account ? `Signed in as ${displayAccount(account)}.` : 'Sign in with a wallet, or with email or Google.',
    funds: done.funds ? (m ? 'Funds found: the account is already a member.' : 'Marked as done.') : 'You need test NEAR for gas and mock USDT for the stake.',
    join: loading ? 'Checking the circle…' : staked ? 'Registered and staked.' : m ? 'Registered. Add stake to get a credit limit.' : 'Register and stake in one go.',
    payment: done.payment ? 'Done.' : 'Pay a listing or call a paid endpoint with your agent.',
  }
  return STEP_IDS.map((id) => ({ id, status: done[id] ? 'done' : id === firstOpen ? 'current' : 'upcoming', note: notes[id] }))
}
