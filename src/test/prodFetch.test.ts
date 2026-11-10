import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { IPFS_GATEWAY_ORIGINS, buildCsp } from '../lib/csp'
import { DOWNLOAD_BLOCKED, IPFS_GATEWAYS, licenseSources, receiveLicense, sourceUrl } from '../lib/licenseFlow'
import { NETWORK_MESSAGE, describeMarketError } from '../lib/marketError'
import type { PurchaseView } from '../api/types'

// FE-097: requests that work on localhost (no policy) but fail on the production build (CSP, no local broker).
const hosted = { VITE_X207_API_URL: 'https://v018.x207.boxd.sh', VITE_NEAR_NETWORK: 'testnet' }

const view = (over: Partial<PurchaseView> = {}): PurchaseView =>
  ({
    purchaseId: 'p1', listingHash: 'h', status: 'key_released', source: { kind: 'https', ref: 'https://files.example.org/c.bin' }, cipherHash: 'abc',
    release: { cipher_hash: 'abc' }, releaseSignature: 'sig', ...over,
  }) as unknown as PurchaseView

describe('FE-097 production fetches', () => {
  it('the IPFS gateways a buyer downloads from are in connect-src, and the two lists stay equal', () => {
    expect(IPFS_GATEWAY_ORIGINS).toEqual(IPFS_GATEWAYS)
    const connect = buildCsp(hosted).split('; ').find((d) => d.startsWith('connect-src')) ?? ''
    for (const o of IPFS_GATEWAYS) expect(connect.split(' ')).toContain(o)
    expect(connect).not.toContain('localhost')
    expect(connect.split(' ')).not.toContain('https:')
  })

  it('a download the browser blocks says what to do instead of "Failed to fetch"', async () => {
    const before = licenseSources.current
    licenseSources.current = { https: { kind: 'https', fetch: () => Promise.reject(new TypeError('Failed to fetch')) } }
    try {
      await expect(receiveLicense(view(), 'ed25519:x', 'k', () => {})).resolves.toEqual({ state: 'refused', reason: DOWNLOAD_BLOCKED })
    } finally {
      licenseSources.current = before
    }
  })

  it('a saved file that is not the posted ciphertext is refused before any key is used', async () => {
    const r = await receiveLicense(view(), 'ed25519:x', 'k', () => {}, new Uint8Array([1, 2, 3]))
    expect(r).toMatchObject({ state: 'refused' })
    expect(r.state === 'refused' && r.reason).toContain('does not match cipher_hash')
  })

  it('the source link is https or an IPFS gateway, nothing else', () => {
    expect(sourceUrl({ kind: 'https', ref: 'https://files.example.org/c.bin' })).toBe('https://files.example.org/c.bin')
    expect(sourceUrl({ kind: 'https', ref: 'javascript:alert(1)' })).toBeNull()
    expect(sourceUrl({ kind: 'https', ref: 'http://files.example.org/c.bin' })).toBeNull()
    expect(sourceUrl({ kind: 'ipfs', ref: 'bafybeigdyrzt5' })).toBe('https://ipfs.io/ipfs/bafybeigdyrzt5')
    expect(sourceUrl({ kind: 'ipfs', ref: '../x' })).toBeNull()
  })

  it('network failures and a missing broker are said in words', () => {
    expect(describeMarketError(new TypeError('Load failed'))).toBe(NETWORK_MESSAGE)
    expect(describeMarketError(new ApiError(0, 'broker_not_configured', ''))).toContain('has none configured')
  })
})
