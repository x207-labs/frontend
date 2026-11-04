import { describe, expect, it } from 'vitest'
import type { EpochItem } from '../api/types'
import { lateEpoch } from './lateEpoch'

const now = Date.parse('2026-11-09T12:00:00Z')
const item = (e: Partial<EpochItem> & { epoch: number }): EpochItem => ({ phase: 'open', proposalDeadline: null, ...e })

describe('FE-040 lateEpoch', () => {
  it('an open epoch past its cutoff is late', () => {
    expect(lateEpoch([item({ epoch: 5, cutoffAt: '2026-11-09T11:00:00Z' })], now)?.epoch).toBe(5)
  })
  it('a clearing epoch past its proposal deadline, a cutoff one a minute past its cutoff, a payment one past its payment deadline are late', () => {
    expect(lateEpoch([item({ epoch: 5, phase: 'clearing', proposalDeadline: '2026-11-09T11:00:00Z' })], now)?.epoch).toBe(5)
    expect(lateEpoch([item({ epoch: 5, phase: 'cutoff', cutoffAt: '2026-11-09T11:58:00Z' })], now)?.epoch).toBe(5)
    expect(lateEpoch([item({ epoch: 5, phase: 'payment_window', paymentDeadline: '2026-11-09T11:00:00Z' })], now)?.epoch).toBe(5)
  })
  it('a cutoff epoch within the close grace, and a payment epoch before its payment deadline, are not late', () => {
    expect(lateEpoch([item({ epoch: 5, phase: 'cutoff', cutoffAt: '2026-11-09T11:59:30Z' })], now)).toBeNull()
    expect(lateEpoch([item({ epoch: 5, phase: 'payment_window', paymentDeadline: '2026-11-09T12:10:00Z' })], now)).toBeNull()
  })
  it('an epoch before its deadline, a finalized one, or one with no deadline is not late', () => {
    expect(lateEpoch([item({ epoch: 5, cutoffAt: '2026-11-09T13:00:00Z' })], now)).toBeNull()
    expect(lateEpoch([item({ epoch: 5, phase: 'finalized', proposalDeadline: '2026-11-09T11:00:00Z' })], now)).toBeNull()
    expect(lateEpoch([item({ epoch: 5, phase: 'payment_window' })], now)).toBeNull()
    expect(lateEpoch([item({ epoch: 5 })], now)).toBeNull()
    expect(lateEpoch([], now)).toBeNull()
  })
  it('only the newest epoch counts, whatever the order of the list', () => {
    const old = item({ epoch: 3, phase: 'clearing', proposalDeadline: '2026-11-09T01:00:00Z' })
    const fresh = item({ epoch: 6, phase: 'payment_window', paymentDeadline: '2026-11-09T12:10:00Z' })
    expect(lateEpoch([old, fresh], now)).toBeNull()
    expect(lateEpoch([fresh, old], now)).toBeNull()
  })
})
