import type { NearConnector } from '@hot-labs/near-connect'
import { NEAR_NETWORK } from '../config'
import type { WalletPort } from './types'

const CONNECTED_FLAG = 'x207.wallet.connected'

function remember(connected: boolean) {
  try {
    if (connected) localStorage.setItem(CONNECTED_FLAG, '1')
    else localStorage.removeItem(CONNECTED_FLAG)
  } catch {
    // Tanpa penyimpanan, sesi hanya tidak bertahan setelah reload.
  }
}

function wasConnected(): boolean {
  try {
    return localStorage.getItem(CONNECTED_FLAG) === '1'
  } catch {
    return false
  }
}

let connector: Promise<NearConnector> | undefined

// NearConnector mengambil manifest wallet dari jaringan saat dibuat, jadi baru dibuat
// bila pengguna login atau punya sesi. Halaman baca tetap hanya memanggil read API.
function getConnector(): Promise<NearConnector> {
  connector ??= import('@hot-labs/near-connect').then(
    ({ NearConnector }) => new NearConnector({ network: NEAR_NETWORK }),
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
    if (!accountId) throw new Error('Wallet tidak memberikan akun')
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
    return { hash: outcome.transaction.hash }
  },
}
