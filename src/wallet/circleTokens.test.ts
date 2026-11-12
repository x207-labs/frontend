// FE-110: the USDT token of stake, settle and ft_withdraw follows the circle contract, then the build config, never a fixed mainnet account.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureFetch, rpcResult } from '../api/fixtures'
import { NETWORK_TOKENS, TOKENS, tokenConfig } from '../config'
import { resetCircleTokens, resolveCircleTokens } from './circleTokens'
import { ftWithdrawTx, settleTx, stakeTx } from './transactions'

const methodOf = (init?: RequestInit) => (init?.body ? (JSON.parse(String(init.body)).params?.method_name as string | undefined) : undefined)

describe('FE-110 token config', () => {
  it('testnet defaults to the mock USDT and intents.testnet', () => {
    expect(tokenConfig('testnet', {})).toEqual({ usdt: 'usdt.x207-deployer.testnet', intents: 'intents.testnet' })
  })

  it('mainnet defaults to Tether USDT and intents.near', () => {
    expect(tokenConfig('mainnet', {})).toEqual({ usdt: 'usdt.tether-token.near', intents: 'intents.near' })
  })

  it('VITE_X207_USDT_TOKEN_ID and VITE_X207_INTENTS_ID override the default', () => {
    expect(tokenConfig('testnet', { VITE_X207_USDT_TOKEN_ID: 'usdc.fakes.testnet', VITE_X207_INTENTS_ID: 'intents.other.testnet' }))
      .toEqual({ usdt: 'usdc.fakes.testnet', intents: 'intents.other.testnet' })
    expect(tokenConfig('mainnet', { VITE_X207_USDT_TOKEN_ID: ' 17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1 ' }).usdt)
      .toBe('17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1')
  })

  it('an empty variable counts as unset', () => {
    expect(tokenConfig('testnet', { VITE_X207_USDT_TOKEN_ID: '', VITE_X207_INTENTS_ID: '  ' })).toEqual(NETWORK_TOKENS.testnet)
  })

  it('the test build (no VITE_NEAR_NETWORK) uses the testnet tokens', () => {
    expect(TOKENS).toEqual(NETWORK_TOKENS.testnet)
  })
})

describe('FE-110 transaction builders', () => {
  it('stake and settle go to the token passed in, ft_withdraw to the Intents contract passed in', () => {
    const tokens = { usdt: 'usdt.circle.testnet', intents: 'intents.circle.testnet' }
    expect(stakeTx('5', tokens.usdt).receiverId).toBe('usdt.circle.testnet')
    expect(settleTx(3, '5', tokens.usdt).receiverId).toBe('usdt.circle.testnet')
    expect(ftWithdrawTx('a.testnet', '5', tokens)).toMatchObject({ receiverId: 'intents.circle.testnet', args: { token: 'usdt.circle.testnet' } })
  })

  it('without an argument they use the build config, never usdt.tether-token.near on testnet', () => {
    expect(stakeTx('5').receiverId).toBe(TOKENS.usdt)
    expect(settleTx(3, '5').receiverId).toBe(TOKENS.usdt)
    expect(ftWithdrawTx('a.testnet', '5')).toMatchObject({ receiverId: TOKENS.intents, args: { token: TOKENS.usdt } })
    expect(stakeTx('5').receiverId).not.toBe('usdt.tether-token.near')
  })
})

describe('FE-110 resolveCircleTokens', () => {
  beforeEach(resetCircleTokens)
  afterEach(() => vi.unstubAllGlobals())

  it('the circle contract answer (get_circle) wins over the build config', async () => {
    const fetchMock = vi.fn(fixtureFetch((_path, init) =>
      methodOf(init) === 'get_circle' ? rpcResult({ usdt_token_id: 'usdc.circle.testnet', intents_id: 'intents.circle.testnet' }) : undefined))
    vi.stubGlobal('fetch', fetchMock)
    expect(await resolveCircleTokens()).toEqual({ usdt: 'usdc.circle.testnet', intents: 'intents.circle.testnet', source: 'contract' })
    // kept for the session: the contract fixes the token at init
    await resolveCircleTokens()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a failed read falls back to the build config and is retried next time', async () => {
    let fail = true
    vi.stubGlobal('fetch', vi.fn(fixtureFetch((_path, init) =>
      methodOf(init) === 'get_circle' ? (fail ? { status: 502, body: {} } : rpcResult({ usdt_token_id: 'usdc.circle.testnet', intents_id: 'intents.circle.testnet' })) : undefined)))
    expect(await resolveCircleTokens()).toEqual({ ...TOKENS, source: 'config' })
    fail = false
    expect((await resolveCircleTokens()).source).toBe('contract')
  })

  it('an answer without usdt_token_id falls back to the build config', async () => {
    vi.stubGlobal('fetch', vi.fn(fixtureFetch((_path, init) => (methodOf(init) === 'get_circle' ? rpcResult({ circle_id: 'agents-main' }) : undefined))))
    expect(await resolveCircleTokens()).toEqual({ ...TOKENS, source: 'config' })
  })

  it('a missing intents_id keeps the build config for it', async () => {
    vi.stubGlobal('fetch', vi.fn(fixtureFetch((_path, init) => (methodOf(init) === 'get_circle' ? rpcResult({ usdt_token_id: 'usdc.circle.testnet' }) : undefined))))
    expect(await resolveCircleTokens()).toEqual({ usdt: 'usdc.circle.testnet', intents: TOKENS.intents, source: 'contract' })
  })
})
