import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { metrics as fixtureMetrics, type FixtureReply } from '../api/fixtures'
import { renderApp, type Override } from './render'

// FE-047: the first load of a page must not fire a burst at the read API, whose rate limit is shared per caller. These tests count the calls of the first load:
// no detail read twice, the default epoch found newest first in small waves, the charts of /stats read a few epochs at a time.

const pathOf = (url: string) => new URL(url, 'http://x').pathname + new URL(url, 'http://x').search
const isRpc = (r: { body?: unknown }) => JSON.stringify(r.body ?? '').includes('call_function')
const countBy = (paths: string[]) => paths.reduce((m, p) => m.set(p, (m.get(p) ?? 0) + 1), new Map<string, number>())

/** A circle with `count` epochs, newest first: the newest in the payment window, the others finalized; `clears(epoch)` says which ones cleared anything. */
function bigCircle(count: number, clears: (epoch: number) => boolean, delayMs = 0) {
  const newest = 100
  const items = Array.from({ length: count }, (_, i) => ({ epoch: newest - i, phase: i === 0 ? 'payment_window' : 'finalized', proposalDeadline: '2026-11-09T09:10:00Z' }))
  const started: { epoch: number; at: number }[] = []
  const override: Override = (path) => {
    if (/\/epochs$/.test(new URL(path, 'http://x').pathname)) return { status: 200, body: { items, nextCursor: null } }
    const one = path.match(/\/epochs\/(\d+)\/metrics$/)
    if (!one) return undefined
    const epoch = Number(one[1])
    started.push({ epoch, at: performance.now() })
    const phase = epoch === newest ? 'payment_window' : 'finalized'
    const cleared = clears(epoch) ? '602000000' : '0'
    const body = { ...fixtureMetrics[41], epoch, phase, cleared, clearedRatio: clears(epoch) ? 0.5 : 0 }
    return { status: 200, body, delayMs } satisfies FixtureReply
  }
  return { override, started }
}

/** The most metrics requests that were waiting for an answer at the same time (every answer takes `delayMs`). */
const mostInFlight = (started: { at: number }[], delayMs: number) =>
  Math.max(0, ...started.map((s) => started.filter((o) => o.at <= s.at && o.at > s.at - delayMs).length))

describe('FE-047 first load on the read API', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('TC-FE-047-01 /access on circle v018: about 15 calls, each sale detail once, one epoch metrics read for the default epoch', async () => {
    const view = renderApp('/access?circle=v018')
    expect(await screen.findByRole('table', { name: 'Account sales' })).toBeInTheDocument()
    expect(await screen.findByText(/72 hours/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('loading…')).toBeNull())
    const requests = view.requests()
    const paths = requests.filter((r) => !isRpc(r)).map((r) => pathOf(r.path))
    expect(requests.length).toBeLessThanOrEqual(15)
    const details = paths.filter((p) => /\/account-escrows\/\d+$/.test(p))
    expect(details.length).toBeGreaterThan(0)
    for (const n of countBy(details).values()) expect(n).toBe(1)
    expect(paths.filter((p) => p.endsWith('/metrics'))).toHaveLength(1)
  })

  it('TC-FE-047-02 the default epoch is the newest finalized one that cleared: one read when it is the newest', async () => {
    const { override, started } = bigCircle(12, () => true)
    renderApp('/stats', override)
    expect(await screen.findByRole('combobox', { name: 'Epoch' })).toHaveValue('99')
    // the charts start only after the choice, so the first metrics read is the newest finalized epoch alone
    expect(started[0].epoch).toBe(99)
    expect(started.slice(1).some((s) => s.epoch === 99)).toBe(false)
  })

  it('TC-FE-047-03 when the newest epochs cleared nothing the scan goes on in waves of 1, 2, 3 and stops at the first that cleared', async () => {
    const { override, started } = bigCircle(12, (epoch) => epoch === 95)
    const view = renderApp('/access?circle=v018', override)
    await screen.findByRole('table', { name: 'Account sales' })
    await waitFor(() => expect(started.map((s) => s.epoch)).toEqual([99, 98, 97, 96, 95, 94]))
    expect(view.calls().map(pathOf).filter((p) => /\/epochs\/(9[0-3])\/metrics$/.test(p))).toEqual([])
  })

  it('TC-FE-047-04 /stats: the charts read at most 5 epochs at a time, each once, the selected epoch first', async () => {
    const DELAY = 40
    const { override, started } = bigCircle(25, () => true, DELAY)
    renderApp('/stats', override)
    expect(await screen.findByRole('combobox', { name: 'Epoch' })).toHaveValue('99')
    await waitFor(() => expect(new Set(started.map((s) => s.epoch)).size).toBe(20), { timeout: 3000 })
    expect(mostInFlight(started, DELAY)).toBeLessThanOrEqual(5)
    for (const n of countBy(started.map((s) => String(s.epoch))).values()) expect(n).toBe(1)
    expect(started[0].epoch).toBe(99)
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(21))
  })
})
