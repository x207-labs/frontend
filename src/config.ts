const env = import.meta.env

/**
 * FE-041: circles that have a public read API. The picker only exists where the build points at one of these (the deployed dashboard).
 * FE-045: v018 (contract 0.0.18, account sales through a locker) is the main circle; v013 stays as the circle of the epoch 8 history. v016 has no read API host
 * (the circle was never deployed to boxd), so it is not offered: add it back only when its host answers.
 */
export const CIRCLE_OPTIONS = [
  { key: 'v018', label: 'x207-v018 (main circle, 0.0.18)', contract: 'x207-v018.testnet', apiUrl: 'https://v018.x207.boxd.sh' },
  { key: 'v017', label: 'x207-v017 (auto-settle, relayer fee)', contract: 'x207-v017.testnet', apiUrl: 'https://v017.x207.boxd.sh' },
  { key: 'v015', label: 'x207-v015 (auto-settle)', contract: 'x207-v015.testnet', apiUrl: 'https://v015.x207.boxd.sh' },
  { key: 'v014', label: 'x207-v014 (EVM agents)', contract: 'x207-v014.testnet', apiUrl: 'https://v014.x207.boxd.sh' },
  { key: 'v013', label: 'x207-v013 (history, epoch 8)', contract: 'x207-v013.testnet', apiUrl: 'https://x207.boxd.sh' },
] as const
export type CircleKey = (typeof CIRCLE_OPTIONS)[number]['key']

const ENV_API_URL: string = env.VITE_X207_API_URL ?? 'http://localhost:8787'
const ENV_CONTRACT_ID: string = env.VITE_X207_CONTRACT_ID ?? 'x207-circle.testnet'
export const CIRCLE_PICKER = CIRCLE_OPTIONS.some((o) => o.apiUrl === ENV_API_URL)
const chosen = CIRCLE_PICKER ? CIRCLE_OPTIONS.find((o) => o.key === new URLSearchParams(globalThis.location?.search ?? '').get('circle')) : undefined
export const SELECTED_CIRCLE: CircleKey | null = chosen?.key ?? (CIRCLE_PICKER ? (CIRCLE_OPTIONS.find((o) => o.apiUrl === ENV_API_URL)?.key ?? null) : null)

export const API_URL: string = chosen?.apiUrl ?? ENV_API_URL

export const CIRCLE: string = env.VITE_X207_CIRCLE ?? 'agents-main'
export const POLL_MS = Number(env.VITE_X207_POLL_MS ?? 5000)
export const USE_FIXTURES = env.VITE_X207_USE_FIXTURES === 'true'
export const NEAR_NETWORK: 'testnet' | 'mainnet' =
  env.VITE_NEAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
export const CONTRACT_ID: string = chosen?.contract ?? ENV_CONTRACT_ID
export const INTENTS_EXPLORER_URL: string =
  env.VITE_X207_INTENTS_EXPLORER_URL ?? 'https://explorer.near-intents.org/transactions/'
/** NEAR RPC for contract views (Intents balance, intents, pair list). Default: FastNEAR matching `VITE_NEAR_NETWORK`. */
export const NEAR_RPC_URL: string =
  env.VITE_NEAR_RPC_URL ?? (NEAR_NETWORK === 'mainnet' ? 'https://rpc.mainnet.fastnear.com' : 'https://rpc.testnet.fastnear.com')
/** Access rental broker (BE-060): the provider's broker server address, not the read API. */
export const BROKER_URL: string = env.VITE_X207_BROKER_URL ?? 'http://localhost:8788'
/** FE-041: the guide for agents that hold only a `0x` key. FE-072: the app's own Help, never GitHub. */
export const EVM_GUIDE_URL = '/help#term-evm'
