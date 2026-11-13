// FE-121: the tour engine: keyboard, Escape, focus, narration, resume, reduced motion; and the story of the real steps (order, claims, words).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APPRAISAL_CLAIM } from '../components/AppraisalBadge'
import { loadProgress, saveProgress } from './state'
import { STEPS, type Step } from './steps'
import Tour from './Tour'

const FAST = { poll: 5, wait: 40, settle: 0, settleAfterRoute: 0, move: 0 }

const steps: Step[] = [
  { id: 'a', title: 'Alpha', body: () => <p>Alpha body</p>, say: 'alpha said' },
  { id: 'b', title: 'Beta', target: '#beta', body: () => <p>Beta body</p>, say: 'beta said' },
  { id: 'c', title: 'Gamma', target: '#nowhere', body: () => <p>Gamma body</p>, say: 'gamma said' },
  { id: 'd', title: 'Delta', body: () => <p>Delta body</p>, say: 'delta said' },
]

function mount(props: { restart?: boolean } = {}) {
  const onExit = vi.fn()
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <div className="shell">
          <main id="content" tabIndex={-1}>
            <div id="beta">Beta box</div>
            <button type="button">Outside</button>
          </main>
        </div>
        <Tour steps={steps} timing={FAST} onExit={onExit} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...view, onExit }
}

const dialog = () => screen.getByRole('dialog')
const count = () => document.querySelector('.tour-count')?.textContent
const live = () => document.querySelector('.tour-sr')?.textContent ?? ''
const key = (k: string, el: Element = dialog()) => fireEvent.keyDown(el, { key: k })

function reducedMotion(on: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: on && query.includes('reduce'),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }))
}

describe('tour engine', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    reducedMotion(false)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens as a labelled modal dialog at step 1, with Next focused and the step narrated', async () => {
    mount()
    const d = dialog()
    expect(d).toHaveAttribute('aria-modal', 'true')
    expect(d).toHaveAccessibleName('Alpha')
    expect(count()).toContain('Step 1 of 4')
    await waitFor(() => expect(document.activeElement).toHaveClass('tour-next'))
    expect(live()).toBe('Step 1 of 4: Alpha. alpha said')
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Exit the tour' })).toBeVisible()
    expect(screen.getByRole('list', { name: 'Steps' }).querySelectorAll('button')).toHaveLength(4)
  })

  it('moves with the arrow keys, Enter, Home and End', async () => {
    mount()
    key('ArrowRight')
    expect(count()).toContain('Step 2 of 4')
    key('ArrowLeft')
    expect(count()).toContain('Step 1 of 4')
    key('Enter', dialog())
    expect(count()).toContain('Step 2 of 4')
    key('End')
    expect(count()).toContain('Step 4 of 4')
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start over' })).toBeInTheDocument()
    key('ArrowRight')
    key('Home')
    expect(count()).toContain('Step 1 of 4')
    key('ArrowLeft')
    expect(count()).toContain('Step 1 of 4')
    fireEvent.click(screen.getByRole('button', { name: 'Step 3: Gamma' }))
    expect(count()).toContain('Step 3 of 4')
    expect(screen.getByRole('button', { name: 'Step 3: Gamma' })).toHaveAttribute('aria-current', 'step')
  })

  it('leaves on Escape from anywhere, and remembers the step', async () => {
    const { onExit } = mount()
    key('ArrowRight')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(loadProgress()).toEqual({ step: 1, done: false })
  })

  it('marks the tour done on Finish', async () => {
    const { onExit } = mount()
    key('End')
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(loadProgress()).toEqual({ step: 3, done: true })
  })

  it('keeps focus inside the panel', async () => {
    mount()
    await waitFor(() => expect(document.activeElement).toHaveClass('tour-next'))
    act(() => screen.getByRole('button', { name: 'Outside' }).focus())
    await waitFor(() => expect(dialog().contains(document.activeElement)).toBe(true))
  })

  it('says so, in text and aloud, when a target is not on the page', async () => {
    mount()
    key('ArrowRight')
    key('ArrowRight')
    await waitFor(() => expect(document.querySelector('.tour-miss')).not.toBeNull())
    expect(live()).toContain('This part of the page is not shown right now.')
    expect(screen.getByText('Gamma body')).toBeInTheDocument()
  })

  it('resumes where it was left, and says so; restart opens at the start', async () => {
    saveProgress({ step: 2, done: false })
    mount()
    expect(count()).toContain('Step 3 of 4')
    expect(live().startsWith('Resuming the tour. Step 3 of 4: Gamma.')).toBe(true)
    cleanup()
    mount({ restart: true })
    expect(count()).toContain('Step 1 of 4')
  })

  it('zooms the app onto the target', async () => {
    mount()
    key('ArrowRight')
    await waitFor(() => expect((document.querySelector('.shell') as HTMLElement).style.transform).toMatch(/translate\(.+\) scale\(/))
    expect(document.querySelector('.tour')).not.toHaveAttribute('data-still')
  })

  it('with reduced motion, highlights without any zoom', async () => {
    reducedMotion(true)
    mount()
    expect(document.querySelector('.tour')).toHaveAttribute('data-still')
    key('ArrowRight')
    await waitFor(() => expect(document.querySelector('.tour-ring')).not.toHaveAttribute('hidden'))
    expect((document.querySelector('.shell') as HTMLElement).style.transform).toBe('')
  })

  it('gives the page back as it was on exit', async () => {
    const { unmount } = mount()
    key('ArrowRight')
    await waitFor(() => expect((document.querySelector('.shell') as HTMLElement).style.transform).not.toBe(''))
    expect(document.documentElement.style.overflow).toBe('hidden')
    const shell = document.querySelector('.shell') as HTMLElement
    unmount()
    expect(shell.style.transform).toBe('')
    expect(document.documentElement.style.overflow).toBe('')
  })
})

describe('tour story', () => {
  it('tells the steps in story order', () => {
    expect(STEPS.map((s) => s.id)).toEqual(['intro', 'listings', 'appraisal', 'proof', 'offer', 'credit', 'replay', 'net', 'agents', 'dao', 'done'])
    expect(STEPS.length).toBeGreaterThanOrEqual(8)
    expect(STEPS.length).toBeLessThanOrEqual(12)
    expect(new Set(STEPS.map((s) => s.theme).filter(Boolean))).toEqual(new Set(['Matching', 'Pricing', 'Timing']))
  })

  const text = (s: Step, live: boolean) => {
    const D = s.diagram
    return `${s.title} ${s.say} ${renderToStaticMarkup(<>{s.body({ live, sample: !live })}{D && <D still />}</>).replace(/<[^>]+>/g, ' ')}`
  }
  const all = [true, false].map((l) => STEPS.map((s) => text(s, l)).join(' ')).join(' ')

  it('states the TEE claim word for word', () => {
    expect(APPRAISAL_CLAIM).toBe('Signature checked locally; quote checked via third-party verifiers (Phala, NVIDIA NRAS).')
    expect(text(STEPS.find((s) => s.id === 'proof')!, true)).toContain(APPRAISAL_CLAIM)
  })

  it('uses the recorded numbers of epoch 184', () => {
    const replay = text(STEPS.find((s) => s.id === 'replay')!, true)
    for (const n of ['184', '81', '72', '88.9%']) expect(replay).toContain(n)
    const net = text(STEPS.find((s) => s.id === 'net')!, true)
    expect(net).toContain('alice pays 8 USDT')
    expect(net).toMatch(/8 USDT moved/)
    expect(net).toContain('testnet')
  })

  it('never uses the banned words', () => {
    const banned = [/trustless/i, /DCAP-verified/i, /\bvalidators?\b/i, /only NEAR/i, /zero-trust/i, /autonomous/i, /decentralized facilitator/i, /verified on-chain/i, /attested/i, /\bfirst\b/i, /\bonly (one|protocol|solution)\b/i, /mainnet/i]
    for (const b of banned) expect(all).not.toMatch(b)
  })
})
