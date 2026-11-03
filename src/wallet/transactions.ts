import { JOIN_STORAGE_DEPOSIT as JOIN_DEPOSIT, PRUNE_MAX_ITEMS_PER_CALL } from '@x207/core'
import { CIRCLE, CONTRACT_ID } from '../config'
import type { FunctionCallTx } from './types'

const TGAS = 10n ** 12n

// JOIN_STORAGE_DEPOSIT: satu sumber di `@x207/core` (ADR-41 menaikkannya; kontrak mengembalikan kelebihannya).
export const JOIN_STORAGE_DEPOSIT = JOIN_DEPOSIT.toString()

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

/** `request_exit()`: tanpa argumen, deposit 1 yoctoNEAR (ADR-29). */
export function requestExitTx(): FunctionCallTx {
  return { receiverId: CONTRACT_ID, methodName: 'request_exit', args: {}, gas: (30n * TGAS).toString(), deposit: ONE_YOCTO }
}

/** `withdraw_stake()`: deposit 1 yoctoNEAR, gas cukup untuk `ft_transfer` dan callback (ADR-29, ADR-32). */
export function withdrawStakeTx(): FunctionCallTx {
  return { receiverId: CONTRACT_ID, methodName: 'withdraw_stake', args: {}, gas: (100n * TGAS).toString(), deposit: ONE_YOCTO }
}

/** `withdraw_intents_balance()` (interface 0.0.9): siapa pun boleh memanggil; kontrak minta minimal 130 Tgas prepaid, jadi 150 Tgas, tanpa deposit. */
export function withdrawIntentsBalanceTx(): FunctionCallTx {
  return { receiverId: CONTRACT_ID, methodName: 'withdraw_intents_balance', args: {}, gas: (150n * TGAS).toString(), deposit: '0' }
}

/** `remove_intent(intent_hash)`: hash intent base58, hanya pemilik (atau siapa pun bila pemiliknya sudah `exited`, ADR-41). Tanpa deposit. */
export function removeIntentTx(intentHash: string): FunctionCallTx {
  return { receiverId: CONTRACT_ID, methodName: 'remove_intent', args: { intent_hash: intentHash }, gas: (30n * TGAS).toString(), deposit: '0' }
}

/** `prune_epoch(epoch, max_items)`: permissionless; 196 entri memakai 70 Tgas (tes sandbox), jadi 100 Tgas untuk 200 entri. */
export function pruneEpochTx(epoch: number): FunctionCallTx {
  return { receiverId: CONTRACT_ID, methodName: 'prune_epoch', args: { epoch, max_items: PRUNE_MAX_ITEMS_PER_CALL }, gas: (100n * TGAS).toString(), deposit: '0' }
}
