// The hero ring of the v4 landing (port of the HeroRing class of the approved draft 40-landing.html): the 15 agents of epoch 8 as orbs with eyes on a ring,
// the 24 real debts as arcs, and one real loop of the solver lit at a time. Light lines run from the four glass cards to the ring. The canvas is decorative (aria-hidden
// by its owner); the caption under it (livecap) names the loop that is being cancelled.
import { X207, fmt, name } from './engine/x207.js'
import { findCycles, type Cycle } from './engine/scene.js'

type Pt = [number, number]
type Cubic = [Pt, Pt, Pt, Pt]

const lerp = (A: Pt, B: Pt, t: number): Pt => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]
/** The point at t of a cubic (de Casteljau). */
const at = ([A, B, C, D]: Cubic, t: number): Pt => {
  const ab = lerp(A, B, t)
  const bc = lerp(B, C, t)
  const cd = lerp(C, D, t)
  return lerp(lerp(ab, bc, t), lerp(bc, cd, t), t)
}
/** The piece of a cubic between t0 and t1, as a cubic of its own. */
const sub = (K: Cubic, t0: number, t1: number): Cubic => {
  const left = ([A, B, C, D]: Cubic, t: number): Cubic => {
    const ab = lerp(A, B, t)
    const bc = lerp(B, C, t)
    const cd = lerp(C, D, t)
    const abc = lerp(ab, bc, t)
    return [A, ab, abc, lerp(abc, lerp(bc, cd, t), t)]
  }
  const right = ([A, B, C, D]: Cubic, t: number): Cubic => left([D, C, B, A], 1 - t).reverse() as Cubic
  return right(left(K, t1), t0 / t1)
}

const TAU = 6.2832
const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16))
  const A = p(a)
  const B = p(b)
  return `rgb(${A.map((v, k) => Math.round(v + (B[k] - v) * t)).join(',')})`
}

/** True when the browser can draw a 2D canvas (jsdom and a few locked-down browsers cannot): the landing then keeps the static markup. */
export function canDraw2D(canvas: HTMLCanvasElement): boolean {
  try {
    return typeof ResizeObserver !== 'undefined' && !!canvas.getContext('2d')
  } catch {
    return false
  }
}

export class HeroRing {
  private readonly cv: HTMLCanvasElement
  private readonly cap: HTMLElement
  private readonly reduced: boolean
  private readonly x: CanvasRenderingContext2D
  private readonly cards: HTMLElement[]
  private readonly cycles: Cycle[]
  private readonly E = X207.edges
  private readonly phase: number[]
  private readonly ro: ResizeObserver
  private readonly io: IntersectionObserver
  private ptr: Pt | null = null
  private k = -1
  private visible = true
  private raf = 0
  private dead = false
  private W = 0
  private H = 0
  private cx = 0
  private cy = 0
  private R = 0
  private or = 0
  private side = false
  private anchors: Pt[] = []
  private agentFont = 'monospace'
  private monoFont = 'monospace'
  private readonly onMove = (e: PointerEvent) => {
    const b = this.cv.getBoundingClientRect()
    this.ptr = [e.clientX - b.left, e.clientY - b.top]
  }
  private readonly onLeave = () => {
    this.ptr = null
  }

  private readonly onLoop?: (k: number) => void

  /** `onLoop` hears the index (in findCycles order) of the loop being cancelled, each time it changes. */
  constructor(stage: HTMLElement, cap: HTMLElement, reduced: boolean, onLoop?: (k: number) => void) {
    const cv = stage.querySelector('canvas')
    const x = cv?.getContext('2d')
    if (!cv || !x) throw new Error('HeroRing needs a 2D canvas')
    this.cv = cv
    this.x = x
    this.cap = cap
    this.onLoop = onLoop
    this.reduced = reduced
    this.cards = [...stage.querySelectorAll<HTMLElement>('[data-anchor]')]
    this.cycles = findCycles(this.E)
    this.phase = this.E.map((_, i) => (i * 0.618) % 1)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(cv)
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting
      if (this.visible) this.tick()
    })
    this.io.observe(cv)
    cv.addEventListener('pointermove', this.onMove)
    cv.addEventListener('pointerleave', this.onLeave)
    this.resize()
  }

  /** Starts the animation loop (a still frame is enough under reduced motion: resize() already drew it). */
  start() {
    this.tick()
  }

  /** Called when the tab shows again. */
  wake() {
    this.tick()
  }

  destroy() {
    this.dead = true
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.ro.disconnect()
    this.io.disconnect()
    this.cv.removeEventListener('pointermove', this.onMove)
    this.cv.removeEventListener('pointerleave', this.onLeave)
  }

  private resize() {
    if (this.dead) return
    const b = this.cv.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.W = b.width
    this.H = b.height
    this.cv.width = Math.round(b.width * dpr)
    this.cv.height = Math.round(b.height * dpr)
    this.x.setTransform(dpr, 0, 0, dpr, 0, 0)
    const root = getComputedStyle(document.documentElement)
    this.agentFont = root.getPropertyValue('--ds-font-agent').trim() || 'monospace'
    this.monoFont = root.getPropertyValue('--ds-font-mono').trim() || 'monospace'
    this.side = this.cards.length > 0 && getComputedStyle(this.cards[0]).position === 'absolute'
    this.cx = this.W / 2
    this.cy = this.side ? this.H * 0.47 : this.H / 2
    this.R = this.side ? Math.min(this.H * 0.36, this.W * 0.22) : Math.min(this.W, this.H) * 0.37
    this.or = Math.max(9, this.R * 0.075)
    this.anchors = this.side
      ? this.cards.map((c) => {
          const r = c.getBoundingClientRect()
          const left = c.dataset.anchor === 'left'
          return [(left ? r.right : r.left) - b.left, r.top + r.height / 2 - b.top] as Pt
        })
      : []
    this.draw(performance.now() / 1000)
  }

  private tick() {
    if (this.raf || this.dead) return
    this.raf = requestAnimationFrame((t) => {
      this.raf = 0
      if (this.dead) return
      this.draw(t / 1000)
      if (this.visible && !this.reduced && !document.hidden) this.tick()
    })
  }

  private pos(i: number, t: number): [number, number, number] {
    const a = (i / 15) * TAU - 1.5708 + (this.reduced ? 0 : t * 0.025)
    return [this.cx + this.R * Math.cos(a), this.cy + this.R * Math.sin(a), a]
  }

  /** A debt from P to Q as a soft arc: pulled toward the middle of the ring in proportion to its length and bent a little to one side, so near neighbours get a
   * shallow arc and long debts a wide sweep instead of a straight chord. Trimmed at the orbs' edges, so it starts and ends at the faces, not inside them. */
  private cubic(P: Pt, Q: Pt): Cubic {
    const dx = Q[0] - P[0]
    const dy = Q[1] - P[1]
    const len = Math.hypot(dx, dy) || 1
    const k = 0.34 * Math.min(1, len / (1.4 * this.R))
    const side = len * 0.14
    const c = (A: Pt): Pt => [A[0] + (this.cx - A[0]) * k - (dy / len) * side, A[1] + (this.cy - A[1]) * k + (dx / len) * side]
    const trim = Math.min(0.42, (this.or + 3) / (len * 1.08))
    return sub([P, c(P), c(Q), Q], trim, 1 - trim)
  }

  /** Strokes a cubic with a gradient along it: faint where the debt starts, brighter where it lands. */
  private stroke(C: Cubic, w: number, a0: number, a1: number, rgb: string) {
    const x = this.x
    const g = x.createLinearGradient(C[0][0], C[0][1], C[3][0], C[3][1])
    g.addColorStop(0, `rgba(${rgb},${a0})`)
    g.addColorStop(1, `rgba(${rgb},${a1})`)
    x.beginPath()
    x.moveTo(C[0][0], C[0][1])
    x.bezierCurveTo(C[1][0], C[1][1], C[2][0], C[2][1], C[3][0], C[3][1])
    x.lineWidth = w
    x.lineCap = 'round'
    x.strokeStyle = g
    x.stroke()
  }

  private draw(t: number) {
    const x = this.x
    const reduced = this.reduced
    const P = Array.from({ length: 15 }, (_, i) => this.pos(i, t))
    const period = 2.9
    x.clearRect(0, 0, this.W, this.H)
    // which real loop is being cancelled now
    const k = reduced ? 0 : Math.floor(t / period) % this.cycles.length
    const u = reduced ? 0.5 : (t / period) % 1
    const glow = Math.sin(Math.PI * Math.min(1, u * 1.15))
    const cyc = this.cycles[k]
    const hot = new Set(cyc.edgeIdx)
    const inLoop = new Set(cyc.members)
    if (k !== this.k) {
      this.k = k
      this.onLoop?.(k)
      const path = cyc.members.map(name).concat(name(cyc.members[0])).join(' › ')
      const tag = (text: string) => Object.assign(document.createElement('span'), { className: 'k', textContent: text })
      this.cap.replaceChildren(tag('solver ›'), ` loop ${path} · −${fmt(cyc.amount)} on ${cyc.members.length} debts `, tag('· contract ›'), ' net positions unchanged ✓')
    }
    // light lines from the glass cards
    this.anchors.forEach(([ax, ay], j) => {
      const a = Math.atan2(ay - this.cy, ax - this.cx)
      const rx = this.cx + (this.R + this.or + 10) * Math.cos(a)
      const ry = this.cy + (this.R + this.or + 10) * Math.sin(a)
      const g = x.createLinearGradient(ax, ay, rx, ry)
      g.addColorStop(0, 'rgba(169,203,255,0.55)')
      g.addColorStop(1, 'rgba(169,203,255,0)')
      x.beginPath()
      x.moveTo(ax, ay)
      x.lineTo(rx, ry)
      x.strokeStyle = g
      x.lineWidth = 1.2
      x.stroke()
      if (!reduced) {
        const q = (t * 0.35 + j * 0.25) % 1
        x.beginPath()
        x.arc(ax + (rx - ax) * q, ay + (ry - ay) * q, 2, 0, TAU)
        x.fillStyle = '#a9cbff'
        x.globalAlpha = 1 - q
        x.fill()
        x.globalAlpha = 1
      }
    })
    // the circle: one hairline
    x.beginPath()
    x.arc(this.cx, this.cy, this.R, 0, TAU)
    x.strokeStyle = 'rgba(255,255,255,0.13)'
    x.lineWidth = 1
    x.stroke()
    // the debts: thin, even curves; the loop being cancelled is drawn brighter, with one bead running along it
    this.E.forEach(([d, c], i) => {
      if (hot.has(i)) return
      this.stroke(this.cubic([P[d][0], P[d][1]], [P[c][0], P[c][1]]), 1.1, 0.04, 0.26, '255,255,255')
    })
    this.E.forEach(([d, c], i) => {
      if (!hot.has(i)) return
      const C = this.cubic([P[d][0], P[d][1]], [P[c][0], P[c][1]])
      this.stroke(C, 1.6, 0.15 + 0.35 * glow, 0.4 + 0.55 * glow, '255,255,255')
      if (!reduced) {
        const [bx, by] = at(C, (t * 0.45 + this.phase[i]) % 1)
        x.beginPath()
        x.arc(bx, by, 2.2, 0, TAU)
        x.fillStyle = '#ffffff'
        x.globalAlpha = 0.9 * glow
        x.fill()
        x.globalAlpha = 1
      }
    })
    // centre
    x.fillStyle = 'rgba(255,255,255,0.45)'
    x.font = `500 12px ${this.agentFont}`
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.fillText('epoch 8', this.cx, this.cy - 8)
    x.fillStyle = 'rgba(91,227,160,0.85)'
    x.fillText(`loop ${k + 1} of ${this.cycles.length}`, this.cx, this.cy + 10)
    // agents: orbs with eyes
    P.forEach(([px, py], i) => {
      const on = inLoop.has(i)
      const rad = this.or + (on ? 2 * glow : 0)
      x.beginPath()
      x.ellipse(px + 2, py + rad * 0.98, rad * 0.86, rad * 0.3, 0, 0, TAU)
      x.fillStyle = 'rgba(2,4,20,0.55)'
      x.fill()
      const g = x.createRadialGradient(px - rad * 0.35, py - rad * 0.42, rad * 0.08, px, py, rad)
      g.addColorStop(0, '#ffffff')
      g.addColorStop(1, on ? mix('#c9d2ff', '#5be3a0', glow) : '#c9d2ff')
      x.beginPath()
      x.arc(px, py, rad, 0, TAU)
      x.fillStyle = g
      x.fill()
      if (on && glow > 0.2) {
        x.beginPath()
        x.arc(px, py, rad + 4, 0, TAU)
        x.strokeStyle = '#c8f53c'
        x.globalAlpha = glow
        x.lineWidth = 2
        x.stroke()
        x.globalAlpha = 1
      }
      const [tx, ty] = this.ptr ?? [this.cx, this.cy]
      const dx = tx - px
      const dy = ty - py
      const dl = Math.hypot(dx, dy) || 1
      const lx = (dx / dl) * rad * 0.17
      const ly = (dy / dl) * rad * 0.17
      const blink = !reduced && (t * 0.23 + i * 0.137) % 1 < 0.03
      const happy = on && glow > 0.5
      x.fillStyle = x.strokeStyle = '#0e1330'
      x.lineWidth = Math.max(1.4, rad * 0.12)
      x.lineCap = 'round'
      for (const sx of [-1, 1]) {
        const ex = px + lx + sx * rad * 0.3
        const ey = py + ly - rad * 0.06
        x.beginPath()
        if (happy) {
          x.arc(ex, ey + rad * 0.1, rad * 0.15, Math.PI * 1.15, Math.PI * 1.85)
          x.stroke()
        } else {
          x.ellipse(ex, ey, rad * 0.1, blink ? rad * 0.02 : rad * 0.17, 0, 0, TAU)
          x.fill()
        }
      }
      // the mouth: a small smile, open when the agent is in the loop being cancelled
      const mx = px + lx * 0.6
      const my = py + ly * 0.6 + rad * 0.3
      x.beginPath()
      if (happy) {
        x.arc(mx, my - rad * 0.06, rad * 0.15, 0, Math.PI)
        x.closePath()
        x.fill()
      } else {
        x.arc(mx, my - rad * 0.14, rad * 0.14, Math.PI * 0.22, Math.PI * 0.78)
        x.stroke()
      }
      x.fillStyle = on ? '#c8f53c' : 'rgba(169,182,204,0.85)'
      x.font = `500 ${this.W < 520 ? 10 : 11}px ${this.monoFont}`
      const lr = this.R + rad + 16
      x.fillText(name(i), this.cx + lr * Math.cos(P[i][2]), this.cy + lr * Math.sin(P[i][2]))
    })
  }
}
