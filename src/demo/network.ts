import { ACCOUNT_URL } from '../account/client'
import { chainFixture, type FixtureReply } from '../api/fixtures'
import { API_URL, BROKER_URL, NEAR_RPC_URL } from '../config'
import { demoReply } from './api'
import { changeDemoTables, demoTables } from './db'

/**
 * FE-100: the network of demo mode. `window.fetch` is replaced before the app renders, and every request is answered inside the tab:
 * the read API from the demo tables, contract views from the sample chain, the account service from the demo account row. The access
 * broker answers that it is not simulated. Any other request to another origin is refused, so demo mode cannot write to a backend, a
 * database, the account service or the chain, whatever a page tries. Requests to this site itself (scripts, styles, fonts) pass.
 */
const json = (reply: FixtureReply): Response =>
  new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json', ...reply.headers } })

function bodyText(init: RequestInit | undefined): string | null {
  const body = init?.body
  return typeof body === 'string' ? body : null
}

function parse(text: string | null): Record<string, unknown> | null {
  if (!text) return null
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

/** NEAR JSON-RPC: contract views from the sample chain; anything else (accounts, keys, transactions) is not reached in demo mode. */
function rpc(text: string | null): FixtureReply {
  const call = parse(text)
  const params = call?.params as { request_type?: string; method_name?: string } | undefined
  if (params?.request_type === 'call_function') return chainFixture(params.method_name ?? '')
  return { status: 200, body: { jsonrpc: '2.0', id: call?.id ?? 'x207', error: { name: 'HANDLER_ERROR', cause: { name: 'DEMO_MODE' }, message: 'Demo mode: the chain is not reached.' } } }
}

/** The account service (Supabase `x207-account`): the demo account row in the demo tables. */
async function account(text: string | null): Promise<FixtureReply> {
  const call = parse(text) ?? {}
  const action = String(call.action ?? '')
  const data = (call.data ?? {}) as Record<string, unknown>
  if (action === 'feedback') {
    await changeDemoTables((db) => {
      db.feedback.unshift({ page: String(data.page ?? ''), message: String(data.message ?? ''), at: new Date().toISOString() })
    })
    return { status: 200, body: { ok: true } }
  }
  const accountId = String(call.accountId ?? '')
  const row = await changeDemoTables((db) => {
    if (action === 'upsert_profile') db.account.profile = { display_name: String(data.display_name ?? '') }
    if (action === 'upsert_onboarding') db.account.onboarding = { ...(db.account.onboarding ?? { wallet_created: false, funds_received: false, joined: false, staked: false, tour_done: false }), ...data } as typeof db.account.onboarding
    if (action === 'upsert_prefs') db.account.prefs = { ...(db.account.prefs ?? { email: null, deadline_reminder: false }), ...data } as typeof db.account.prefs
    return db.account
  })
  if (!['get', 'upsert_profile', 'upsert_onboarding', 'upsert_prefs'].includes(action)) return { status: 400, body: { error: { code: 'unknown_action', message: 'Unknown account action' } } }
  return { status: 200, body: { account_id: accountId, ...row } }
}

const sameOrigin = (url: URL) => url.origin === window.location.origin
const startsWith = (url: string, base: string | null) => base !== null && base !== '' && url.startsWith(base)

export type DemoRoute = 'api' | 'rpc' | 'account' | 'broker' | 'pass' | 'blocked'

/** Where one request of demo mode goes. Exported for the tests. */
export function routeOf(url: string): DemoRoute {
  const parsed = new URL(url, window.location.href)
  const full = parsed.href
  if (startsWith(full, API_URL) || (API_URL === '' && sameOrigin(parsed) && parsed.pathname.startsWith('/x207/'))) return 'api'
  if (startsWith(full, NEAR_RPC_URL)) return 'rpc'
  if (startsWith(full, ACCOUNT_URL)) return 'account'
  if (startsWith(full, BROKER_URL)) return 'broker'
  return sameOrigin(parsed) ? 'pass' : 'blocked'
}

export function demoFetch(real: typeof fetch): typeof fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : null
    const url = request ? request.url : String(input)
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const text = bodyText(init) ?? (request && method !== 'GET' && method !== 'HEAD' ? await request.clone().text() : null)
    switch (routeOf(url)) {
      case 'api': {
        const parsed = new URL(url, window.location.href)
        const base = API_URL === '' ? '' : new URL(API_URL, window.location.href).pathname.replace(/\/$/, '')
        return json(await demoReply(parsed.pathname.slice(base.length) + parsed.search, method, text))
      }
      case 'rpc':
        return json(rpc(text))
      case 'account':
        return json(await account(text))
      case 'broker':
        return json({ status: 409, body: { error: 'demo_not_simulated', message: 'Demo mode: the access broker is not simulated. Turn demo mode off to rent for real.' } })
      case 'pass':
        return real(input, init)
      case 'blocked':
        throw new TypeError(`Demo mode: requests to ${new URL(url, window.location.href).origin} are off.`)
    }
  }
}

/** Installs the demo network. Called once by boot.tsx before the app renders, only in demo mode. */
export async function installDemoNetwork(): Promise<void> {
  window.fetch = demoFetch(window.fetch.bind(window))
  await demoTables()
}
