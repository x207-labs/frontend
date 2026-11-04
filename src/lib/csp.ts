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

export function buildCsp(env: Env): string {
  const rpc = env.VITE_NEAR_RPC_URL ?? (env.VITE_NEAR_NETWORK === 'mainnet' ? 'https://rpc.mainnet.fastnear.com' : 'https://rpc.testnet.fastnear.com')
  const connect = new Set<string>(["'self'"])
  for (const url of [env.VITE_X207_API_URL ?? 'http://localhost:8787', env.VITE_X207_BROKER_URL ?? 'http://localhost:8788', rpc]) {
    const o = origin(url)
    if (o) connect.add(o)
  }
  for (const raw of (env.VITE_X207_WALLET_ORIGINS ?? '').split(/[\s,]+/).filter(Boolean)) {
    const o = origin(raw)
    if (o) connect.add(o)
  }
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    `connect-src ${[...connect].join(' ')}`,
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

/** Meta element added to index.html at build; the index.html policy still applies alongside it (the strictest wins). */
export const cspMeta = (csp: string): string => `<meta http-equiv="Content-Security-Policy" content="${csp.replaceAll('"', '&quot;')}" />`
