import { NEAR_NETWORK } from '../config'
import type { WalletPort } from './types'

/** FE-081: the account the fixtures sign in as. It is a member of the fixture circle and has invoices, orders, grants and debt, so every list has rows. */
export const FIXTURE_ACCOUNT = 'scraper.x207-circle.near'
/** A connection marker like the real wallet's, with no secret in it: only "1" while the demo account is signed in, for this tab. */
const CONNECTED_FLAG = 'x207.fixture-signed-in'

const remember = (on: boolean) => {
  try {
    if (on) sessionStorage.setItem(CONNECTED_FLAG, '1')
    else sessionStorage.removeItem(CONNECTED_FLAG)
  } catch {
    // private window or blocked storage: the demo sign-in just does not survive a reload
  }
}
const remembered = () => {
  try {
    return sessionStorage.getItem(CONNECTED_FLAG) === '1'
  } catch {
    return false
  }
}

/**
 * FE-081: wallet of the fixture mode (VITE_X207_USE_FIXTURES, local only). "Sign in" signs in as the demo account at once, so the signed-in pages and
 * their lists can be seen without a wallet; the signed-out pages stay visible until then. Nothing is ever signed or sent: both sign calls refuse.
 */
export const fixtureWalletPort: WalletPort = {
  network: NEAR_NETWORK,
  async restore() {
    return remembered() ? FIXTURE_ACCOUNT : null
  },
  async connect() {
    remember(true)
    return FIXTURE_ACCOUNT
  },
  async disconnect() {
    remember(false)
  },
  async signAndSend() {
    throw new Error('Fixture mode: transactions are not signed. Run against the read API with a real wallet to send one.')
  },
  async signMessage() {
    throw new Error('Fixture mode: messages are not signed. Run against the read API with a real wallet to sign one.')
  },
}
