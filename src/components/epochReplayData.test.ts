import { describe, expect, it } from 'vitest'
import type { ClearingReport, Obligations } from '../api/types'
import { shortName, toHundredths, toSceneData, UNTIL } from './epochReplayData'

const ob = (edges: Obligations['edges']): Obligations => ({ unit: 'credit', decimals: 6, circle: 'agents-main', epoch: 9, phase: 'finalized', stage: 'cleared', edgeCount: edges.length, totalObligation: '7000000', edges })
const member = (account: string, status: 200 | 202 | 402 | 409, net: string, settlement: ClearingReport['members'][number]['settlement']) => ({ account, status, net, settlement, haircut: '0' })

describe('epoch replay data', () => {
  it('converts base units to hundredths', () => {
    expect(toHundredths('1500000', 6)).toBe(150)
    expect(toHundredths('-2250000', 6)).toBe(-225)
    expect(toHundredths('1005000', 6)).toBe(101)
    expect(toHundredths(null, 6)).toBe(0)
    expect(toHundredths('7', 2)).toBe(7)
  })

  it('shortens account names', () => {
    expect(shortName('agent-07.x207-v018.testnet')).toBe('agent-07')
    expect(shortName('averyveryverylongname.testnet')).toBe('averyvery…')
  })

  it('indexes members in report order and maps outcomes', () => {
    const edges = [
      { debtor: 'b.testnet', creditor: 'a.testnet', amount: '4000000', seq: 1, cleared: '3000000', remaining: '1000000' },
      { debtor: 'a.testnet', creditor: 'c.testnet', amount: '3000000', seq: 2, cleared: '3000000', remaining: '0' },
    ]
    const report = {
      unit: 'credit', decimals: 6, circle: 'agents-main', network: 'testnet', epoch: 9, phase: 'finalized', committed: true, finalized: true,
      totalObligation: '7000000', cleared: '6000000', clearedRatio: 0.857, committedAt: '2026-11-10T00:00:00Z', paymentDeadline: null,
      members: [member('a.testnet', 202, '1000000', 'claimable'), member('b.testnet', 409, '-1000000', null), member('c.testnet', 200, '0', null)],
    } satisfies ClearingReport
    const d = toSceneData(ob(edges), report)!
    expect(d.accounts).toEqual(['a.testnet', 'b.testnet', 'c.testnet'])
    expect(d.edges).toEqual([[1, 0, 400, 300], [0, 2, 300, 300]])
    expect(d.outcome).toEqual(['claimable', 'defaulted', 'flat'])
    expect(d.names).toEqual(['a', 'b', 'c'])
    expect(d.reported).toEqual({ gross: 700, cleared: 600 })
  })

  it('plays an epoch no further than it has got: the end of its step, and the whole replay once it is finalized', () => {
    const edges = [{ debtor: 'b.testnet', creditor: 'a.testnet', amount: '4000000', seq: 1, cleared: null, remaining: null }]
    const report = (phase: ClearingReport['phase']) => ({
      unit: 'credit', decimals: 6, circle: 'agents-main', network: 'testnet', epoch: 9, phase, committed: true, finalized: phase === 'finalized',
      totalObligation: '4000000', cleared: '0', clearedRatio: 0, committedAt: null, paymentDeadline: null, members: [member('a.testnet', 202, '4000000', 'claimable'), member('b.testnet', 402, '-4000000', 'due')],
    }) satisfies ClearingReport
    expect(UNTIL).toEqual({ open: 0.999, cutoff: 0.999, clearing: 1.999, commit: 2.999, payment_window: 3.999, finalized: 5 })
    const at = (phase: ClearingReport['phase']) => toSceneData(ob(edges), report(phase))!
    expect([at('commit').phase, at('commit').until]).toEqual(['commit', 2.999])
    expect(at('payment_window').until).toBe(3.999)
    expect(at('finalized').until).toBe(5)
    expect(at('payment_window').outcome).toEqual(['claimable', 'due']) // 402 is a result of its own: unpaid, still inside the window
    // without a report the obligations say where the epoch is
    expect(toSceneData({ ...ob(edges), phase: 'clearing' }, undefined)!.until).toBe(1.999)
  })

  it('has nothing to play for an epoch without edges', () => {
    expect(toSceneData(ob([]), undefined)).toBeNull()
  })
})
