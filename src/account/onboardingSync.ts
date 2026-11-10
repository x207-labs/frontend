// FE-068: the onboarding steps as the account service stores them (`upsert_onboarding`). Server field names from backend/supabase/README.md.
// funds_received = the "I have the funds" answer; tour_done = the "I made a payment" answer (the service has no field for a first payment);
// joined and staked come from the read API, like the wizard itself.
// FE-101: the service only changes the flags it is given (a missing one keeps its stored value). The two answers are sent only when they are true, so a
// browser that lost its local copy does not reset a step the account already finished; joined and staked are sent only once the membership is known
// (while it is still loading they would both read as false).
import { isStaked, type Acknowledged, type MemberState } from '../onboarding/steps'
import type { OnboardingRow } from './client'

export function onboardingPayload(acknowledged: Acknowledged, member: MemberState): Partial<OnboardingRow> {
  return {
    wallet_created: true,
    ...(acknowledged.funds ? { funds_received: true } : {}),
    ...(member.kind === 'loading' ? {} : { joined: member.kind === 'member', staked: member.kind === 'member' && isStaked(member.member) }),
    ...(acknowledged.payment ? { tour_done: true } : {}),
  }
}
