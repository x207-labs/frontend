// FE-059: the Privy wallet (Google or email login) as one more entry of the NEAR Connect wallet list. The list is the library's own list plus this entry, so the other wallets stay.
// Without VITE_PRIVY_APP_ID and VITE_PRIVY_APP_CLIENT_ID the entry is left out and the connector behaves as before.

/** The wallet id of the entry; `connector.connect({ walletId })` uses it. */
export const PRIVY_WALLET_ID = 'x207privy'

/**
 * The executor is code that NEAR Connect downloads and runs in a sandboxed iframe at run time, with no integrity check, so the URL is pinned to one commit of the `release` branch of
 * beneviolabs/privy-near-connect (a branch URL would run whatever is pushed there next). The built file at this commit was read in full on 2026-11-09 (docs/privy-executor-review.md).
 * Move the commit deliberately: read the new executor.js, update the review note, change the constant.
 */
export const PRIVY_EXECUTOR_COMMIT = '9a149fcb319b9208557452a1ea1287a0e4877c6c'
export const PRIVY_EXECUTOR_URL = `https://raw.githubusercontent.com/beneviolabs/privy-near-connect/${PRIVY_EXECUTOR_COMMIT}/executor.js`

// The two places where @hot-labs/near-connect 0.12.0 looks for its default wallet list (the same two URLs the CSP allows).
export const DEFAULT_MANIFEST_URLS = [
  'https://raw.githubusercontent.com/hot-dao/near-selector/refs/heads/main/repository/manifest.json',
  'https://cdn.jsdelivr.net/gh/azbang/hot-connector/repository/manifest.json',
]

export type WalletManifestEntry = Record<string, unknown> & { id: string }
export type WalletManifest = { version: string; wallets: WalletManifestEntry[] }

/** The manifest entry of the Privy wallet for the app served at `origin` (its `/sign` page is the signing screen). */
export function privyWalletEntry(origin: string): WalletManifestEntry {
  return {
    id: PRIVY_WALLET_ID,
    name: 'Email or Google',
    icon: `${origin}/favicon.svg`,
    description: 'A NEAR wallet behind an email or Google login. Powered by Privy.',
    website: origin,
    version: '1.0.0',
    executor: PRIVY_EXECUTOR_URL,
    type: 'sandbox',
    platform: { web: origin },
    features: {
      signMessage: true,
      signInWithoutAddKey: true,
      signInAndSignMessage: true,
      signInWithFunctionCallKey: false,
      signAndSendTransaction: true,
      signAndSendTransactions: true,
      mainnet: false,
      testnet: true,
    },
    permissions: { isPrivyConnect: true, storage: true, allowsOpen: [origin] },
    metadata: { signPageURL: `${origin}/sign`, debug: false },
  }
}

async function loadDefaultWallets(fetchImpl: typeof fetch): Promise<WalletManifestEntry[]> {
  for (const url of DEFAULT_MANIFEST_URLS) {
    try {
      const res = await fetchImpl(url)
      if (!res.ok) continue
      const json = (await res.json()) as Partial<WalletManifest>
      if (Array.isArray(json.wallets)) return json.wallets
    } catch {
      // try the next place
    }
  }
  return []
}

/**
 * The manifest to give NearConnector, or `undefined` when the Privy wallet is off (then the connector loads its own list as it always did).
 * When it is on: the library's wallets plus the Privy entry. If the library's list cannot be fetched, the Privy entry stands alone and the chooser still opens.
 */
export async function buildManifest(options: { enabled: boolean; origin: string; fetchImpl?: typeof fetch }): Promise<WalletManifest | undefined> {
  if (!options.enabled) return undefined
  const defaults = await loadDefaultWallets(options.fetchImpl ?? fetch)
  return { version: '1.0.0', wallets: [...defaults.filter((w) => w.id !== PRIVY_WALLET_ID), privyWalletEntry(options.origin)] }
}
