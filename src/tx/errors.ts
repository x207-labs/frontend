// FE-061: the error codes of the circle contract (names copied from the Contract Interface Spec, section 10 and the tables of the later sections, plus the codes that
// interface 0.0.18 added) mapped to a plain English sentence. A code that is not in the table still shows its name, so nothing is hidden when the contract adds one.

export const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  // Access
  ERR_NOT_OWNER: 'Only the contract owner can do this.',
  ERR_GAS_TOO_LOW: 'The transaction attached too little gas. Try again with the default gas.',
  ERR_NOT_WHITELISTED: 'This account is not on the list that may call this method.',
  ERR_NOT_IMPLEMENTED: 'This method is not available in this version of the contract.',
  // Init and params
  ERR_BAD_CIRCLE_ID: 'The circle id is not valid.',
  ERR_PARAM_OUT_OF_RANGE: 'A circle parameter is outside its allowed range.',
  ERR_BAD_ESCROW_TTL: 'The escrow time limit is outside its allowed range.',
  ERR_BAD_GC_DELAY: 'The clean-up delay is outside its allowed range.',
  // Members
  ERR_WRONG_CIRCLE_ID: 'This is not the circle you meant to join. Check the circle id.',
  ERR_BAD_PUBKEY: 'The voucher key is not a valid ed25519 public key.',
  ERR_BAD_TERMS_HASH: 'The terms hash must be 64 lowercase hexadecimal characters.',
  ERR_ALREADY_MEMBER: 'This account is already a member of the circle.',
  ERR_INSUFFICIENT_STORAGE_DEPOSIT: 'The join deposit is too small. Attach at least the required storage deposit.',
  ERR_MAX_MEMBERS: 'The circle is full. It cannot take more members right now.',
  ERR_NOT_MEMBER: 'This account is not a member of the circle. Join first.',
  ERR_MEMBER_EXITED: 'This member has already left the circle.',
  ERR_NOT_ADMITTED: 'The circle owner has not admitted this account yet.',
  ERR_ADMISSION_NOT_DAO: 'Admission by the owner is not switched on for this circle.',
  ERR_ALREADY_ADMITTED: 'This account is already admitted.',
  // Exit
  ERR_WRONG_STATUS: 'The member is not in a status that allows this action.',
  ERR_EXITING: 'This member is leaving the circle, so this action is closed.',
  ERR_EXIT_NOT_READY: 'The exit is not ready yet. Wait for the exit epoch to finish, then try again.',
  ERR_WITHDRAW_IN_FLIGHT: 'A withdrawal is already on its way. Wait for it to finish.',
  ERR_HAS_DUE: 'This member still owes a settlement payment. Pay it first.',
  ERR_NOTHING_TO_WITHDRAW: 'There is nothing to withdraw.',
  ERR_STAKE_OVERFLOW: 'The stake would be larger than the contract can hold.',
  ERR_LIMIT_EXCEEDS_STAKE: 'The credit limit cannot be higher than the stake.',
  // Token
  ERR_WRONG_TOKEN: 'The contract does not accept this token.',
  ERR_BAD_MSG: 'The transfer message is not one the contract understands.',
  ERR_ZERO_AMOUNT: 'The amount must be greater than zero.',
  // Vouchers
  ERR_WRONG_CIRCLE: 'This voucher is for another circle.',
  ERR_BAD_UNIT: 'The voucher unit must be "credit".',
  ERR_RESOURCE_NOT_ASCII: 'The voucher resource must use plain ASCII characters.',
  ERR_SELF_PAYMENT: 'An account cannot pay itself.',
  ERR_EPOCH_MISMATCH: 'The voucher is for an epoch that is not the open epoch.',
  ERR_PAST_CUTOFF: 'The epoch has passed its cutoff, so no more vouchers are accepted.',
  ERR_PAYER_NOT_ACTIVE: 'The payer is not an active member.',
  ERR_PAYEE_NOT_ACTIVE: 'The payee is not an active member.',
  ERR_SEQ_NOT_INCREASING: 'The voucher sequence number must be higher than the last one registered.',
  ERR_SEQ_GAP: 'The voucher sequence number skips a number. Send them in order.',
  ERR_CUMULATIVE_DECREASED: 'The cumulative amount is lower than the one already registered.',
  ERR_INSUFFICIENT_CREDIT: 'The payer does not have enough credit headroom for this amount.',
  ERR_BAD_SIGNATURE: 'The signature does not match the voucher key.',
  // Epochs
  ERR_UNKNOWN_EPOCH: 'This epoch does not exist.',
  ERR_WRONG_PHASE: 'The epoch is not in the phase this action needs.',
  ERR_BEFORE_CUTOFF: 'The epoch cannot be closed before its cutoff time.',
  ERR_PROPOSAL_WINDOW_OPEN: 'The proposal window is still open. Try again when it has closed.',
  ERR_PROPOSAL_WINDOW_CLOSED: 'The proposal window has closed.',
  ERR_PAYMENT_WINDOW_OPEN: 'The payment window is still open. Try again when it has closed.',
  ERR_PAYMENT_WINDOW_CLOSED: 'The payment window has closed.',
  ERR_NOT_FINALIZED: 'This epoch is not finalized yet.',
  ERR_PRUNE_TOO_EARLY: 'This epoch is too recent to clean up.',
  // Clearing
  ERR_EMPTY_PROPOSAL: 'The clearing proposal has no edges.',
  ERR_TOO_MANY_EDGES: 'The clearing proposal has too many edges.',
  ERR_ZERO_CLEARED: 'The clearing proposal clears nothing.',
  ERR_DUPLICATE_EDGE: 'The clearing proposal lists the same edge twice.',
  ERR_EDGE_NOT_IN_SNAPSHOT: 'The clearing proposal uses an edge that is not in the epoch snapshot.',
  ERR_CLEARED_EXCEEDS_OBLIGATION: 'The proposal clears more than the members owe.',
  ERR_UNBALANCED_MEMBER: 'The proposal does not balance for one of the members.',
  ERR_PROPOSAL_NOT_BETTER: 'The current proposal clears at least as much, so this one was not kept.',
  // Settlement
  ERR_NO_POSITION: 'This account has no position in this epoch.',
  ERR_NOT_DUE: 'This account owes nothing in this epoch.',
  ERR_UNDERPAYMENT: 'The payment is less than what is due.',
  ERR_NOT_CREDITOR: 'This account is not owed anything in this epoch.',
  ERR_NOT_CLAIMABLE: 'There is nothing to claim yet. Debtors may still be paying.',
  ERR_POOL_INSUFFICIENT: 'The settlement pool does not hold enough yet to pay this claim.',
  ERR_NOTHING_TO_CLAIM: 'There is nothing to claim.',
  // Upgrade
  ERR_NO_UPGRADE: 'No upgrade is waiting to be applied.',
  ERR_TIMELOCK_ACTIVE: 'The upgrade time lock has not finished.',
  ERR_CODE_HASH_MISMATCH: 'The new code does not match the proposed code hash.',
  // Barter bundles and intents
  ERR_INTENT_EXISTS: 'This intent is already posted.',
  ERR_INTENT_LIMIT: 'This member has too many open intents. Remove one first.',
  ERR_UNKNOWN_INTENT: 'This intent does not exist.',
  ERR_NOT_INTENT_OWNER: 'Only the member who posted the intent can remove it.',
  ERR_BAD_BUNDLE: 'The bundle is not valid.',
  ERR_BUNDLE_EXISTS: 'This bundle is already committed.',
  ERR_BUNDLE_SIGNATURES: 'The bundle signatures do not cover every member in it.',
  ERR_BUNDLE_HEADROOM: 'A member in the bundle does not have enough credit headroom.',
  ERR_UNKNOWN_BUNDLE: 'This bundle does not exist.',
  ERR_BUNDLE_LEG: 'This voucher does not match any leg of the bundle.',
  ERR_BUNDLE_LEG_EXCEEDED: 'This voucher goes over the amount allowed for its bundle leg.',
  ERR_BUNDLE_LIMIT: 'The bundle has too many legs.',
  ERR_NOT_LEG_PAYER: 'Only the payer of this bundle leg can do this.',
  // Asset classes, grants and deals
  ERR_ASSET_CLASS_FORBIDDEN: 'Assets of this class cannot be traded in this circle.',
  ERR_ASSET_CLASS_NOT_A: 'This action only works for class A assets.',
  ERR_ASSET_TYPE_UNKNOWN: 'This asset type is not registered.',
  ERR_UNKNOWN_ASSET_TYPE: 'This asset type is not registered.',
  ERR_BAD_ASSET_TYPE: 'The asset type must look like "provider:kind".',
  ERR_PROOF_KIND_NOT_ACCEPTED: 'This kind of delivery proof is not accepted for this asset.',
  ERR_DELIVERY_NOT_ALLOWED: 'This delivery method is not allowed for this asset.',
  ERR_CONTRACT_NOT_OFFICIAL: 'This contract is not on the circle list of official asset contracts.',
  ERR_TOO_MANY_CONTRACTS: 'Too many asset contracts were listed.',
  ERR_DUPLICATE_CONTRACT: 'The same contract account is listed twice.',
  ERR_BAD_GRANT: 'The grant is not valid.',
  ERR_UNKNOWN_GRANT: 'This grant does not exist.',
  ERR_GRANT_FINAL: 'This grant has ended and cannot change.',
  ERR_GRANT_EXPIRED: 'This grant has expired.',
  ERR_GRANT_NOT_OFFERED: 'This grant is not waiting to be accepted.',
  ERR_GRANT_NOT_ACTIVE_MEMBER: 'Only active members can take part in a grant.',
  ERR_GRANT_REVOKE_DENIED: 'You are not allowed to revoke this grant now.',
  ERR_GRANT_SELF: 'You cannot accept your own grant.',
  ERR_DEAL_UNKNOWN: 'This deal does not exist.',
  ERR_DEAL_CLOSED: 'This deal is already closed.',
  ERR_DEAL_LIMIT: 'This member has too many open deals.',
  ERR_DEAL_NOT_PARTY: 'Only the two sides of a deal can do this.',
  ERR_DEAL_NOT_DUE: 'This deal is not due yet.',
  ERR_DEAL_WINDOW: 'The deal time window is outside the allowed range.',
  ERR_DEAL_WINDOW_OVER: 'The time to dispute this deal is over.',
  ERR_DEAL_ALREADY_DISPUTED: 'This deal is already disputed.',
  ERR_DEAL_NOT_DISPUTED: 'This deal is not in dispute.',
  ERR_DEAL_NO_STAKE_AT_RISK: 'No stake is at risk in this deal.',
  ERR_ARBITER_INVALID: 'The arbiter account is not valid.',
  ERR_NOT_ARBITER: 'Only the arbiter can do this.',
  ERR_RULING_WINDOW: 'The arbiter ruling window is not open.',
  ERR_BOND_REQUIRED: 'This grant needs a bond from the seller first.',
  ERR_BOND_LOCKED: 'The bond is locked while the grant is active.',
  ERR_BOND_INSUFFICIENT_STAKE: 'The stake is too small to cover the bond.',
  ERR_SEARCH_SHARE_EXCEEDED: 'The search share is higher than the listing discount allows.',
  // Freeze
  ERR_FROZEN: 'This member is frozen.',
  ERR_ALREADY_FROZEN: 'This member is already frozen.',
  ERR_NOT_FROZEN: 'This member is not frozen.',
  ERR_FREEZE_PENDING: 'A freeze proposal is already waiting.',
  ERR_FREEZE_NOT_PENDING: 'There is no freeze proposal waiting.',
  ERR_FREEZE_TIMELOCK: 'The freeze time lock has not finished.',
  ERR_BAD_TRANSITION: 'That status change is not allowed.',
  ERR_BAD_HASH: 'The hash must be 64 lowercase hexadecimal characters.',
  ERR_DUPLICATE_HASH: 'The same hash was listed twice.',
  ERR_TOO_MANY_HASHES: 'Too many hashes were listed.',
  // Escrow and account sales
  ERR_ESCROW_UNKNOWN: 'This escrow does not exist.',
  ERR_ESCROW_EXISTS: 'An escrow already exists for this deal.',
  ERR_ESCROW_PENDING: 'A delivery for this pair is still being resolved. Wait a moment and try again.',
  ERR_ESCROW_NOT_HELD: 'This escrow is not holding an asset.',
  ERR_ESCROW_NOT_EXPIRED: 'This escrow has not expired yet.',
  ERR_ESCROW_TOO_LATE: 'It is too late to complete this escrow.',
  ERR_ESCROW_NOT_GRANTOR: 'Only the seller who offered the grant can do this.',
  ERR_ESCROW_DEPOSITOR: 'The deposit came from an account that is not the seller.',
  ERR_ESCROW_NOT_CLASS_A: 'Escrow only works for class A assets.',
  ERR_ESCROW_PRICE: 'The price does not match the escrow.',
  ERR_ESCROW_USDT: 'USDT cannot be held as an escrowed asset.',
  ERR_ESCROW_VOUCHER: 'The voucher does not match the escrow.',
  ERR_ESCROW_FT_MISMATCH: 'The token deposited is not the token the escrow expects.',
  ERR_ESCROW_FT_AMOUNT: 'The token amount deposited does not match the escrow.',
  ERR_ESCROW_MT_MISMATCH: 'The multi-token deposited is not the one the escrow expects.',
  ERR_ESCROW_MT_AMOUNT: 'The multi-token amount deposited does not match the escrow.',
  ERR_ESCROW_MT_BATCH: 'Multi-token escrow accepts one token at a time.',
  ERR_ESCROW_NFT_MISMATCH: 'The NFT deposited is not the one the escrow expects.',
  ERR_ESCROW_ACCOUNT_MISMATCH: 'The account in this escrow is not the one that was offered.',
  ERR_ESCROW_EPOCH_WAIT: 'The sale of this account waits until earlier epochs are final.',
  ERR_ESCROW_NEEDS_PUBKEY: 'An account sale needs the buyer key to hand the account to.',
  ERR_ESCROW_NOT_ACCOUNT: 'This escrow is not an account sale.',
  ERR_ESCROW_TTL_TOO_LONG: 'The escrow time limit is longer than the circle allows.',
  ERR_ACCOUNT_ASSET_TYPE: 'This asset type is not an account sale.',
  ERR_ACCOUNT_LOCKED: 'This account is already locked in another sale.',
  ERR_ACCOUNT_NOT_SELLABLE: 'This account cannot be sold.',
  ERR_ACCOUNT_SELF: 'An account cannot be sold to itself.',
  ERR_LOCKER_GRANT: 'The locker account does not match this grant.',
  ERR_LOCKER_INIT_SELF: 'The locker must be set up by the circle contract.',
  ERR_LOCKER_NOT_CIRCLE: 'Only the circle contract can control this locker.',
  ERR_LOCKER_STATE: 'The locker is not in the state this step needs.',
  ERR_PENDING_TOO_YOUNG: 'This pending member is too recent to remove.',
  ERR_NOT_PENDING: 'This member is not pending.',
  ERR_RECEIVER_BLOCKED: 'The receiving account blocks this transfer.',
  // EVM members
  ERR_BAD_EVM_ADDRESS: 'The EVM address is not valid.',
  ERR_BAD_EVM_RECEIVER: 'The EVM receiver is not valid.',
  ERR_BAD_EVM_SIG: 'The EIP-712 signature does not match the EVM key.',
  ERR_EVM_DEADLINE_TOO_FAR: 'The signature deadline is too far in the future.',
  ERR_EVM_EXPIRED: 'The EVM signature has expired. Sign again.',
  ERR_EVM_NONCE: 'The EVM signature nonce was already used or is out of order.',
  ERR_EVM_FEE_NOT_ALLOWED: 'A fee above zero is not allowed for this call.',
  ERR_EVM_UNSUPPORTED: 'This call is not supported for EVM members.',
  ERR_NOT_EVM_MEMBER: 'This account is not an EVM member.',
  // Internal checks
  ERR_D2_ACCOUNTING: 'The contract stopped on an internal accounting check. Nothing was changed. Please report this.',
  ERR_D6_ACCOUNTING: 'The contract stopped on an internal accounting check. Nothing was changed. Please report this.',
  ERR_HASH_JSON: 'The contract stopped on an internal check. Nothing was changed. Please report this.',
  ERR_NO_STATE: 'The contract has no stored state yet.',
}

const CODE = /\bERR_[A-Z0-9_]+\b/

export type ExplainedError = {
  /** The contract error code found in the text, if any. */
  code?: string
  /** Detail the contract adds after the code, e.g. the parameter name of `ERR_PARAM_OUT_OF_RANGE: <field>`. */
  detail?: string
  /** What the user sees. */
  message: string
}

/** Turns a raw error (a wallet error, a failed outcome, a panic message) into a sentence. Without a known code the text itself is kept. */
export function explainError(raw: unknown): ExplainedError {
  const text = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : safeJson(raw)
  const found = CODE.exec(text)
  if (!found) return { message: text || 'The transaction failed.' }
  const code = found[0]
  const after = text.slice(found.index + code.length).match(/^:\s*([^"\\\n}]+)/)
  const detail = after?.[1]?.trim() || undefined
  const base = ERROR_MESSAGES[code]
  if (!base) return { code, ...(detail ? { detail } : {}), message: `The contract refused the call (${code}${detail ? `: ${detail}` : ''}).` }
  return { code, ...(detail ? { detail } : {}), message: detail ? `${base} (${detail})` : base }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return String(value)
  }
}
