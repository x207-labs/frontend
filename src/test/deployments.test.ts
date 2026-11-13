import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEPLOYMENTS } from '../deployments.generated'

// UM-208: the circles and the active one come from deployments.generated.ts (a copy of the umbrella's docs/deployments.json).
const loadConfig = async (apiUrl: string, path: string) => {
  vi.resetModules()
  vi.stubEnv('VITE_X207_API_URL', apiUrl)
  vi.stubEnv('VITE_X207_CONTRACT_ID', 'x207-other.testnet')
  window.history.replaceState(null, '', path)
  return import('../config')
}

afterEach(() => {
  vi.unstubAllEnvs()
  window.history.replaceState(null, '', '/')
})

describe('UM-208: circles from deployments.json', () => {
  const active = DEPLOYMENTS.circles.find((c) => c.key === DEPLOYMENTS.active)!

  it('the picker offers every circle with a read API, and only the active one is the main circle', async () => {
    const { CIRCLE_OPTIONS, circleLabel } = await loadConfig('http://localhost:8787', '/')
    expect(CIRCLE_OPTIONS.map((o) => o.key)).toEqual(DEPLOYMENTS.circles.filter((c) => c.apiUrl !== null).map((c) => c.key))
    expect(CIRCLE_OPTIONS.filter((o) => o.label.includes('main circle')).map((o) => o.key)).toEqual([DEPLOYMENTS.active])
    expect(circleLabel({ key: 'v017', contract: 'x207-v017.testnet', interface: '0.0.17', note: 'auto-settle, relayer fee' }, 'v017')).toBe('x207-v017 (main circle, 0.0.17)')
  })

  it('a hosted build opens on the active circle, even when VITE_X207_API_URL names another circle', async () => {
    const other = DEPLOYMENTS.circles.find((c) => c.apiUrl !== null && c.key !== DEPLOYMENTS.active)!
    const cfg = await loadConfig(other.apiUrl!, '/stats')
    expect(cfg.CIRCLE_PICKER).toBe(true)
    expect(cfg.SELECTED_CIRCLE).toBe(DEPLOYMENTS.active)
    expect(cfg.API_URL).toBe(active.apiUrl)
    expect(cfg.CONTRACT_ID).toBe(active.contract)
  })

  it('?circle= still picks another circle on a hosted build', async () => {
    const cfg = await loadConfig(active.apiUrl!, '/stats?circle=v013')
    expect(cfg.SELECTED_CIRCLE).toBe('v013')
    expect(cfg.CONTRACT_ID).toBe('x207-v013.testnet')
  })

  it('a local build keeps its own API and contract and shows no picker', async () => {
    const cfg = await loadConfig('http://localhost:8787', '/stats?circle=v013')
    expect(cfg.CIRCLE_PICKER).toBe(false)
    expect(cfg.SELECTED_CIRCLE).toBeNull()
    expect(cfg.API_URL).toBe('http://localhost:8787')
    expect(cfg.CONTRACT_ID).toBe('x207-other.testnet')
  })
})
