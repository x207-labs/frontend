import { NEAR_NETWORK } from '../config'

/** What the network is called on this build, and what its money is called: a testnet circle always says its token is a mock. */
export const NETWORK_NAME = NEAR_NETWORK === 'mainnet' ? 'NEAR mainnet' : 'NEAR testnet'
export const MONEY = NEAR_NETWORK === 'mainnet' ? 'USDT' : 'mock USDT'
