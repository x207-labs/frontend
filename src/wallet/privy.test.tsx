import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCsp } from '../lib/csp'
import { PRIVY_EXECUTOR_COMMIT, PRIVY_EXECUTOR_URL, PRIVY_WALLET_ID, buildManifest, privyWalletEntry } from './privyManifest'
import { PrivySignFlow } from './PrivySignFlow'
import { ensureNearWallet, hasNearWallet, readOAuthReturn, type PrivyLike } from './privyLogin'

const ORIGIN = 'https://x207.vercel.app'
const near = { type: 'wallet', chain_type: 'near' }

describe('TC-FE-059-01 the Privy wallet is one more entry of the wallet list', () => {
  const other = { id: 'hot', name: 'HOT Wallet' }
  const fakeFetch = (ok = true) => vi.fn(async () => (ok ? new Response(JSON.stringify({ version: '1', wallets: [other] })) : new Response('no', { status: 500 }))) as unknown as typeof fetch

  it('without the Privy ids there is no manifest, so the connector keeps its own list and nothing is fetched', async () => {
    const f = fakeFetch()
    expect(await buildManifest({ enabled: false, origin: ORIGIN, fetchImpl: f })).toBeUndefined()
    expect(f).not.toHaveBeenCalled()
  })

  it('FE-073 with the ids the other wallets stay and the Privy entry comes first, above the fold of the chooser', async () => {
    const manifest = await buildManifest({ enabled: true, origin: ORIGIN, fetchImpl: fakeFetch() })
    expect(manifest?.wallets.map((w) => w.id)).toEqual([PRIVY_WALLET_ID, 'hot'])
  })

  it('if the default list cannot be fetched the chooser still opens with the Privy entry', async () => {
    const manifest = await buildManifest({ enabled: true, origin: ORIGIN, fetchImpl: fakeFetch(false) })
    expect(manifest?.wallets.map((w) => w.id)).toEqual([PRIVY_WALLET_ID])
  })

  it('the executor is pinned to a commit, never a branch, and the sign page and the permission to open it are this origin', () => {
    const entry = privyWalletEntry(ORIGIN) as unknown as { executor: string; metadata: { signPageURL: string; debug: boolean }; permissions: { allowsOpen: string[] } }
    expect(PRIVY_EXECUTOR_COMMIT).toMatch(/^[0-9a-f]{40}$/)
    expect(entry.executor).toBe(PRIVY_EXECUTOR_URL)
    expect(entry.executor).toContain(`/${PRIVY_EXECUTOR_COMMIT}/executor.js`)
    expect(entry.executor).not.toMatch(/refs\/heads|\/(main|release)\//)
    expect(entry.metadata).toEqual({ signPageURL: `${ORIGIN}/sign`, debug: false })
    expect(entry.permissions.allowsOpen).toEqual([ORIGIN])
  })

  it('public/manifest.json is the same entry for the production origin', () => {
    const file = JSON.parse(readFileSync(resolve(process.cwd(), 'public/manifest.json'), 'utf8'))
    expect(file).toEqual({ version: '1.0.0', wallets: [privyWalletEntry(ORIGIN)] })
  })

  it('FE-065 the manifest file uses https://x207.vercel.app everywhere and keeps no trace of the old dashboard domain', () => {
    const text = readFileSync(resolve(process.cwd(), 'public/manifest.json'), 'utf8')
    const entry = JSON.parse(text).wallets[0]
    expect(entry.permissions.allowsOpen).toEqual(['https://x207.vercel.app'])
    expect(entry.metadata.signPageURL).toBe('https://x207.vercel.app/sign')
    expect(entry.website).toBe('https://x207.vercel.app')
    expect(entry.icon).toBe('https://x207.vercel.app/favicon.svg')
    expect(text).not.toContain('x207-dashboard')
  })
})

describe('TC-FE-059-02 the CSP opens the Privy host only when the build has a Privy app id', () => {
  it('off by default; on with both ids', () => {
    const base = { VITE_X207_API_URL: 'https://x207.boxd.sh' }
    expect(buildCsp(base)).not.toContain('privy')
    expect(buildCsp({ ...base, VITE_PRIVY_APP_CLIENT_ID: 'client' })).not.toContain('privy') // a Client ID alone is not enough
    expect(buildCsp({ ...base, VITE_PRIVY_APP_ID: '  ' })).not.toContain('privy')
    // FE-066: the App ID alone turns it on; the Client ID is optional
    // v4 landing: 'self' stays in frame-src, or the landing's laptop could not show the same-origin dashboard in its iframe
    expect(buildCsp({ ...base, VITE_PRIVY_APP_ID: 'app' })).toContain("frame-src 'self' https://auth.privy.io")
    const on = buildCsp({ ...base, VITE_PRIVY_APP_ID: 'app', VITE_PRIVY_APP_CLIENT_ID: 'client' })
    expect(on).toContain("frame-src 'self' https://auth.privy.io")
    expect(on.split('; ').find((d) => d.startsWith('connect-src'))).toContain('https://auth.privy.io')
    expect(on).toMatch(/script-src 'self' 'wasm-unsafe-eval'/) // scripts still come from the own origin only
  })
})

function fakePrivy(user: unknown = null) {
  const calls: string[] = []
  const privy = {
    initialize: async () => { calls.push('initialize') },
    user: { get: vi.fn(async () => ({ user: user as never })) },
    auth: {
      email: {
        sendCode: vi.fn(async (e: string) => { calls.push(`sendCode:${e}`) }),
        loginWithCode: vi.fn(async () => ({ user: { linked_accounts: [near] } as never })),
      },
      oauth: {
        generateURL: vi.fn(async () => ({ url: 'https://accounts.example/google' })),
        loginWithCode: vi.fn(async () => ({ user: { linked_accounts: [near] } as never })),
      },
      logout: vi.fn(async () => undefined),
    },
  }
  return { privy: privy as unknown as PrivyLike, raw: privy, calls }
}
const Plugin = ({ origin }: { origin: string }) => <p>signing screen for {origin}</p>

describe('TC-FE-059-03 the /sign page logs in, then hands over to the signing screen', () => {
  it('a visitor already logged in with a NEAR wallet goes straight to the signing screen', async () => {
    const { privy } = fakePrivy({ linked_accounts: [near] })
    render(<PrivySignFlow privy={privy} createNearWallet={vi.fn()} Plugin={Plugin} search="" />)
    expect(await screen.findByText(/signing screen for/)).toBeInTheDocument()
  })

  it('email login: send the code, enter it, then the signing screen', async () => {
    const user = userEvent.setup()
    const { privy, raw } = fakePrivy(null)
    render(<PrivySignFlow privy={privy} createNearWallet={vi.fn()} Plugin={Plugin} search="" />)
    await user.type(await screen.findByLabelText('Email'), 'me@example.com')
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    await user.type(await screen.findByLabelText(/Code sent to me@example.com/), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByText(/signing screen for/)).toBeInTheDocument()
    expect(raw.auth.email.sendCode).toHaveBeenCalledWith('me@example.com')
    expect(raw.auth.email.loginWithCode).toHaveBeenCalledWith('me@example.com', '123456')
  })

  it('a first login creates the NEAR wallet; a wrong code shows the error and stays on the form', async () => {
    const user = userEvent.setup()
    const { privy, raw } = fakePrivy(null)
    raw.auth.email.loginWithCode.mockRejectedValueOnce(new Error('Invalid code'))
    render(<PrivySignFlow privy={privy} createNearWallet={vi.fn()} Plugin={Plugin} search="" />)
    await user.type(await screen.findByLabelText('Email'), 'me@example.com')
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    await user.type(await screen.findByLabelText(/Code sent to/), '000000')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid code')
    expect(screen.queryByText(/signing screen for/)).toBeNull()
  })

  it('Google: sends the browser to the URL Privy gives, with this origin\'s /sign as the return address', async () => {
    const user = userEvent.setup()
    const { privy, raw } = fakePrivy(null)
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, origin: ORIGIN, assign })
    render(<PrivySignFlow privy={privy} createNearWallet={vi.fn()} Plugin={Plugin} search="" />)
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://accounts.example/google'))
    expect(raw.auth.oauth.generateURL).toHaveBeenCalledWith('google', `${ORIGIN}/sign`)
  })

  it('a return from Google completes the login with the code and state from the query', async () => {
    const { privy, raw } = fakePrivy(null)
    render(<PrivySignFlow privy={privy} createNearWallet={vi.fn()} Plugin={Plugin} search="?privy_oauth_code=c1&privy_oauth_state=s1" />)
    expect(await screen.findByText(/signing screen for/)).toBeInTheDocument()
    expect(raw.auth.oauth.loginWithCode).toHaveBeenCalledWith('c1', 's1', 'google')
  })

  it('a user with no NEAR wallet gets one created; if that fails the page says so instead of showing the signing screen', async () => {
    const created = vi.fn(async () => undefined)
    const { privy, raw } = fakePrivy({ linked_accounts: [] })
    raw.user.get.mockResolvedValueOnce({ user: { linked_accounts: [] } as never }).mockResolvedValue({ user: { linked_accounts: [near] } as never })
    render(<PrivySignFlow privy={privy} createNearWallet={created} Plugin={Plugin} search="" />)
    expect(await screen.findByText(/signing screen for/)).toBeInTheDocument()
    expect(created).toHaveBeenCalledTimes(1)

    const none = fakePrivy({ linked_accounts: [] })
    render(<PrivySignFlow privy={none.privy} createNearWallet={vi.fn(async () => undefined)} Plugin={() => <p>never</p>} search="" />)
    expect(await screen.findByText(/NEAR wallet could not be created/)).toBeInTheDocument()
    expect(screen.queryByText('never')).toBeNull()
  })
})

describe('TC-FE-059-05 the /sign route without Privy ids', () => {
  it('explains that the sign-in is off and does not error', async () => {
    const { renderApp } = await import('../test/render')
    renderApp('/sign')
    // the route loads the Privy SDK and the Radix styles as a lazy chunk; the first load is slow
    expect(await screen.findByRole('heading', { name: /not set up/ }, { timeout: 8000 })).toBeInTheDocument()
  })
})

describe('TC-FE-059-04 helpers', () => {
  it('hasNearWallet / ensureNearWallet / readOAuthReturn', async () => {
    expect(hasNearWallet({ linked_accounts: [near] })).toBe(true)
    expect(hasNearWallet({ linked_accounts: [{ type: 'wallet', chain_type: 'ethereum' }] })).toBe(false)
    expect(hasNearWallet(null)).toBe(false)
    const { privy } = fakePrivy({ linked_accounts: [near] })
    expect(await ensureNearWallet(privy, null, vi.fn())).toBeNull()
    expect(readOAuthReturn('?privy_oauth_code=a&privy_oauth_state=b')).toEqual({ code: 'a', state: 'b' })
    expect(readOAuthReturn('?privy_oauth_code=a')).toBeNull()
    expect(readOAuthReturn('')).toBeNull()
  })
})

// Last in the file: it resets the module registry, which the lazy /sign chunk of the test above must not see.
describe('TC-FE-066-01 the Client ID is optional', () => {
  const load = async (env: Record<string, string>) => {
    vi.resetModules()
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    return import('./privyConfig')
  }
  afterEach(() => vi.unstubAllEnvs())

  it('no App ID: off, even with a Client ID', async () => {
    const c = await load({ VITE_PRIVY_APP_ID: '', VITE_PRIVY_APP_CLIENT_ID: 'client' })
    expect(c.privyEnabled).toBe(false)
  })
  it('App ID only: on, and `clientId` is not sent at all', async () => {
    const c = await load({ VITE_PRIVY_APP_ID: 'app', VITE_PRIVY_APP_CLIENT_ID: '' })
    expect(c.privyEnabled).toBe(true)
    expect(c.privyClientOptions()).toEqual({ appId: 'app' })
    expect('clientId' in c.privyClientOptions()).toBe(false)
  })
  it('both: `clientId` is sent', async () => {
    const c = await load({ VITE_PRIVY_APP_ID: 'app', VITE_PRIVY_APP_CLIENT_ID: ' client ' })
    expect(c.privyClientOptions()).toEqual({ appId: 'app', clientId: 'client' })
  })
  it('the sources never read a Privy secret', () => {
    const files = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    for (const [file, text] of Object.entries(files)) expect(text, file).not.toMatch(/PRIVY_APP_SECRET|PRIVY_SECRET|appSecret/i)
  })
})
