import { DEPLOYMENTS } from './deployments.generated'

const env = import.meta.env

export type CircleOption = { key: string; label: string; contract: string; apiUrl: string }

/** UM-208: the label of a circle in the picker. The active circle is the "main circle"; the others show their note from deployments.json. */
export function circleLabel(c: { key: string; contract: string; interface: string; note: string }, active: string): string {
  return `${c.contract.replace(/\.testnet$/, '')} (${c.key === active ? `main circle, ${c.interface}` : c.note})`
}

/**
 * FE-041: circles that have a public read API. The picker only exists where the build points at one of these (the deployed dashboard).
 * UM-208: the list and the active circle come from `deployments.generated.ts`, a copy of the umbrella's `docs/deployments.json` written by
 * `npm run sync:deployments`; do not list circles here. A circle without a read API host (v016) is not offered.
 */
export const CIRCLE_OPTIONS: readonly CircleOption[] = DEPLOYMENTS.circles.flatMap((c) =>
  c.apiUrl === null ? [] : [{ key: c.key, label: circleLabel(c, DEPLOYMENTS.active), contract: c.contract, apiUrl: c.apiUrl }],
)
export type CircleKey = string
export const ACTIVE_CIRCLE: CircleOption = CIRCLE_OPTIONS.find((o) => o.key === DEPLOYMENTS.active) ?? CIRCLE_OPTIONS[0]

const ENV_API_URL: string = env.VITE_X207_API_URL ?? 'http://localhost:8787'
const ENV_CONTRACT_ID: string = env.VITE_X207_CONTRACT_ID ?? 'x207-circle.testnet'
export const CIRCLE_PICKER = CIRCLE_OPTIONS.some((o) => o.apiUrl === ENV_API_URL)
// UM-208: on a hosted build (the read API is one of the circles) `?circle=` picks a circle, and without it the dashboard opens on the active
// circle of deployments.json, whatever circle VITE_X207_API_URL names. A local build (any other API) keeps its own API and contract.
const fromQuery = CIRCLE_PICKER ? CIRCLE_OPTIONS.find((o) => o.key === new URLSearchParams(globalThis.location?.search ?? '').get('circle')) : undefined
const chosen = CIRCLE_PICKER ? (fromQuery ?? ACTIVE_CIRCLE) : undefined
export const SELECTED_CIRCLE: CircleKey | null = chosen?.key ?? null

export const API_URL: string = chosen?.apiUrl ?? ENV_API_URL

export const CIRCLE: string = env.VITE_X207_CIRCLE ?? 'agents-main'
export const POLL_MS = Number(env.VITE_X207_POLL_MS ?? 5000)
export const USE_FIXTURES = env.VITE_X207_USE_FIXTURES === 'true'
export const NEAR_NETWORK: 'testnet' | 'mainnet' =
  env.VITE_NEAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
export const CONTRACT_ID: string = chosen?.contract ?? ENV_CONTRACT_ID

/**
 * FE-110: the NEP-141 USDT token and the NEAR Intents contract of each network. The testnet circles use the mock token that anyone may mint.
 * The circle contract names both itself (`get_circle`, see `wallet/circleTokens.ts`); these values are the fallback when that view cannot be read.
 */
export const NETWORK_TOKENS = {
  testnet: { usdt: 'usdt.x207-deployer.testnet', intents: 'intents.testnet' },
  mainnet: { usdt: 'usdt.tether-token.near', intents: 'intents.near' },
} as const
export type TokenIds = { usdt: string; intents: string }
type TokenEnv = { VITE_X207_USDT_TOKEN_ID?: string; VITE_X207_INTENTS_ID?: string }
/** The network default, unless `VITE_X207_USDT_TOKEN_ID` / `VITE_X207_INTENTS_ID` name another account (an empty value counts as unset). */
export function tokenConfig(network: 'testnet' | 'mainnet', vars: TokenEnv): TokenIds {
  return {
    usdt: vars.VITE_X207_USDT_TOKEN_ID?.trim() || NETWORK_TOKENS[network].usdt,
    intents: vars.VITE_X207_INTENTS_ID?.trim() || NETWORK_TOKENS[network].intents,
  }
}
export const TOKENS: TokenIds = tokenConfig(NEAR_NETWORK, { VITE_X207_USDT_TOKEN_ID: env.VITE_X207_USDT_TOKEN_ID, VITE_X207_INTENTS_ID: env.VITE_X207_INTENTS_ID })
export const INTENTS_EXPLORER_URL: string =
  env.VITE_X207_INTENTS_EXPLORER_URL ?? 'https://explorer.near-intents.org/transactions/'
/** NEAR RPC for contract views (Intents balance, intents, pair list). Default: FastNEAR matching `VITE_NEAR_NETWORK`. */
export const NEAR_RPC_URL: string =
  env.VITE_NEAR_RPC_URL ?? (NEAR_NETWORK === 'mainnet' ? 'https://rpc.mainnet.fastnear.com' : 'https://rpc.testnet.fastnear.com')
/** Access rental broker (BE-060): the provider's broker server address, not the read API. */
// FE-097: same rule as csp.ts: the local default broker only goes with a local API. A hosted build with no broker has none (null), so the rental page says so instead of
// trying the visitor's own machine, which the production policy blocks.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']
const apiIsLocal = (() => {
  try {
    return LOCAL_HOSTS.includes(new URL(ENV_API_URL).hostname)
  } catch {
    return true
  }
})()
export const BROKER_URL: string | null = env.VITE_X207_BROKER_URL ?? (apiIsLocal ? 'http://localhost:8788' : null)
/** FE-041: the guide for agents that hold only a `0x` key. FE-072: the app's own Help, never GitHub. */
export const EVM_GUIDE_URL = '/help#term-evm'
