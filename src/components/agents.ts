// v6 (2026-11-12): the agents of the circle as the sidebar and the agent pages show them: a short name and one plain line on where each one stands,
// read from the newest epoch that has a clearing result (its report holds a result code per member).
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { EpochItem, Member, ReportMember } from '../api/types'
import { displayAccount } from '../lib/account'
import { formatCredit2 } from '../lib/home'
import type { Mood } from './Mascot'

export type Tone = 'todo' | 'ok' | 'bad' | 'quiet'
export type Agent = { account: string; name: string; member: Member; result?: ReportMember; line: string; tone: Tone; mood?: Mood }

/** The first label of a NEAR name ("scraper.x207-circle.near" -> "scraper"); a long implicit or EVM account keeps its start and end. */
export function shortName(account: string): string {
  const shown = displayAccount(account)
  return shown === account ? account.split('.')[0] || account : shown
}

const abs = (raw: string) => raw.replace(/^[-+]/, '')

/** One plain line on where an agent stands: its result in the reported epoch, else its membership. */
/** The face of the mascot follows the line: surprised while it owes, happy when it is paid or can claim, sad when its stake covered a default. */
export function agentLine(member: Member, result?: ReportMember): { line: string; tone: Tone; mood?: Mood } {
  if (result) {
    const amount = formatCredit2(result.amount ?? abs(result.net))
    if (result.status === 402) return { line: `Owes ${amount}`, tone: 'todo', mood: 'surprised' }
    if (result.status === 202) return result.settlement === 'claimed' ? { line: `Claimed ${amount}`, tone: 'ok', mood: 'happy' } : { line: `Can claim ${amount}`, tone: 'todo', mood: 'happy' }
    if (result.status === 409) return { line: 'Closed from stake', tone: 'bad', mood: 'sad' }
    return abs(result.net).replace(/0/g, '') === '' ? { line: 'Nothing to settle', tone: 'ok' } : { line: 'Paid', tone: 'ok', mood: 'happy' }
  }
  if (member.status === 'suspended') return { line: 'Suspended', tone: 'bad', mood: 'sad' }
  if (member.status === 'exited') return { line: 'Left the circle', tone: 'quiet' }
  if (member.status === 'pending') return { line: 'Joining', tone: 'quiet' }
  return { line: `${formatCredit2(member.headroom)} credit free`, tone: 'quiet' }
}

/** The newest epoch with a clearing result, whose report says where every member stands. */
export function reportedEpoch(items: EpochItem[] | undefined): EpochItem | null {
  return [...(items ?? [])].filter((e) => e.phase === 'commit' || e.phase === 'payment_window' || e.phase === 'finalized').sort((a, b) => b.epoch - a.epoch)[0] ?? null
}

/** Every agent, with you first, then the ones with the largest result in the reported epoch, then the rest by name. */
export function useAgents(me: string | null) {
  // the same queries (and cache) as the pages, but the sidebar never polls them itself: it shows what the pages last read (FE-046, the load on the read API)
  const members = useQuery({ queryKey: ['members'], queryFn: api.members, refetchInterval: false })
  const epochs = useQuery({ queryKey: ['epochs'], queryFn: api.epochs, refetchInterval: false })
  const reported = reportedEpoch(epochs.data?.items)
  const report = useQuery({ queryKey: ['report', reported?.epoch ?? null], queryFn: () => api.report(reported!.epoch), enabled: reported !== null, refetchInterval: false })
  const results = new Map((report.data?.members ?? []).map((r) => [r.account, r]))
  const size = (a: Agent) => (a.result ? BigInt(abs(a.result.net) || '0') : -1n)
  const agents: Agent[] = (members.data?.items ?? []).map((member) => {
    const result = results.get(member.account)
    return { account: member.account, name: shortName(member.account), member, result, ...agentLine(member, result) }
  })
  agents.sort((a, b) => {
    if (a.account === me) return -1
    if (b.account === me) return 1
    const d = size(b) - size(a)
    return d === 0n ? a.account.localeCompare(b.account) : d > 0n ? 1 : -1
  })
  return { agents, epoch: reported?.epoch ?? null, loading: members.isPending, error: members.isError }
}
