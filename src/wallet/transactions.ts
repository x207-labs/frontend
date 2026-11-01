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

const USDT_ID = 'usdt.tether-token.near'
const INTENTS_ID = 'intents.near'
const ONE_YOCTO = '1'

/** `ft_withdraw` USDT dari `intents.near` ke akun NEAR tanpa `msg` (ADR-19). */
export function ftWithdrawTx(receiverId: string, amount: string): FunctionCallTx {
  return {
    receiverId: INTENTS_ID,
    methodName: 'ft_withdraw',
    args: { token: USDT_ID, receiver_id: receiverId, amount },
    gas: (50n * TGAS).toString(),
    deposit: ONE_YOCTO,
  }
}

/** `ft_transfer_call` USDT ke kontrak lingkaran dengan `msg` stake. */
export function stakeTx(amount: string): FunctionCallTx {
  return {
    receiverId: USDT_ID,
    methodName: 'ft_transfer_call',
    args: { receiver_id: CONTRACT_ID, amount, msg: JSON.stringify({ action: 'stake' }) },
    gas: (100n * TGAS).toString(),
    deposit: ONE_YOCTO,
  }
}

/** `ft_transfer_call` USDT ke kontrak lingkaran dengan `msg` settle epoch (SD-014, Spec Antarmuka Kontrak 4.1). */
export function settleTx(epoch: number, amount: string): FunctionCallTx {
  return {
    receiverId: USDT_ID,
    methodName: 'ft_transfer_call',
    args: { receiver_id: CONTRACT_ID, amount, msg: JSON.stringify({ action: 'settle', epoch }) },
    gas: (100n * TGAS).toString(),
    deposit: ONE_YOCTO,
  }
}

const CLAIM_MIN_GAS = 100n * TGAS

/** `claim(epoch, destination)`: deposit 1 yoctoNEAR, gas minimal 100 TGas (ADR-19, ADR-24). */
export function claimTx(epoch: number, destination: 'near' | 'intents'): FunctionCallTx {
  return {
    receiverId: CONTRACT_ID,
    methodName: 'claim',
    args: { epoch, destination },
    gas: CLAIM_MIN_GAS.toString(),
    deposit: ONE_YOCTO,
  }
}
