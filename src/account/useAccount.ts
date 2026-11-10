// FE-068: one NEP-413 signature per account action. Nothing here runs on page load: a signature is asked only when the person saves or loads something.
import { useCallback, useSyncExternalStore } from 'react'
import { isUserRejection, useWallet } from '../wallet/WalletContext'
import { writeCache } from './cache'
import { ACCOUNT_RECIPIENT, accountErrorMessage, callAccount, makeNonce, toBase64, type AccountAction, type AccountData } from './client'

export class SigningCancelled extends Error {}
export class SigningUnsupported extends Error {}
/** FE-101: the wallet failed to sign (popup blocked or closed, no answer, an answer without a signature). Before, this read as "the account service could not be reached". */
export class SigningFailed extends Error {}

// Whether the connected wallet can sign messages. Unknown until the first attempt: a wallet that cannot sign answers with an error that says so, and from then on the
// account features that need a signature explain that instead of asking again. A rejection by the person says nothing about the wallet.
export type Signing = 'unknown' | 'yes' | 'no'
let signing: Signing = 'unknown'
const listeners = new Set<() => void>()
function setSigning(next: Signing) {
  if (signing === next) return
  signing = next
  listeners.forEach((l) => l())
}
/** Test helper. */
export const resetSigning = () => setSigning('unknown')
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}
export const useSigning = (): Signing => useSyncExternalStore(subscribe, () => signing)

const UNSUPPORTED = /not (supported|implemented|available)|unsupported|is not a function|no such method|cannot sign message|does not support/i

export const UNSUPPORTED_MESSAGE = 'This wallet cannot sign messages, so account settings and saved onboarding progress are not available with it. Everything else works.'

export function describeAccountFailure(error: unknown): string {
  if (error instanceof SigningCancelled) return 'Cancelled in the wallet. Nothing was saved.'
  if (error instanceof SigningUnsupported) return UNSUPPORTED_MESSAGE
  if (error instanceof SigningFailed) return 'The wallet did not return a signature. Nothing was saved. Try again, or use another wallet.'
  return accountErrorMessage(error)
}

/** Remember what the server answered, so the shell and the forms can show it without another signature. */
export function applyAccountData(data: AccountData): void {
  writeCache(data.account_id, {
    ...(data.profile ? { displayName: data.profile.display_name } : {}),
    ...(data.prefs ? { email: data.prefs.email, deadlineReminder: data.prefs.deadline_reminder } : {}),
  })
}

export function useAccountActions() {
  const { account, signMessage } = useWallet()
  const call = useCallback(
    async (action: AccountAction, data: Record<string, unknown> = {}): Promise<AccountData> => {
      if (!account) throw new Error('Not signed in')
      const message = `x207:${action}`
      const nonce = makeNonce()
      let signed
      try {
        signed = await signMessage({ message, recipient: ACCOUNT_RECIPIENT, nonce })
      } catch (e) {
        if (isUserRejection(e)) throw new SigningCancelled()
        if (UNSUPPORTED.test(e instanceof Error ? e.message : String(e))) {
          setSigning('no')
          throw new SigningUnsupported()
        }
        throw new SigningFailed(e instanceof Error ? e.message : String(e))
      }
      const field = (v: unknown) => typeof v === 'string' && v !== ''
      if (!signed || !field(signed.accountId) || !field(signed.publicKey) || !field(signed.signature)) throw new SigningFailed('The wallet answered without a signature')
      setSigning('yes')
      const result = await callAccount(action, data, { accountId: signed.accountId, publicKey: signed.publicKey, signature: signed.signature, message, nonce: toBase64(nonce), recipient: ACCOUNT_RECIPIENT })
      applyAccountData(result)
      return result
    },
    [account, signMessage],
  )
  return { account, call }
}
