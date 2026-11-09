// FE-068: the onboarding steps as the account service stores them (`upsert_onboarding`). Server field names from backend/supabase/README.md.
// funds_received = the "I have the funds" answer; tour_done = the "I made a payment" answer (the service has no field for a first payment);
// joined and staked come from the read API, like the wizard itself.
import { isStaked, type Acknowledged, type MemberState } from '../onboarding/steps'
import type { OnboardingRow } from './client'

export function onboardingPayload(acknowledged: Acknowledged, member: MemberState): OnboardingRow {
  return {
    wallet_created: true,
    funds_received: acknowledged.funds,
    joined: member.kind === 'member',
    staked: member.kind === 'member' && isStaked(member.member),
    tour_done: acknowledged.payment,
  }
}
