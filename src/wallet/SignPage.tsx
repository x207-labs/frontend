import { Buffer } from 'buffer'
import Privy, { LocalStorage, create as createWallet } from '@privy-io/js-sdk-core'
import { SignPagePlugin } from '@peerfolio/privy-near-connect/sign-page-plugin'
import type { SignPageProps } from '@peerfolio/privy-near-connect/sign-page-plugin'
import '@radix-ui/themes/styles.css'
import '@peerfolio/privy-near-connect/sign-page-plugin/theme.css'
import { PRIVY_APP_CLIENT_ID, PRIVY_APP_ID, privyEnabled } from './privyConfig'
import { PrivySignFlow, type PluginProps } from './PrivySignFlow'
import type { PrivyLike } from './privyLogin'

// @privy-io/js-sdk-core expects Buffer as a global in the browser.
;(globalThis as Record<string, unknown>).Buffer ??= Buffer

// Built once, when the page loads. Not built at all without the Privy ids (the route then explains that the wallet is off).
const privy = privyEnabled ? new Privy({ appId: PRIVY_APP_ID, clientId: PRIVY_APP_CLIENT_ID, storage: new LocalStorage() }) : null

function Plugin({ origin }: PluginProps) {
  // Only the app's own origin may ask this page to sign.
  return <SignPagePlugin privy={privy as unknown as SignPageProps['privy']} options={{ allowedOrigins: [origin] }} theme={{ accentColor: 'blue', appearance: 'light' }} />
}

/** The `/sign` route: NEAR Connect opens it in a popup for the Privy wallet (FE-059). */
export default function SignPage() {
  if (!privy) {
    return (
      <main className="privy-sign">
        <h1>Email and Google sign-in is not set up</h1>
        <p>This build has no Privy app id. Close this window and choose another wallet.</p>
      </main>
    )
  }
  const client = privy
  return (
    <PrivySignFlow
      privy={client as unknown as PrivyLike}
      createNearWallet={() =>
        createWallet({ fetchPrivyRoute: client.fetchPrivyRoute.bind(client), getCompiledPath: client.getCompiledPath.bind(client), app: { appId: client.app.appId } }, { request: { chain_type: 'near' } })
      }
      Plugin={Plugin}
    />
  )
}
