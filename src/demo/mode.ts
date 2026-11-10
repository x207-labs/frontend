import { base58Encode } from '../lib/barter'

/**
 * FE-100: demo mode. A visitor switches it on (the Demo switch in the top bar, or `?demo=1` in a link) and the dashboard runs on sample
 * data kept in this tab only. Nothing reaches the read API, the NEAR RPC, the account service or the broker while it is on (network.ts),
 * and the wallet is a demo wallet that signs nothing real (wallet.ts). Off again (`?demo=0` or the switch) wipes the demo tables.
 *
 * Everything it keeps lives in sessionStorage under the `x207.demo` prefix (the demo voucher key is not kept at all), so it is separate from the real account cache and onboarding keys
 * and is gone when the tab closes.
 */
export const DEMO_FLAG = 'x207.demo'
/** The demo tables (db.ts). */
export const DEMO_DB_KEY = 'x207.demo.db'
/** "1" after the visitor signs out of the demo account; signed in otherwise. */
export const DEMO_SIGNED_OUT = 'x207.demo.signed-out'
const ALL_KEYS = [DEMO_FLAG, DEMO_DB_KEY, DEMO_SIGNED_OUT]

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}
/** Private window or blocked storage: demo mode then lasts for this page load only. */
function guarded(run: () => void): void {
  try {
    run()
  } catch {
    // nothing to keep
  }
}
const forget = (key: string) => guarded(() => sessionStorage.removeItem(key))

/** `?demo=1` / `?demo=on` turns demo mode on, `?demo=0` / `?demo=off` turns it off; any other value or none leaves it as it is. */
export function demoFromQuery(search: string): boolean | null {
  const value = new URLSearchParams(search).get('demo')
  if (value === '1' || value === 'on') return true
  if (value === '0' || value === 'off') return false
  return null
}

function remember(on: boolean): void {
  if (on) guarded(() => sessionStorage.setItem(DEMO_FLAG, '1'))
  else for (const key of ALL_KEYS) forget(key)
}

function resolve(): boolean {
  if (typeof window === 'undefined') return false
  const asked = demoFromQuery(window.location.search)
  if (asked !== null) remember(asked)
  return asked ?? read(DEMO_FLAG) === '1'
}

/** Decided once, before the app renders: boot.tsx picks the demo network and wallet from it. Switching reloads the page. */
export const DEMO_MODE: boolean = resolve()

/** Turns demo mode on or off and reloads, so the network and the wallet are picked again from the start. */
export function setDemoMode(on: boolean): void {
  remember(on)
  const url = new URL(window.location.href)
  url.searchParams.delete('demo')
  window.history.replaceState(window.history.state, '', url)
  window.location.reload()
}

let demoKey: string | null = null
/**
 * The voucher key the pages start with: in demo mode a throwaway key made for this page load (held in memory, never stored, never sent),
 * so the demo account can sign without pasting one; empty otherwise (the member pastes their own).
 */
export function demoVoucherKey(): string {
  if (!DEMO_MODE) return ''
  demoKey ??= `ed25519:${base58Encode(crypto.getRandomValues(new Uint8Array(32)))}`
  return demoKey
}

export const demoSignedOut = (): boolean => read(DEMO_SIGNED_OUT) === '1'
export const setDemoSignedOut = (out: boolean): void =>
  out ? guarded(() => sessionStorage.setItem(DEMO_SIGNED_OUT, '1')) : forget(DEMO_SIGNED_OUT)
export const readDemoTables = (): string | null => read(DEMO_DB_KEY)
export const writeDemoTables = (json: string): void => guarded(() => sessionStorage.setItem(DEMO_DB_KEY, json))
