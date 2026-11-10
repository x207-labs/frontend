import type { NearConnector } from '@hot-labs/near-connect'
import { NEAR_NETWORK } from '../config'
import { outcomeFailure } from '../tx/outcome'
import { privyEnabled } from './privyConfig'
import { buildManifest } from './privyManifest'
import type { WalletPort } from './types'

const CONNECTED_FLAG = 'x207.wallet.connected'

function remember(connected: boolean) {
  try {
    if (connected) localStorage.setItem(CONNECTED_FLAG, '1')
    else localStorage.removeItem(CONNECTED_FLAG)
  } catch {
    // Without storage, the session simply does not survive a reload.
  }
}

function wasConnected(): boolean {
  try {
    return localStorage.getItem(CONNECTED_FLAG) === '1'
  } catch {
    return false
  }
}

// Set at build (vite.config.ts) for the production build only; the CSP allows scripts that carry it, which the wallet executors need (srcdoc iframes inherit the policy).
declare const __X207_CSP_NONCE__: string | undefined

let connector: Promise<NearConnector> | undefined

// NearConnector fetches the wallet manifest from the network when created, so it is only created
// when the user logs in or has a session. Read pages still only call the read API.
function getConnector(): Promise<NearConnector> {
  connector ??= Promise.all([
    import('@hot-labs/near-connect'),
    // FE-059: with the Privy ids set, the wallet list is the library's list plus the Privy wallet; without them `manifest` stays unset and nothing changes.
    buildManifest({ enabled: privyEnabled, origin: window.location.origin }),
  ]).then(
    ([{ NearConnector }, manifest]) =>
      new NearConnector({ network: NEAR_NETWORK, cspNonce: typeof __X207_CSP_NONCE__ === 'string' ? __X207_CSP_NONCE__ : undefined, ...(manifest ? { manifest: manifest as unknown as NonNullable<ConstructorParameters<typeof NearConnector>[0]>['manifest'] } : {}) }),
  )
  return connector
}

export const nearConnectPort: WalletPort = {
  network: NEAR_NETWORK,

  async restore() {
    if (!wasConnected()) return null
    const c = await getConnector()
    try {
      const { accounts } = await c.getConnectedWallet()
      return accounts[0]?.accountId ?? null
    } catch {
      remember(false)
      return null
    }
  },

  async connect() {
    const c = await getConnector()
    const wallet = await c.connect()
    const accounts = await wallet.getAccounts()
    const accountId = accounts[0]?.accountId
    if (!accountId) throw new Error('Wallet did not provide an account')
    remember(true)
    return accountId
  },

  async disconnect() {
    remember(false)
    const c = await getConnector()
    await c.disconnect()
  },

  async signAndSend(signerId, tx) {
    const c = await getConnector()
    const wallet = await c.wallet()
    const outcome = await wallet.signAndSendTransaction({
      network: NEAR_NETWORK,
      signerId,
      receiverId: tx.receiverId,
      actions: [
        {
          type: 'FunctionCall',
          params: { methodName: tx.methodName, args: tx.args, gas: tx.gas, deposit: tx.deposit },
        },
      ],
    })
    // FE-061: a call the contract refused still comes back as an outcome; it must not look like a confirmed transaction.
    const failure = outcomeFailure(outcome)
    if (failure) throw new Error(failure)
    return { hash: outcome.transaction.hash }
  },

  async signMessage(signerId, input) {
    const c = await getConnector()
    const wallet = await c.wallet()
    // FE-101: NEAR Connect passes the call to the wallet whatever its manifest says, and each wallet words its refusal its own way. A wallet whose manifest says it
    // cannot sign messages is told apart here, in words the account features recognise (useAccount.ts `UNSUPPORTED`).
    if (wallet.manifest?.features?.signMessage === false) throw new Error(`${wallet.manifest.name ?? 'This wallet'} does not support signing messages`)
    return wallet.signMessage({
      message: input.message,
      recipient: input.recipient,
      nonce: input.nonce,
      network: NEAR_NETWORK,
      signerId,
    })
  },
}
