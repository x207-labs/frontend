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

  it('FE-038 NEAR Connect: the two manifest URLs it fetches and the icons it lists are allowed, nothing is opened for scripts or frames', () => {
    const csp = buildCsp({ VITE_X207_API_URL: 'https://x207.boxd.sh' })
    const dir = (name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? ''
    expect(dir('connect-src')).toContain('https://raw.githubusercontent.com')
    expect(dir('connect-src')).toContain('https://cdn.jsdelivr.net')
    expect(dir('img-src')).toContain('https://storage.herewallet.app')
    expect(dir('script-src')).toBe("script-src 'self' 'wasm-unsafe-eval'")
    expect(csp).not.toContain('frame-src')
  })

  it('v4 landing: the dashboard iframe of the laptop section is same-origin, so frame-src keeps \'self\' next to Privy, and without Privy no frame-src narrows default-src', () => {
    const dir = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? ''
    expect(dir(buildCsp({ VITE_X207_API_URL: 'https://x207.boxd.sh', VITE_PRIVY_APP_ID: 'app' }), 'frame-src')).toBe("frame-src 'self' https://auth.privy.io")
    const plain = buildCsp({ VITE_X207_API_URL: 'https://x207.boxd.sh' })
    expect(dir(plain, 'frame-src')).toBe('')
    expect(dir(plain, 'default-src')).toBe("default-src 'self'")
  })

  it('FE-038 the build nonce is the only addition to script-src: the wallet executor iframes need it, and unsafe-inline stays out', () => {
    const csp = buildCsp({ VITE_X207_API_URL: 'https://api.x207.example' }, 'AbC+/123==')
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval' 'nonce-AbC+/123=='")
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
  })

  it('FE-035 a hosted build without a broker does not allow connections to localhost', () => {
    const csp = buildCsp({ VITE_X207_API_URL: 'https://x207.boxd.sh' })
    expect(csp).toContain("connect-src 'self' https://x207.boxd.sh https://rpc.testnet.fastnear.com")
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
  it('FE-041 a build that points at the boxd API also allows the other circle API, one that does not stays closed', () => {
    expect(buildCsp({ VITE_X207_API_URL: 'https://x207.boxd.sh' })).toContain('https://v014.x207.boxd.sh')
    expect(buildCsp({ VITE_X207_API_URL: 'https://x207.boxd.sh' })).toContain('https://v015.x207.boxd.sh')
    expect(buildCsp({ VITE_X207_API_URL: 'https://api.x207.example' })).not.toContain('boxd.sh')
  })
  it('FE-045 the v018 build allows every circle API of the picker (v013 history included) and not the v016 host, which does not exist', () => {
    const csp = buildCsp({ VITE_X207_API_URL: 'https://v018.x207.boxd.sh', VITE_NEAR_NETWORK: 'testnet' })
    const connect = csp.split('; ').find((d) => d.startsWith('connect-src')) ?? ''
    for (const host of ['v018', 'v017', 'v015', 'v014']) expect(connect).toContain(`https://${host}.x207.boxd.sh`)
    expect(connect).toContain('https://x207.boxd.sh')
    expect(connect).toContain('https://rpc.testnet.fastnear.com')
    expect(connect).not.toContain('v016')
    expect(connect).not.toContain('localhost')
  })
})
