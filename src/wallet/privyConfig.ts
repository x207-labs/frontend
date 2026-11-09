// FE-059: the Privy app identifiers. Both are public (they ship in the page), not secrets. The App ID is the owner's to create in the Privy dashboard; until it exists
// the Privy wallet is simply not offered. FE-066: the Client ID is optional (`clientId?` in @privy-io/js-sdk-core) and is only sent when set. The Privy App Secret
// is a server credential and must never be put in a VITE_* variable or used in this app.
const env = import.meta.env

export const PRIVY_APP_ID: string = (env.VITE_PRIVY_APP_ID as string | undefined)?.trim() ?? ''
export const PRIVY_APP_CLIENT_ID: string = (env.VITE_PRIVY_APP_CLIENT_ID as string | undefined)?.trim() ?? ''

export const privyEnabled: boolean = PRIVY_APP_ID !== ''

/** Options for `new Privy({...})`: `clientId` only when the env has one. */
export const privyClientOptions = (): { appId: string; clientId?: string } => ({
  appId: PRIVY_APP_ID,
  ...(PRIVY_APP_CLIENT_ID !== '' ? { clientId: PRIVY_APP_CLIENT_ID } : {}),
})
