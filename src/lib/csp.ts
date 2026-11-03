// Batch 3 F4 (review BE-063): kebijakan keamanan konten untuk build produksi. Kunci voucher ada di DOM dan di state React, jadi satu skrip yang jalan di halaman bisa membacanya dan
// menandatangani apa saja: skrip hanya dari origin sendiri, sambungan hanya ke read API, broker, RPC NEAR, dan origin wallet yang disebut di konfigurasi. `frame-ancestors` dan
// `X-Content-Type-Options` tidak bisa lewat elemen meta: keduanya header server host (lihat docs/security-review.md).
// Batas yang diakui: wallet (`@hot-labs/near-connect`) memuat manifest dan eksekutor dari jaringan; origin-nya diisi lewat VITE_X207_WALLET_ORIGINS dan login wallet harus dicoba di
// testnet sebelum rilis. `VITE_X207_CSP=off` mematikan kebijakan ini untuk jalan keluar sementara.
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

/** Elemen meta yang ditambahkan ke index.html pada build; kebijakan dari index.html tetap berlaku bersamanya (yang paling ketat menang). */
export const cspMeta = (csp: string): string => `<meta http-equiv="Content-Security-Policy" content="${csp.replaceAll('"', '&quot;')}" />`
