import { describe, expect, it } from 'vitest'
import { buildCsp, cspMeta } from '../lib/csp'

describe('batch 3 F4 content security policy of the build', () => {
  it('TC-FE-SEC-20 scripts come from the own origin only and connections go to the configured API, broker, RPC and wallet origins', () => {
    const csp = buildCsp({ VITE_X207_API_URL: 'https://api.x207.example/v1', VITE_X207_BROKER_URL: 'https://broker.x207.example', VITE_NEAR_NETWORK: 'mainnet', VITE_X207_WALLET_ORIGINS: 'https://wallet.example, https://cdn.wallet.example/x' })
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'")
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(csp).not.toMatch(/script-src[^;]*\*/)
    expect(csp).toContain("connect-src 'self' https://api.x207.example https://broker.x207.example https://rpc.mainnet.fastnear.com https://wallet.example https://cdn.wallet.example")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("default-src 'self'")
  })

  it('FE-035 a hosted build without a broker does not allow connections to localhost', () => {
    const csp = buildCsp({ VITE_X207_API_URL: 'https://x207-backend-production.up.railway.app' })
    expect(csp).toContain("connect-src 'self' https://x207-backend-production.up.railway.app https://rpc.testnet.fastnear.com")
    expect(csp).not.toContain('localhost')
  })

  it('TC-FE-SEC-21 defaults are the local servers and the testnet RPC; an address that is not a URL is dropped, not written into the policy', () => {
    const csp = buildCsp({ VITE_X207_API_URL: 'not a url', VITE_X207_WALLET_ORIGINS: "javascript:alert(1) ; 'unsafe-eval'" })
    expect(csp).toContain('connect-src \'self\' http://localhost:8788 https://rpc.testnet.fastnear.com')
    expect(csp).not.toContain('not a url')
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).not.toContain('null')
    expect(cspMeta("a \"quoted\" b")).toBe('<meta http-equiv="Content-Security-Policy" content="a &quot;quoted&quot; b" />')
  })
})
