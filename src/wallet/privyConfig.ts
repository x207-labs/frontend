// FE-059: the Privy app credentials. Both are public client identifiers (they ship in the page), not secrets. They are the owner's to create in the Privy dashboard;
// until they exist the Privy wallet is simply not offered.
const env = import.meta.env

export const PRIVY_APP_ID: string = (env.VITE_PRIVY_APP_ID as string | undefined)?.trim() ?? ''
export const PRIVY_APP_CLIENT_ID: string = (env.VITE_PRIVY_APP_CLIENT_ID as string | undefined)?.trim() ?? ''

export const privyEnabled: boolean = PRIVY_APP_ID !== '' && PRIVY_APP_CLIENT_ID !== ''
