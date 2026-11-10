import { NEAR_NETWORK } from '../config'
import { base58Encode } from '../lib/barter'
import { FIXTURE_ACCOUNT } from '../wallet/fixtureWallet'
import type { WalletPort } from '../wallet/types'
import { recordDemoTx } from './db'
import { demoSignedOut, setDemoSignedOut } from './mode'

/** The account the demo signs in as: the fixture member with invoices, orders, grants and debt, so every page has rows. */
export const DEMO_ACCOUNT = FIXTURE_ACCOUNT

const randomBase58 = (bytes: number) => base58Encode(crypto.getRandomValues(new Uint8Array(bytes)))

/**
 * FE-100: wallet of demo mode. It is signed in from the start (until the visitor signs out), and its "signatures" are random bytes:
 * a transaction is only written to the demo `txs` table with a demo hash, and a signed message carries no real key. The network guard
 * keeps all of it inside the tab, so nothing it returns can reach a chain or a server.
 */
export const demoWalletPort: WalletPort = {
  network: NEAR_NETWORK,
  async restore() {
    return demoSignedOut() ? null : DEMO_ACCOUNT
  },
  async connect() {
    setDemoSignedOut(false)
    return DEMO_ACCOUNT
  },
  async disconnect() {
    setDemoSignedOut(true)
  },
  async signAndSend(signerId, tx) {
    const hash = `demo${randomBase58(28)}`
    recordDemoTx({ hash, signer: signerId, receiverId: tx.receiverId, methodName: tx.methodName, at: new Date().toISOString() })
    return { hash }
  },
  async signMessage(signerId) {
    return { accountId: signerId, publicKey: `ed25519:${randomBase58(32)}`, signature: `ed25519:${randomBase58(64)}` }
  },
}
