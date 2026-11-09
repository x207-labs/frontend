// Batch 3 F4 (review BE-063): content security policy for the production build. The voucher key lives in the DOM and in React state, so any script running on the page could read it and
// sign anything: scripts only from our own origin, connections only to the read API, broker, NEAR RPC, and the wallet origins named in the config. `frame-ancestors` and
// `X-Content-Type-Options` cannot go through a meta element: both are host server headers (see docs/security-review.md).
// Acknowledged limit: the wallet (`@hot-labs/near-connect`) loads a manifest and executors from the network; its origins are filled via VITE_X207_WALLET_ORIGINS and wallet login must be tried on
// testnet before release. `VITE_X207_CSP=off` disables this policy as a temporary escape hatch.
type Env = Record<string, string | undefined>

const origin = (value: string | undefined): string | null => {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    return null
  }
}

// FE-038: NEAR Connect (@hot-labs/near-connect 0.12.0) fetches its wallet manifest when the connector is created (the two URLs are hard-coded in NearConnector.js) and the wallet
// chooser shows the icons that the manifest lists. Without these origins the chooser opens with no wallet but the built-in one and the console shows CSP errors. Only the chooser is
// covered: a wallet executor runs in a sandboxed srcdoc iframe that inherits this policy, so signing in still needs a CSP decision (see docs/security-review.md).
export const NEAR_CONNECT_MANIFEST_ORIGINS = ['https://raw.githubusercontent.com', 'https://cdn.jsdelivr.net']
export const NEAR_CONNECT_ICON_ORIGINS = [
  'https://raw.githubusercontent.com', 'https://app.hot-labs.org', 'https://evm-on-near.dev', 'https://res.cloudinary.com', 'https://storage.herewallet.app', 'https://www.mynearwallet.com',
]

// FE-041: the circle picker (config.ts CIRCLE_OPTIONS) switches the read API at run time, so a build that points at one of these APIs may also connect to the others.
// FE-045: follows CIRCLE_OPTIONS (v018 and v017 in, v016 out: it has no host).
export const CIRCLE_API_ORIGINS = ['https://v018.x207.boxd.sh', 'https://v017.x207.boxd.sh', 'https://v015.x207.boxd.sh', 'https://v014.x207.boxd.sh', 'https://x207.boxd.sh']

export const PRIVY_ORIGIN = 'https://auth.privy.io'
export const ACCOUNT_SERVICE_ORIGIN = 'https://vldhsabgpfxccsljdtye.supabase.co'

export function buildCsp(env: Env, nonce?: string): string {
  const rpc = env.VITE_NEAR_RPC_URL ?? (env.VITE_NEAR_NETWORK === 'mainnet' ? 'https://rpc.mainnet.fastnear.com' : 'https://rpc.testnet.fastnear.com')
  const connect = new Set<string>(["'self'"])
  // The default broker is a local one (config.ts): it is only allowed when the API is local too (or not given); a hosted build with no broker does not open a connection to the visitor's own machine.
  const api = origin(env.VITE_X207_API_URL ?? 'http://localhost:8787')
  const localApi = api === null || ['localhost', '127.0.0.1', '[::1]'].includes(new URL(api).hostname)
  const broker = env.VITE_X207_BROKER_URL ?? (localApi ? 'http://localhost:8788' : undefined)
  for (const url of [env.VITE_X207_API_URL ?? 'http://localhost:8787', broker, rpc]) {
    const o = origin(url)
    if (o) connect.add(o)
  }
  if (api !== null && CIRCLE_API_ORIGINS.includes(api)) for (const o of CIRCLE_API_ORIGINS) connect.add(o)
  for (const raw of (env.VITE_X207_WALLET_ORIGINS ?? '').split(/[\s,]+/).filter(Boolean)) {
    const o = origin(raw)
    if (o) connect.add(o)
  }
  for (const o of NEAR_CONNECT_MANIFEST_ORIGINS) connect.add(o)
  // FE-059: the Privy wallet talks to the Privy API and loads its key frame from the same host; both are opened only when the build has a Privy app id.
  const privy = env.VITE_PRIVY_APP_ID?.trim() // FE-066: the Client ID is optional
  if (privy) connect.add(PRIVY_ORIGIN)
  connect.add(ACCOUNT_SERVICE_ORIGIN) // FE-068: the account service (Supabase Edge Function x207-account)
  return [
    "default-src 'self'",
    ...(privy ? [`frame-src ${PRIVY_ORIGIN}`] : []),
    `script-src 'self' 'wasm-unsafe-eval'${nonce ? ` 'nonce-${nonce}'` : ''}`,
    `connect-src ${[...connect].join(' ')}`,
    `img-src 'self' data: ${NEAR_CONNECT_ICON_ORIGINS.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

/** Meta element added to index.html at build; the index.html policy still applies alongside it (the strictest wins). */
export const cspMeta = (csp: string): string => `<meta http-equiv="Content-Security-Policy" content="${csp.replaceAll('"', '&quot;')}" />`
