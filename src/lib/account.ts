// FE-055: how an account is shown in a tight place (the account menu). A NEAR name is already short and stays whole (the layout truncates it when the room runs out);
// the two long forms, a 64-hex implicit account and a 0x EVM address, keep their start and end so a reader can still compare them.
export function displayAccount(account: string): string {
  if (/^[0-9a-f]{64}$/.test(account)) return `${account.slice(0, 6)}…${account.slice(-4)}`
  if (/^0x[0-9a-fA-F]{40}$/.test(account)) return `${account.slice(0, 6)}…${account.slice(-4)}`
  return account
}

/** One letter for the avatar: the first letter or digit of the account (after a 0x prefix). */
export function initial(account: string): string {
  const name = account.replace(/^0x/i, '')
  return (/[a-z0-9]/i.exec(name)?.[0] ?? '?').toUpperCase()
}
