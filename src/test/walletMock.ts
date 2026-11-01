import type { FunctionCallTx, WalletPort } from '../wallet/types'

export type RecordedTx = FunctionCallTx & { signerId: string; network: string }

// FX-FE-1: wallet palsu yang mencatat transaksi dan bisa menyetujui atau menolak.
export type MockWallet = WalletPort & {
  txs: RecordedTx[]
  rejectNext: boolean
  connectCalls: number
}

export function createMockWallet(account = 'scraper.x207-circle.near', restored: string | null = null): MockWallet {
  const wallet: MockWallet = {
    network: 'testnet',
    txs: [],
    rejectNext: false,
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
      wallet.txs.push({ ...tx, signerId, network: wallet.network })
      return { hash: `hash${wallet.txs.length}` }
    },
  }
  return wallet
}
