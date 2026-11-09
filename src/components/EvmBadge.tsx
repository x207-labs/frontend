import { EVM_GUIDE_URL } from '../config'
import { isEvmAccount } from '../lib/evm'

/** Marks a member whose id is a `0x` address; links to the page that explains how such an agent joins and signs. */
export function EvmBadge({ account }: { account: string }) {
  if (!isEvmAccount(account)) return null
  return (
    <a className="evm-badge" href={EVM_GUIDE_URL} title="This member holds a 0x key: it joined with join_evm and signs with EIP-712">
      EVM
    </a>
  )
}
