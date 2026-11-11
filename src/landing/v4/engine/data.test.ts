import { afterEach, describe, expect, it, vi } from 'vitest'
import { EpochScene, findCycles, PHASES } from './scene.js'
import { EpochScene3D, mountScene3D } from './scene3d.js'
import { labelOf, memberCount, name, recompute, STATUS, X207, type SceneData } from './x207.js'

// v4 app: the epoch scene plays injected data as well as the epoch 8 snapshot of the landing. The first group pins the snapshot (the landing must not change);
// the others check what is derived from the data (members, net, loops, captions, sizes) and that the scenes draw and clean up with a fake canvas.

// Three members in one loop (ann, bob, cy: 3.00 each), ann also owes dee 5.00, dee owes eve 2.00. Ann is the only debtor (5.00); dee and eve are paid.
const small: SceneData = {
  edges: [[0, 1, 300, 300], [1, 2, 300, 300], [2, 0, 300, 300], [0, 3, 500, 0], [3, 4, 200, 0]],
  outcome: ['due', 'flat', 'flat', 'claimable', 'claimed'],
  names: ['ann', 'bob', 'cy', 'dee', 'eve'],
}

describe('the epoch 8 snapshot is what it was', () => {
  it('15 members, 24 vouchers, 6 loops, 7.75 to settle', () => {
    const r = recompute()
    expect(memberCount()).toBe(15)
    expect(r.net).toHaveLength(15)
    expect([r.gross, r.cleared, r.payIn, r.payOut, r.transfers, r.sum]).toEqual([4135, 2180, 775, 775, 14, 0])
    expect(findCycles(X207.edges)).toHaveLength(6)
  })

  it('the model without data plays the snapshot with its own captions and its fixed net of 775', () => {
    const m = EpochScene.model()
    expect(m.phases).toBe(PHASES)
    expect(m.max).toBe(5)
    expect(m.K).toBe(6)
    expect([m.ak, m.vk, m.rs, m.showLabels]).toEqual([1, 1, 1, true])
    const end = m.stateAt(5)
    expect([end.owed, end.cancelled, end.net, end.paidIn + end.stake, end.paidOut + end.waiting, end.vouchers, end.loops]).toEqual([4135, 2180, 775, 775, 775, 24, 6])
    expect(end.stake).toBe(55)
    expect(m.stateAt(2.5).net).toBeGreaterThan(0)
  })

  it('the model of the snapshot keeps the formulas it had before data was injected: reveal, loop windows and payment staggers', () => {
    const m = EpochScene.model()
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
    const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
    for (let p = 0; p <= 5; p += 0.05) {
      m.E.forEach((_, i) => expect(m.reveal(i, p)).toBeCloseTo(p >= 1 ? 1 : easeOut(clamp01((p - m.rank[i] / 27) / (4 / 27))), 12))
      for (let k = 0; k < 6; k++) {
        expect(m.cancelOf(k, p)).toBeCloseTo(p >= 2 ? 1 : p <= 1 ? 0 : easeIO(clamp01(((p - 1) * 6 - k - 0.45) / 0.55)), 12)
        const u = (p - 1) * 6 - k
        expect(m.glowOf(k, p)).toBeCloseTo(p <= 1 || p >= 2 ? 0 : u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0, 12)
      }
      m.debtors.forEach((i, k) => {
        const want = p <= 3 ? 0 : X207.outcome[i] === 'defaulted' ? easeIO(clamp01((p - 3 - 0.58) / 0.4)) : easeIO(clamp01((p - 3) * 1.7 - k * 0.11))
        expect(m.payOf(i, p)).toBeCloseTo(want, 12)
      })
      m.creditors.forEach((i, k) => expect(m.payOf(i, p)).toBeCloseTo(p <= 4 ? 0 : easeIO(clamp01((p - 4) * 1.7 - k * 0.09)), 12))
    }
    expect(m.order).toEqual(X207.edges.map((_, i) => i).sort((a, b) => ((a * 7) % 24) - ((b * 7) % 24)))
  })

  it('names stay m00, m01, ... and `name` keeps one argument (the landing maps it over an array)', () => {
    expect(name(3)).toBe('m03')
    expect([1, 2].map(name)).toEqual(['m01', 'm02'])
    expect(labelOf(3)).toBe('m03')
    expect(labelOf(1, ['x', 'y'])).toBe('y')
    expect(labelOf(5, ['x', 'y'])).toBe('m05')
  })
})

describe('injected data', () => {
  it('members are the longest of the outcomes, the names and the highest index an edge points at', () => {
    expect(memberCount(small)).toBe(5)
    expect(memberCount({ edges: [[0, 7, 1, 0]], outcome: [] })).toBe(8)
    expect(memberCount({ edges: [], outcome: ['flat', 'flat'], names: ['a', 'b', 'c'] })).toBe(3)
  })

  it('recompute derives the member count and the net from the edges, not from 15 and 775', () => {
    const r = recompute(small)
    expect(r.net).toEqual([-500, 0, 0, 300, 200])
    expect([r.gross, r.cleared, r.payIn, r.payOut, r.transfers, r.sum]).toEqual([1600, 900, 500, 500, 3, 0])
  })

  it('status 402 is a result of its own: unpaid but still inside the payment window', () => {
    expect(STATUS.due).toEqual(['s402', '402', 'Payment due'])
  })

  it('findCycles drops cleared amounts that do not close into a loop instead of failing', () => {
    expect(findCycles([[0, 1, 100, 100], [1, 2, 50, 50]])).toEqual([])
    const one = findCycles([[0, 1, 100, 50], [1, 0, 100, 50], [1, 2, 100, 30]])
    expect(one).toHaveLength(1)
    expect(one[0]).toMatchObject({ members: [0, 1], edgeIdx: [0, 1], amount: 50 })
    expect(findCycles(small.edges)).toEqual([{ members: [0, 1, 2], edgeIdx: [0, 1, 2], amount: 300 }])
  })

  it('every figure comes from the data; an epoch in its payment window stops at the end of that step and counts the debtor still due', () => {
    const m = EpochScene.model({ ...small, until: 3.999, start: 3.999 })
    expect(m.max).toBe(3.999)
    expect(m.K).toBe(1)
    const s = m.stateAt(3.999)
    expect(s).toMatchObject({ owed: 1600, cancelled: 900, paidIn: 0, stake: 0, due: 500, paidOut: 0, waiting: 0, vouchers: 5, loops: 1, phase: 3, name: 'Payment window' })
    expect(s.net).toBeCloseTo(500) // the net of this data, not 775
    expect(s.caption).toBe('1 member owes after netting. 1 member can still pay before the window closes.')
  })

  it('a finalized epoch: the debtor that did not pay is covered from its stake, and the captions count the members of this epoch', () => {
    const m = EpochScene.model({ ...small, outcome: ['defaulted', 'flat', 'flat', 'claimable', 'claimed'] })
    const s = m.stateAt(5)
    expect([s.paidIn, s.stake, s.due, s.paidOut, s.waiting]).toEqual([0, 500, 0, 200, 300])
    expect(m.phases[3][1]).toBe('1 member owes after netting. 1 member did not pay, and 5.00 comes out of its stake.')
    expect(m.phases[4][1]).toBe('2 members are paid. 1 claimed, 1 can claim when they like.')
    expect(m.phases[0]).toBe(PHASES[0])
  })

  it('the stagger of the payments is squeezed when there are many members, so the last one still finishes inside its step', () => {
    const n = 30
    const edges: SceneData['edges'] = []
    for (let i = 0; i < n; i += 2) edges.push([i, i + 1, 100, 0])
    const m = EpochScene.model({ edges, outcome: Array.from({ length: n }, (_, i) => (i % 2 ? 'claimed' : 'paid')) })
    const last = m.debtors[m.debtors.length - 1]
    expect(m.payOf(last, 3.999)).toBeGreaterThan(0.999)
    expect(m.payOf(m.creditors[m.creditors.length - 1], 5)).toBeGreaterThan(0.999)
    expect(m.stateAt(5).paidIn).toBe(1500)
  })

  it('sizes follow the data: a crowded ring has small members and no labels, and large amounts do not make large orbs', () => {
    const big: SceneData = { edges: Array.from({ length: 40 }, (_, i) => [i, (i + 1) % 40, 5_000_000, 5_000_000] as [number, number, number, number]), outcome: [] }
    const m = EpochScene.model(big)
    expect(m.n).toBe(40)
    expect(m.showLabels).toBe(false)
    expect(m.rs).toBeLessThan(0.5)
    expect(m.ak).toBeCloseTo(500 / 5_000_000)
    expect(EpochScene.model({ ...big, labels: true }).showLabels).toBe(true)
    expect(EpochScene.model(small).showLabels).toBe(true)
  })
})

// A canvas that accepts every call, so the drawing code runs without a GPU or a layout.
const fakeContext = new Proxy({} as Record<string | symbol, unknown>, {
  get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
  set: (t, k, v) => ((t[k] = v), true),
})

function floor(): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = `<canvas></canvas><div class="scene-tip" hidden></div>
    <span data-k="phase"></span><span data-k="caption"></span><span data-k="owed"></span><span data-k="cancelled"></span><span data-k="moved"></span>
    <span data-k="sub-owed"></span><span data-k="sub-cancelled"></span><span data-k="sub-moved"></span>
    <button data-play>Replay</button><input type="range" min="0" max="1000" value="1000"><button data-chapter>Open</button><button data-chapter>Clearing</button><button data-chapter>Commit</button><button data-chapter>Payment</button><button data-chapter>Finalized</button>`
  document.body.append(root)
  return root
}

describe('the scenes with a fake canvas', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })
  const stub = () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext as never)
  }

  it('draw every step of 3D scenes for small data, a crowded ring, an epoch without loops and one without edges', () => {
    stub()
    const crowded: SceneData = {
      edges: [...Array.from({ length: 40 }, (_, i) => [i, (i + 1) % 40, 120 + i, 100] as [number, number, number, number]), [3, 9, 700, 0], [11, 2, 90, 0]],
      outcome: Array.from({ length: 40 }, (_, i) => (['paid', 'due', 'defaulted', 'claimed', 'claimable', 'flat'] as const)[i % 6]),
    }
    for (const data of [small, crowded, { edges: [[0, 1, 400, 0]], outcome: ['paid', 'claimed'] } as SceneData, { edges: [], outcome: [] } as SceneData]) {
      const scene = new EpochScene3D(floor(), data)
      for (const p of [0, 0.4, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]) scene.draw(p, p * 3)
      scene.setHover(0)
      expect(scene.tip!.innerHTML).toContain('Owed to others')
      scene.destroy()
    }
  })

  it('names in the tip are escaped, and labelled from `names`', () => {
    stub()
    const scene = new EpochScene3D(floor(), { ...small, names: ['<b>ann</b>', 'bob', 'cy', 'dee', 'eve'] })
    scene.draw(5, 1)
    scene.setHover(0)
    expect(scene.tip!.innerHTML).toContain('&lt;b&gt;ann&lt;/b&gt;')
    expect(scene.tip!.innerHTML).toContain('s402')
    scene.destroy()
  })

  it('mountScene3D fills the read-outs with the end figures at once, plays on the button, and destroy takes the controls off again', () => {
    stub()
    const root = floor()
    const q = (k: string) => root.querySelector(`[data-k=${k}]`)!.textContent
    const scene = mountScene3D(root, { data: { ...small, until: 3.999, start: 3.999 }, subMoved: (s) => `${s.due} due` })
    expect([q('owed'), q('cancelled'), q('moved'), q('sub-owed'), q('sub-cancelled'), q('sub-moved'), q('phase')]).toEqual(['16.00', '9.00', '0.00', '5 of 5 vouchers', '1 of 1 loop', '500 due', 'Payment window'])
    expect(q('caption')).toBe('1 member owes after netting. 1 member can still pay before the window closes.')
    expect(root.dataset.phase).toBe('3')
    const play = root.querySelector<HTMLButtonElement>('[data-play]')!
    expect(play.textContent).toBe('Replay')
    play.click()
    expect(scene.playing).toBe(true)
    expect(scene.target).toBe(0) // from the start, not from where the epoch stopped
    expect(play.textContent).toBe('Pause')
    play.click()
    expect(scene.playing).toBe(false)
    // chapters jump to the end of their step but never past where the epoch has got to
    root.querySelectorAll<HTMLButtonElement>('[data-chapter]')[4].click()
    expect(scene.target).toBeCloseTo(3.999)
    root.querySelectorAll<HTMLButtonElement>('[data-chapter]')[1].click()
    expect(scene.target).toBeCloseTo(1.999)
    scene.destroy()
    scene.destroy() // safe twice
    const before = scene.target
    play.click()
    root.querySelectorAll<HTMLButtonElement>('[data-chapter]')[0].click()
    expect(scene.playing).toBe(false)
    expect(scene.target).toBe(before)
  })

  it('without data the 3D scene is still the landing story: 24 vouchers, 6 loops, 7.75 moved', () => {
    stub()
    const root = floor()
    const scene = mountScene3D(root)
    scene.setTarget(5, true)
    scene.draw(5, 1)
    scene.emit()
    const q = (k: string) => root.querySelector(`[data-k=${k}]`)!.textContent
    expect([q('owed'), q('cancelled'), q('moved'), q('sub-owed'), q('sub-cancelled'), q('sub-moved')]).toEqual(['41.35', '21.80', '7.75', '24 of 24 vouchers', '6 of 6 loops', '4.95 claimed, 2.80 waiting'])
    scene.destroy()
  })
})
