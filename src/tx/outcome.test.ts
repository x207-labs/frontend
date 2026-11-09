import { describe, expect, it } from 'vitest'
import { explainError } from './errors'
import { outcomeFailure } from './outcome'

describe('TC-FE-061-02 a refused call is not a confirmed transaction', () => {
  const ok = { status: { SuccessValue: '' }, receipts_outcome: [{ outcome: { status: { SuccessValue: '' } } }] }

  it('a successful outcome has no failure', () => {
    expect(outcomeFailure(ok)).toBeNull()
    expect(outcomeFailure(undefined)).toBeNull()
    expect(outcomeFailure('x')).toBeNull()
  })

  it('finds the failure in the transaction status', () => {
    const failed = { status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: 'Smart contract panicked: ERR_ALREADY_MEMBER' } } } } } }
    expect(explainError(outcomeFailure(failed)).code).toBe('ERR_ALREADY_MEMBER')
  })

  it('finds the failure in a receipt of a cross-contract call', () => {
    const failed = { status: { SuccessValue: '' }, receipts_outcome: [{ outcome: { status: { SuccessReceiptId: 'a' } } }, { outcome: { status: { Failure: { ActionError: { kind: 'ERR_WRONG_TOKEN' } } } } }] }
    expect(explainError(outcomeFailure(failed)).code).toBe('ERR_WRONG_TOKEN')
  })
})
