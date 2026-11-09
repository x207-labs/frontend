import type { FunctionCallTx, SignMessageInput, WalletPort } from '../wallet/types'

export type RecordedTx = FunctionCallTx & { signerId: string; network: string }

// FX-FE-1: fake wallet that records transactions and can approve or reject.
export type MockWallet = WalletPort & {
  txs: RecordedTx[]
  messages: Array<SignMessageInput & { signerId: string }>
  rejectNext: boolean
  /** FE-061: the next signAndSend throws this text (a contract failure that the wallet reports), once. */
  failNextWith: string | null
  connectCalls: number
}

export function createMockWallet(account = 'scraper.x207-circle.near', restored: string | null = null): MockWallet {
  const wallet: MockWallet = {
    network: 'testnet',
    txs: [],
    messages: [],
    rejectNext: false,
    failNextWith: null,
    connectCalls: 0,
    restore: async () => restored,
    connect: async () => {
      wallet.connectCalls += 1
      return account
    },
    disconnect: async () => undefined,
    signAndSend: async (signerId, tx) => {
      if (wallet.rejectNext) {
        wallet.rejectNext = false
        throw new Error('User rejected the request')
      }
      if (wallet.failNextWith !== null) {
        const text = wallet.failNextWith
        wallet.failNextWith = null
        throw new Error(text)
      }
      wallet.txs.push({ ...tx, signerId, network: wallet.network })
      return { hash: `hash${wallet.txs.length}` }
    },
    signMessage: async (signerId, input) => {
      if (wallet.rejectNext) {
        wallet.rejectNext = false
        throw new Error('User rejected the request')
      }
      wallet.messages.push({ ...input, signerId })
      return { accountId: signerId, publicKey: 'ed25519:MOCKKEY', signature: `sig${wallet.messages.length}` }
    },
  }
  return wallet
}
