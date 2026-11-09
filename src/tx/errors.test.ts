import { describe, expect, it } from 'vitest'
import { ERROR_MESSAGES, explainError } from './errors'

// FE-061. The names below are the ones the Contract Interface Spec lists for the methods of this app (join, stake, settle, claim, exit, vouchers, epochs); each must have a sentence.
const SPEC_NAMES_USED_BY_THE_APP = [
  'ERR_NOT_OWNER', 'ERR_GAS_TOO_LOW', 'ERR_WRONG_CIRCLE_ID', 'ERR_BAD_PUBKEY', 'ERR_BAD_TERMS_HASH', 'ERR_ALREADY_MEMBER', 'ERR_INSUFFICIENT_STORAGE_DEPOSIT', 'ERR_MAX_MEMBERS',
  'ERR_NOT_MEMBER', 'ERR_MEMBER_EXITED', 'ERR_NOT_ADMITTED', 'ERR_WRONG_STATUS', 'ERR_EXITING', 'ERR_EXIT_NOT_READY', 'ERR_WITHDRAW_IN_FLIGHT', 'ERR_HAS_DUE',
  'ERR_WRONG_TOKEN', 'ERR_BAD_MSG', 'ERR_ZERO_AMOUNT', 'ERR_UNKNOWN_EPOCH', 'ERR_WRONG_PHASE', 'ERR_NOT_FINALIZED', 'ERR_NO_POSITION', 'ERR_NOT_DUE', 'ERR_UNDERPAYMENT',
  'ERR_NOT_CREDITOR', 'ERR_NOT_CLAIMABLE', 'ERR_POOL_INSUFFICIENT', 'ERR_NOTHING_TO_CLAIM', 'ERR_INSUFFICIENT_CREDIT', 'ERR_BAD_SIGNATURE', 'ERR_PAST_CUTOFF', 'ERR_PAYER_NOT_ACTIVE',
  'ERR_PAYEE_NOT_ACTIVE', 'ERR_SEQ_NOT_INCREASING', 'ERR_SEQ_GAP', 'ERR_CUMULATIVE_DECREASED', 'ERR_EPOCH_MISMATCH', 'ERR_SELF_PAYMENT', 'ERR_WRONG_CIRCLE',
]

describe('TC-FE-061-01 contract error codes become sentences', () => {
  it('every code the app can meet has a sentence, and every table key is a contract-style name', () => {
    for (const name of SPEC_NAMES_USED_BY_THE_APP) expect(ERROR_MESSAGES[name], name).toBeTruthy()
    for (const [name, sentence] of Object.entries(ERROR_MESSAGES)) {
      expect(name).toMatch(/^ERR_[A-Z0-9_]+$/)
      expect(sentence.length).toBeGreaterThan(10)
      expect(sentence).toMatch(/[.)]$/)
      expect(sentence).not.toMatch(/ERR_/) // the sentence explains the code, it does not repeat it
    }
  })

  it('finds the code in the texts that NEAR and the wallets produce', () => {
    expect(explainError(new Error('Smart contract panicked: ERR_NOT_MEMBER'))).toMatchObject({ code: 'ERR_NOT_MEMBER', message: ERROR_MESSAGES.ERR_NOT_MEMBER })
    const failure = JSON.stringify({ ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: 'Smart contract panicked: ERR_INSUFFICIENT_STORAGE_DEPOSIT' } } } })
    expect(explainError(failure).code).toBe('ERR_INSUFFICIENT_STORAGE_DEPOSIT')
    expect(explainError('Exceeded the prepaid gas. ERR_GAS_TOO_LOW').code).toBe('ERR_GAS_TOO_LOW')
  })

  it('keeps the detail the contract adds after the code', () => {
    const out = explainError('Smart contract panicked: ERR_PARAM_OUT_OF_RANGE: epoch_length')
    expect(out).toMatchObject({ code: 'ERR_PARAM_OUT_OF_RANGE', detail: 'epoch_length' })
    expect(out.message).toBe('A circle parameter is outside its allowed range. (epoch_length)')
  })

  it('an unknown code still shows its name; text without a code stays as it is', () => {
    expect(explainError('boom ERR_SOMETHING_NEW')).toMatchObject({ code: 'ERR_SOMETHING_NEW', message: 'The contract refused the call (ERR_SOMETHING_NEW).' })
    expect(explainError(new Error('RPC unreachable')).message).toBe('RPC unreachable')
    expect(explainError('').message).toBe('The transaction failed.')
    expect(explainError({ a: 1 }).message).toBe('{"a":1}')
  })
})
