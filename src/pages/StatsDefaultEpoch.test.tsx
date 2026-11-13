import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fixtureReply, metrics, type FixtureReply } from '../api/fixtures'
import { renderApp } from '../test/render'

// FE-118: a busy circle closes many empty epochs. The list carries `cleared` per epoch and pages by cursor; the default must find the latest clearing
// further back (live v018: newest finalized 196, latest clearing 184), and an explicit ?epoch= older than the first page must still open (FE-A01).
const base = '/x207/circles/agents-main'
const row = (epoch: number, cleared: string, phase = 'finalized') => ({ epoch, phase, proposalDeadline: '2026-11-09T10:10:00Z', cleared, edgeCount: cleared === '0' ? 0 : 3 })
const range = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => from - i)

function circleWith(clearing: number[], { pageOne = range(59, 50), pageTwo = range(49, 30) } = {}) {
  const cleared = (n: number) => (clearing.includes(n) ? '21800000' : '0')
  const list = (items: object[], nextCursor: string | null): FixtureReply => {
    const reply = fixtureReply(`${base}/epochs`)
    return { ...reply, body: { ...(reply.body as object), items, nextCursor } }
  }
  return (path: string): FixtureReply | undefined => {
    const url = new URL(path, 'http://fixture')
    if (url.pathname === `${base}/epochs`) {
      const cursor = url.searchParams.get('cursor')
      if (cursor === null) return list([row(60, '0', 'open'), ...pageOne.map((n) => row(n, cleared(n)))], 'page-2')
      if (cursor === 'page-2') return list(pageTwo.map((n) => row(n, cleared(n))), null)
    }
    // every epoch answers like the finalized fixture epoch 41, with its own number and clearing result
    const one = url.pathname.match(/\/epochs\/(\d+)(\/\w+)?$/)
    if (one && Number(one[1]) !== 41) {
      const n = Number(one[1])
      const reply = fixtureReply(path.replace(`/epochs/${n}`, '/epochs/41'))
      const body = { ...(reply.body as object), epoch: n }
      if (one[2] === '/metrics') Object.assign(body, clearing.includes(n) ? {} : { ...metrics[41], epoch: n, cleared: '0', clearedRatio: 0, voucherCount: 0 })
      return { ...reply, body }
    }
    return undefined
  }
}

const note = () => screen.queryByRole('note')
const cursorReads = (paths: string[]) => paths.filter((url) => url.includes('cursor=')).length

describe('FE-118 /stats default epoch', () => {
  it('TC-FE-118-05 without ?epoch= the page opens on the latest epoch with clearing, found past the first page, and says the newest is empty', async () => {
    const { calls } = renderApp('/stats', circleWith([48]))
    expect(await screen.findByRole('heading', { name: 'Epoch 48 clearing result' })).toBeInTheDocument()
    expect(note()).toHaveTextContent('Latest epoch with clearing: 48 · latest epoch: 59 (empty)')
    expect(cursorReads(calls())).toBe(1)
    // the picker lists the selected epoch although it is older than the first page
    expect(screen.getByRole('combobox', { name: 'Epoch' })).toHaveValue('48')

    fireEvent.click(screen.getByRole('button', { name: 'Open epoch 59' }))
    expect(await screen.findByRole('heading', { name: 'Epoch 59 clearing result' })).toBeInTheDocument()
    // an epoch the visitor chose is shown as it is, without the note
    expect(note()).toBeNull()
  })

  it('TC-FE-118-06 a latest clearing on the first page needs no further page; the newest finalized one with clearing shows no note', async () => {
    const first = renderApp('/stats', circleWith([55]))
    expect(await screen.findByRole('heading', { name: 'Epoch 55 clearing result' })).toBeInTheDocument()
    expect(note()).toHaveTextContent('Latest epoch with clearing: 55 · latest epoch: 59 (empty)')
    expect(cursorReads(first.calls())).toBe(0)
    first.unmount()

    renderApp('/stats', circleWith([59, 48]))
    expect(await screen.findByRole('heading', { name: 'Epoch 59 clearing result' })).toBeInTheDocument()
    expect(note()).toBeNull()
  })

  it('TC-FE-118-07 an explicit ?epoch= older than the first page of the list opens that epoch (FE-A01)', async () => {
    const { calls } = renderApp('/stats?epoch=35', circleWith([48]))
    expect(await screen.findByRole('heading', { name: 'Epoch 35 clearing result' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Epoch' })).toHaveValue('35')
    expect(note()).toBeNull()
    expect(calls().some((url) => url.includes('/epochs/35/metrics'))).toBe(true)
  })

  it('TC-FE-118-08 an epoch number the circle does not have falls back to the default after the walk', async () => {
    renderApp('/stats?epoch=7', circleWith([48]))
    // 7 is older than the whole list: the walk ends and the page opens on the default instead of waiting forever
    expect(await screen.findByRole('heading', { name: 'Epoch 48 clearing result' })).toBeInTheDocument()
  })

  it('TC-FE-118-09 Home lists the latest epoch with clearing when the newest epochs are all empty', async () => {
    // Home lives at /app (the landing at / is not part of this)
    renderApp('/app', circleWith([35]))
    expect(await screen.findByRole('link', { name: 'Epoch 35 statement' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/and epoch 35, the latest with clearing/)).toBeInTheDocument())
  })
})
