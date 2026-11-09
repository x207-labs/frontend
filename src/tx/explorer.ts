import { NEAR_NETWORK } from '../config'

/** NEAR block explorer page of a transaction (testnet unless the build is for mainnet). */
export function explorerTxUrl(hash: string, network: 'testnet' | 'mainnet' = NEAR_NETWORK): string {
  return `${network === 'mainnet' ? 'https://nearblocks.io' : 'https://testnet.nearblocks.io'}/txns/${hash}`
}
