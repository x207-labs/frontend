import { JOIN_STORAGE_DEPOSIT as JOIN_DEPOSIT, PRUNE_MAX_ITEMS_PER_CALL } from '@x207/core'
import { CIRCLE, CONTRACT_ID } from '../config'
import type { FunctionCallTx } from './types'

const TGAS = 10n ** 12n

// JOIN_STORAGE_DEPOSIT: single source in `@x207/core` (ADR-41 raised it; the contract refunds the excess).
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

/** `ft_withdraw` USDT from `intents.near` to a NEAR account without `msg` (ADR-19). */
export function ftWithdrawTx(receiverId: string, amount: string): FunctionCallTx {
  return {
    receiverId: INTENTS_ID,
    methodName: 'ft_withdraw',
    args: { token: USDT_ID, receiver_id: receiverId, amount },
    gas: (50n * TGAS).toString(),
    deposit: ONE_YOCTO,
  }
}

/** `ft_transfer_call` USDT to the circle contract with the stake `msg`. */
export function stakeTx(amount: string): FunctionCallTx {
  return {
    receiverId: USDT_ID,
    methodName: 'ft_transfer_call',
    args: { receiver_id: CONTRACT_ID, amount, msg: JSON.stringify({ action: 'stake' }) },
    gas: (100n * TGAS).toString(),
    deposit: ONE_YOCTO,
  }
}

/** `ft_transfer_call` USDT to the circle contract with the settle epoch `msg` (SD-014, Contract Interface Spec 4.1). */
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

/** `request_exit()`: no arguments, deposit 1 yoctoNEAR (ADR-29). */
export function requestExitTx(): FunctionCallTx {
  return { receiverId: CONTRACT_ID, methodName: 'request_exit', args: {}, gas: (30n * TGAS).toString(), deposit: ONE_YOCTO }
}

/** `withdraw_stake()`: deposit 1 yoctoNEAR, enough gas for `ft_transfer` and the callback (ADR-29, ADR-32). */
export function withdrawStakeTx(): FunctionCallTx {
  return { receiverId: CONTRACT_ID, methodName: 'withdraw_stake', args: {}, gas: (100n * TGAS).toString(), deposit: ONE_YOCTO }
}

/** `withdraw_intents_balance()` (interface 0.0.9): anyone may call; the contract requires at least 130 Tgas prepaid, so 150 Tgas, no deposit. */
export function withdrawIntentsBalanceTx(): FunctionCallTx {
  return { receiverId: CONTRACT_ID, methodName: 'withdraw_intents_balance', args: {}, gas: (150n * TGAS).toString(), deposit: '0' }
}

/** `remove_intent(intent_hash)`: base58 intent hash, owner only (or anyone if the owner is already `exited`, ADR-41). No deposit. */
export function removeIntentTx(intentHash: string): FunctionCallTx {
  return { receiverId: CONTRACT_ID, methodName: 'remove_intent', args: { intent_hash: intentHash }, gas: (30n * TGAS).toString(), deposit: '0' }
}

/** `prune_epoch(epoch, max_items)`: permissionless; 196 entries use 70 Tgas (sandbox test), so 100 Tgas for 200 entries. */
export function pruneEpochTx(epoch: number): FunctionCallTx {
  return { receiverId: CONTRACT_ID, methodName: 'prune_epoch', args: { epoch, max_items: PRUNE_MAX_ITEMS_PER_CALL }, gas: (100n * TGAS).toString(), deposit: '0' }
}
