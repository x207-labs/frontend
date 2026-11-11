import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixtureFetch, obligations, report42, type FixtureReply } from '../api/fixtures'
import { EpochReplay } from './EpochReplay'

// The real engine needs a canvas, which jsdom does not have. These tests check what the component hands to it and what it shows without one.
const engine = vi.hoisted(() => ({ mount: vi.fn(), destroy: vi.fn() }))
vi.mock('../landing/v4/engine/scene3d.js', () => ({
  mountScene3D: (...args: unknown[]) => {
    engine.mount(...args)
    return { destroy: engine.destroy }
  },
}))

type Override = (path: string) => FixtureReply | undefined
function view(epoch: number, override?: Override, strict = false) {
  vi.stubGlobal('fetch', vi.fn(fixtureFetch(override)))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } })
  const tree = (
    <QueryClientProvider client={client}>
      <EpochReplay epoch={epoch} />
    </QueryClientProvider>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}
const onPath = (re: RegExp, reply: FixtureReply): Override => (p) => (re.test(p) ? reply : undefined)

afterEach(() => {
  engine.mount.mockClear()
  engine.destroy.mockClear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('epoch replay on live data', () => {
  it('without a 2D canvas it shows the end figures of the epoch and no controls', async () => {
    view(41)
    const replay = await screen.findByRole('region', { name: 'Replay of epoch 41' })
    // the vouchers of the fixture add up to 412.74; nothing cancels in a loop; the epoch is in its payment window, so the end state is that step
    expect(within(replay).getByText('412.74')).toBeInTheDocument()
    expect(within(replay).getByText('2 of 2 vouchers')).toBeInTheDocument()
    expect(within(replay).getByText('0 of 0 loops')).toBeInTheDocument()
    expect(within(replay).getByText('Payment window')).toBeInTheDocument()
    expect(within(replay).getByText(/410\.00 still due/)).toBeInTheDocument()
    expect(replay.querySelector('canvas')).toBeNull()
    expect(within(replay).queryByRole('button')).toBeNull()
    expect(within(replay).queryByRole('slider')).toBeNull()
    expect(engine.mount).not.toHaveBeenCalled()
    // the screen reader gets the figures in words, and the unit is said under the floor
    expect(within(replay).getByText(/6 members on a ring and 2 vouchers between them\. 412\.74 credit owed, 0\.00 cancelled in loops, 2\.74 moved as mock USDT/)).toBeInTheDocument()
    expect(within(replay).getByText(/mock USDT on NEAR testnet/)).toBeInTheDocument()
  })

  it('says so when the epoch has no vouchers, instead of a broken canvas', async () => {
    view(41, onPath(/\/epochs\/41\/obligations/, { status: 200, body: { ...obligations(41, 'cleared'), edgeCount: 0, edges: [] } }))
    expect(await screen.findByText('Epoch 41 has no vouchers, so there is nothing to replay.')).toBeInTheDocument()
    expect(document.querySelector('canvas')).toBeNull()
  })

  it('says it could not read the vouchers and offers another try, without raising an alert of its own', async () => {
    view(41, onPath(/\/epochs\/41\/obligations/, { status: 503, body: { error: { code: 'indexer_unavailable', message: 'x' } } }))
    expect(await screen.findByText(/The replay of epoch 41 is not available/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('stops after clearing when the report of the epoch cannot be read, and says why', async () => {
    view(41, onPath(/\/epochs\/41$/, { status: 500, body: { error: { code: 'boom', message: 'x' } } }))
    const replay = await screen.findByRole('region', { name: 'Replay of epoch 41' })
    expect(within(replay).getByText('Clearing')).toBeInTheDocument()
    expect(within(replay).getByText(/could not be read, so the replay stops after clearing/)).toBeInTheDocument()
  })

  describe('with a canvas', () => {
    const withCanvas = () => {
      vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never)
    }

    it('mounts the scene on the floor with the data of the epoch, stopped where the epoch has got to, and the controls match', async () => {
      withCanvas()
      view(41)
      const replay = await screen.findByRole('region', { name: 'Replay of epoch 41' })
      expect(engine.mount).toHaveBeenCalledTimes(1)
      const [root, opts] = engine.mount.mock.calls[0] as [HTMLElement, { data: Record<string, unknown>; subMoved: unknown }]
      expect(root).toBe(replay.querySelector('.rp-floor'))
      expect(root.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true')
      expect(opts.data).toMatchObject({ until: 3.999, start: 3.999, names: ['translator', 'summarizer', 'image', 'scraper', 'cleaner', 'gpu'] })
      expect(opts.data.edges).toEqual([[0, 1, 274, 274], [3, 5, 41000, 37500]])
      expect(opts.data.outcome).toEqual(['flat', 'flat', 'flat', 'due', 'due', 'claimable'])
      // the pill, the range input and five chapters; the step after the one the epoch is in cannot be played yet
      expect(within(replay).getByRole('button', { name: 'Replay' })).toBeInTheDocument()
      expect(within(replay).getByRole('slider', { name: 'Position in the epoch' })).toHaveAttribute('max', '799')
      const chapters = within(replay).getByRole('group', { name: 'Jump to a step' })
      expect(within(chapters).getAllByRole('button').map((b) => [b.getAttribute('aria-label'), (b as HTMLButtonElement).disabled])).toEqual([
        ['Open', false], ['Clearing', false], ['Commit', false], ['Payment window', false], ['Finalized', true],
      ])
    })

    it('unmounts the scene with the component, also under StrictMode (mount, destroy, mount again)', async () => {
      withCanvas()
      const { unmount } = view(41, undefined, true)
      await screen.findByRole('region', { name: 'Replay of epoch 41' })
      expect(engine.mount.mock.calls.length).toBeGreaterThanOrEqual(1)
      expect(engine.destroy.mock.calls.length).toBe(engine.mount.mock.calls.length - 1)
      unmount()
      expect(engine.destroy.mock.calls.length).toBe(engine.mount.mock.calls.length)
    })

    it('keeps the figures and drops the picture when the scene cannot start', async () => {
      withCanvas()
      engine.mount.mockImplementationOnce(() => {
        throw new Error('no context')
      })
      view(41)
      const replay = await screen.findByRole('region', { name: 'Replay of epoch 41' })
      expect(within(replay).getByText('412.74')).toBeInTheDocument()
    })

    it('a finalized epoch plays to the end and its last chapter is open', async () => {
      withCanvas()
      view(41, onPath(/\/epochs\/41$/, { status: 207, body: { ...report42, epoch: 41, phase: 'finalized', finalized: true } }))
      const replay = await screen.findByRole('region', { name: 'Replay of epoch 41' })
      expect((engine.mount.mock.calls[0] as [unknown, { data: { until: number } }])[1].data.until).toBe(5)
      expect(within(replay).getByRole('slider')).toHaveAttribute('max', '1000')
      expect(within(replay).getByRole('button', { name: 'Finalized' })).toBeEnabled()
    })
  })
})
