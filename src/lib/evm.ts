/** FE-041: an EVM member is its lowercase `0x` address of 42 characters (docs/evm-agents.md). */
export function isEvmAccount(account: string): boolean {
  return /^0x[0-9a-f]{40}$/.test(account)
}
