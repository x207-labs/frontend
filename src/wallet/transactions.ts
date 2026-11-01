import { CIRCLE, CONTRACT_ID } from '../config'
import type { FunctionCallTx } from './types'

const TGAS = 10n ** 12n

// JOIN_STORAGE_DEPOSIT 0,01 NEAR, Spec Antarmuka Kontrak bagian 4 dan 9.3.
export const JOIN_STORAGE_DEPOSIT = (10n ** 22n).toString()

export function joinTx(pubkeyVoucher: string, termsHash: string): FunctionCallTx {
  return {
    receiverId: CONTRACT_ID,
    methodName: 'join',
    args: { circle_id: CIRCLE, pubkey_voucher: pubkeyVoucher, terms_hash: termsHash },
    gas: (30n * TGAS).toString(),
    deposit: JOIN_STORAGE_DEPOSIT,
  }
}
