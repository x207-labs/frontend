const env = import.meta.env

export const API_URL: string = env.VITE_X207_API_URL ?? 'http://localhost:8787'
export const CIRCLE: string = env.VITE_X207_CIRCLE ?? 'agents-main'
export const POLL_MS = Number(env.VITE_X207_POLL_MS ?? 5000)
export const USE_FIXTURES = env.VITE_X207_USE_FIXTURES === 'true'
export const NEAR_NETWORK: 'testnet' | 'mainnet' =
  env.VITE_NEAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
export const CONTRACT_ID: string = env.VITE_X207_CONTRACT_ID ?? 'x207-circle.testnet'
export const INTENTS_EXPLORER_URL: string =
  env.VITE_X207_INTENTS_EXPLORER_URL ?? 'https://explorer.near-intents.org/transactions/'
/** RPC NEAR untuk view kontrak (saldo Intents, intent, daftar pasangan). Bawaan: FastNEAR sesuai `VITE_NEAR_NETWORK`. */
export const NEAR_RPC_URL: string =
  env.VITE_NEAR_RPC_URL ?? (NEAR_NETWORK === 'mainnet' ? 'https://rpc.mainnet.fastnear.com' : 'https://rpc.testnet.fastnear.com')
/** Broker sewa akses (BE-060): alamat server broker pemberi, bukan read API. */
export const BROKER_URL: string = env.VITE_X207_BROKER_URL ?? 'http://localhost:8788'
