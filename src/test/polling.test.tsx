import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, rateLimitWait } from '../api/client'
import { apiError, renderApp } from './render'

// FE-046: the dashboard is open on many screens at once and every one shares the read API rate limit. These tests count the calls of one poll cycle after the
// first load: data that can no longer change (finalized epochs, delivered or cancelled sales, grant expiry, the contract's TTL) is never polled again.

const POLL = 400
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)))
const pathOf = (url: string) => new URL(url, 'http://x').pathname + new URL(url, 'http://x').search
const isRpc = (r: { body?: unknown }) => JSON.stringify(r.body ?? '').includes('call_function')

/** Lets the first load finish (details, lazy reads), then records only what the polling asks for during `ms`. */
async function pollWindow(view: ReturnType<typeof renderApp>, ms: number) {
  await wait(POLL * 3)
  const before = view.requests().length
  await wait(ms)
  return view.requests().slice(before)
}
const countBy = (paths: string[]) => paths.reduce((m, p) => m.set(p, (m.get(p) ?? 0) + 1), new Map<string, number>())

describe('FE-046 polling load on the read API', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('TC-FE-046-01 /access on circle v018: one poll cycle is at most 5 calls; no epoch metrics, no sale detail, no RPC', async () => {
    const view = renderApp('/access?circle=v018', undefined, POLL)
    expect(await screen.findByRole('table', { name: 'Account sales' })).toBeInTheDocument()
    expect(await screen.findByText(/72 hours/)).toBeInTheDocument()
    const polled = await pollWindow(view, POLL * 2.5)
    const paths = polled.filter((r) => !isRpc(r)).map((r) => pathOf(r.path))
    const cycles = paths.filter((p) => p.endsWith('/epochs')).length
    expect(cycles).toBeGreaterThanOrEqual(1)
    expect(polled.length).toBeLessThanOrEqual(5 * cycles)
    expect(countBy(paths).size).toBeLessThanOrEqual(5)
    expect(polled.filter(isRpc)).toEqual([])
    expect(paths.filter((p) => /\/metrics$|\/account-escrows\/\d+$|\/grants$/.test(p))).toEqual([])
  })

  it('TC-FE-046-02 /stats: the metrics of finalized epochs 40 and 41 are read once; only epoch 42 (payment window) is polled', async () => {
    const view = renderApp('/stats', undefined, POLL)
    expect(await screen.findByRole('combobox', { name: 'Epoch' })).toBeInTheDocument()
    const polled = await pollWindow(view, POLL * 2.5)
    const metrics = polled.map((r) => pathOf(r.path)).filter((p) => p.endsWith('/metrics'))
    expect(metrics.length).toBeGreaterThanOrEqual(1)
    expect(metrics.every((p) => p.endsWith('/epochs/42/metrics'))).toBe(true)
    // the first load read each finalized epoch once, not once per observer
    const all = view.calls().map(pathOf)
    expect(all.filter((p) => p.endsWith('/epochs/41/metrics'))).toHaveLength(1)
    expect(all.filter((p) => p.endsWith('/epochs/40/metrics'))).toHaveLength(1)
  })

  it('TC-FE-046-03 a hidden tab does not poll', async () => {
    const view = renderApp('/access?circle=v018', undefined, POLL)
    await screen.findByRole('table', { name: 'Account sales' })
    await wait(POLL * 3)
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const before = view.calls().length
    await wait(POLL * 3)
    expect(view.calls().slice(before)).toEqual([])
    hidden.mockRestore()
  })

  it('TC-FE-046-04 after a 429 the polling waits for Retry-After instead of calling again at the next tick', async () => {
    const view = renderApp('/access?circle=v018', (p) => (p.endsWith('/members') ? apiError(429, 'rate_limited', 'Too many requests', { 'Retry-After': '3' }) : undefined), POLL)
    await screen.findByRole('table', { name: 'Account sales' })
    expect(rateLimitWait()).toBeGreaterThan(2000)
    const polled = await pollWindow(view, POLL * 2.5)
    const paths = polled.map((r) => pathOf(r.path))
    expect(paths.filter((p) => p.endsWith('/members'))).toEqual([])
    for (const n of countBy(paths).values()) expect(n).toBeLessThanOrEqual(1)
  })

  it('TC-FE-046-05 without Retry-After the pause doubles (10 s, 20 s) and stops at the first answer that is not a 429', async () => {
    let status = 429
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(status === 200 ? { items: [] } : { error: { code: 'rate_limited', message: 'slow' } }), { status })))
    await expect(api.members()).rejects.toMatchObject({ status: 429 })
    const first = rateLimitWait()
    expect(first).toBeGreaterThan(9_000)
    expect(first).toBeLessThanOrEqual(10_000)
    await expect(api.members()).rejects.toMatchObject({ status: 429 })
    expect(rateLimitWait()).toBeGreaterThan(19_000)
    status = 200
    await api.members()
    status = 429
    await expect(api.members()).rejects.toMatchObject({ status: 429 })
    expect(rateLimitWait()).toBeLessThanOrEqual(10_000) // the count started again
  })
})
