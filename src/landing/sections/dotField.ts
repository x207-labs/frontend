// The hero backdrop, after DeepBook's: a sphere seen from the front, its meridians drawn not as dashes but as our agents, the white orbs with eyes of the ring,
// turning slowly. Now and then three or four neighbours pay each other in a loop: the legs are drawn one by one, the loop closes, its agents smile, and the
// legs shrink away, cancelled, as clearing does. Decorative only (the canvas is aria-hidden). Under reduced motion it draws one still frame;
// it pauses when off screen or in a hidden tab. Each face is drawn once into a sprite and then only stamped, so a frame is a few hundred drawImage calls.

const MERIDIANS = 16
const AGENTS = 44 // per meridian, pole to pole
const SPIN = 0.04 // radians per second
const SPRITE = 64 // sprite size in pixels; the orb fills 68% of it, the rest is room for the shadow and the halo

/** One agent face as the ring draws it (engine colours): a soft shadow, a white-to-lavender orb, two eyes and a small smile, or smiling eyes, an open smile and a white halo when lit. */
function face(happy: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = SPRITE
  const x = c.getContext('2d')!
  const m = SPRITE / 2
  const r = SPRITE * 0.34
  if (happy) {
    x.beginPath()
    x.arc(m, m, r + 6, 0, 6.2832)
    x.strokeStyle = 'rgba(255,255,255,0.85)'
    x.lineWidth = 2.5
    x.stroke()
  }
  x.beginPath()
  x.ellipse(m + 1, m + r * 0.98, r * 0.86, r * 0.3, 0, 0, 6.2832)
  x.fillStyle = 'rgba(2,4,20,0.55)'
  x.fill()
  const g = x.createRadialGradient(m - r * 0.35, m - r * 0.42, r * 0.08, m, m, r)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(1, '#c9d2ff')
  x.beginPath()
  x.arc(m, m, r, 0, 6.2832)
  x.fillStyle = g
  x.fill()
  x.fillStyle = x.strokeStyle = '#0e1330'
  x.lineWidth = r * 0.14
  x.lineCap = 'round'
  for (const sx of [-1, 1]) {
    const ex = m + sx * r * 0.3
    const ey = m - r * 0.06
    x.beginPath()
    if (happy) {
      x.arc(ex, ey + r * 0.1, r * 0.15, Math.PI * 1.15, Math.PI * 1.85)
      x.stroke()
    } else {
      x.ellipse(ex, ey, r * 0.1, r * 0.17, 0, 0, 6.2832)
      x.fill()
    }
  }
  x.beginPath()
  if (happy) {
    x.arc(m, m + r * 0.24, r * 0.15, 0, Math.PI)
    x.closePath()
    x.fill()
  } else {
    x.arc(m, m + r * 0.16, r * 0.14, Math.PI * 0.22, Math.PI * 0.78)
    x.stroke()
  }
  return c
}

type Loop = { members: [number, number][]; born: number }

const LOOP_T = 4.6 // seconds a loop lives: drawn leg by leg, closed, then cancelled
const LEG_T = 0.62 // seconds to draw one leg
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2) // cubic in-out, the iOS feel

/** Mounts the field on `canvas` and returns the function that stops it, or null when the browser has no 2D canvas. */
export function mountDotField(canvas: HTMLCanvasElement, reduced: boolean): (() => void) | null {
  let x: CanvasRenderingContext2D | null = null
  try {
    x = typeof ResizeObserver !== 'undefined' ? canvas.getContext('2d') : null
  } catch {
    x = null
  }
  if (!x) return null
  const ctx = x
  const calm = face(false)
  const lit = face(true)
  let W = 0
  let H = 0
  let raf = 0
  let visible = true
  let dead = false
  let nextLoop = 0
  const loops: Loop[] = []

  const resize = () => {
    const b = canvas.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    W = b.width
    H = b.height
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw(performance.now() / 1000)
  }

  /** Where agent j of meridian m is: screen point, depth (0 at the rim, 1 facing you) and longitude. */
  const place = (m: number, j: number, turn: number, R: number, cx: number, cy: number) => {
    const lon = ((m / MERIDIANS) * Math.PI + turn) % Math.PI
    const lat = -Math.PI / 2 + ((j + ((m * 0.37) % 1)) / AGENTS) * Math.PI // a phase per meridian, so the faces read as curves, not as rows
    const cp = Math.cos(lat)
    return { x: cx + R * cp * Math.cos(lon), y: cy + R * Math.sin(lat) * 0.92, depth: cp * Math.sin(lon), lon }
  }

  /** A new loop of three or four neighbouring agents, on the side of the sphere that faces you and above the title. */
  const spawn = (t: number, turn: number, R: number, cx: number, cy: number) => {
    for (let tries = 0; tries < 24; tries++) {
      const m = Math.floor(Math.random() * (MERIDIANS - 1))
      const j = 3 + Math.floor(Math.random() * (AGENTS - 8))
      const members: [number, number][] = Math.random() < 0.5 ? [[m, j], [m + 1, j + 1], [m, j + 2]] : [[m, j], [m + 1, j], [m + 1, j + 2], [m, j + 2]]
      const pts = members.map(([a, b]) => place(a, b, turn, R, cx, cy))
      const lons = pts.map((p) => p.lon)
      if (Math.max(...lons) - Math.min(...lons) < 0.6 && pts.every((p) => p.depth > 0.45 && p.x > 24 && p.x < W - 24 && p.y > 100 && p.y < H * 0.6) && !loops.some((l) => l.members.some(([a, b]) => members.some(([c, d]) => a === c && Math.abs(b - d) < 3)))) {
        loops.push({ members, born: t })
        return
      }
    }
  }

  /** One leg of a loop: a quadratic curve bowed away from the loop's middle, drawn from `s0` to `s1` of its length, its tail fading. */
  const leg = (a: { x: number; y: number }, b: { x: number; y: number }, mid: { x: number; y: number }, s0: number, s1: number, alpha: number, head: boolean) => {
    if (s1 - s0 < 0.005 || alpha <= 0.01) return
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const ox = mx - mid.x
    const oy = my - mid.y
    const ol = Math.hypot(ox, oy) || 1
    const bow = Math.hypot(b.x - a.x, b.y - a.y) * 0.28
    const qx = mx + (ox / ol) * bow
    const qy = my + (oy / ol) * bow
    const at = (s: number) => [(1 - s) ** 2 * a.x + 2 * (1 - s) * s * qx + s * s * b.x, (1 - s) ** 2 * a.y + 2 * (1 - s) * s * qy + s * s * b.y]
    const [x0, y0] = at(s0)
    const [x1, y1] = at(s1)
    const g = ctx.createLinearGradient(x0, y0, x1, y1)
    g.addColorStop(0, `rgba(255,255,255,${(alpha * 0.18).toFixed(3)})`)
    g.addColorStop(1, `rgba(255,255,255,${(alpha * 0.78).toFixed(3)})`)
    ctx.beginPath()
    for (let i = 0; i <= 24; i++) {
      const [px, py] = at(s0 + ((s1 - s0) * i) / 24)
      if (i) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
    }
    ctx.strokeStyle = g
    ctx.lineWidth = 1.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    if (head) {
      ctx.beginPath()
      ctx.arc(x1, y1, 2.2, 0, 6.2832)
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`
      ctx.fill()
    }
  }

  const draw = (t: number) => {
    ctx.clearRect(0, 0, W, H)
    const R = Math.max(W * 0.5, H * 0.86)
    const cx = W / 2
    const cy = H * 0.5
    const unit = Math.min(1, Math.max(0.6, W / 1400)) // faces a little smaller on a phone
    const turn = reduced ? 0.3 : t * SPIN
    if (!reduced) {
      for (let i = loops.length - 1; i >= 0; i--) if (t - loops[i].born > LOOP_T) loops.splice(i, 1)
      if (t > nextLoop && loops.length < 4) {
        spawn(t, turn, R, cx, cy)
        nextLoop = t + 0.45 + Math.random() * 0.6
      }
    }
    // the legs first, so the faces sit on top of them, as on the ring
    const smile = new Map<string, number>()
    for (const l of loops) {
      const age = t - l.born
      const n = l.members.length
      const pts = l.members.map(([a, b]) => place(a, b, turn, R, cx, cy))
      const mid = { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n }
      const closed = n * LEG_T * 0.8 + LEG_T * 0.2 // when the last leg is in
      const cancel = ease((age - closed - 0.55) / 1.1) // the legs shrink to their middle: the loop is cancelled
      const fade = 1 - ease((age - LOOP_T + 0.5) / 0.5)
      const shine = ease((age - closed) / 0.3) * (1 - cancel)
      for (let i = 0; i < n; i++) {
        const draw1 = ease((age - i * LEG_T * 0.8) / LEG_T)
        const s0 = cancel * 0.5
        const s1 = draw1 * (1 - cancel * 0.5)
        leg(pts[i], pts[(i + 1) % n], mid, s0, Math.max(s0, s1), (0.75 + shine * 0.25) * fade * Math.min(1, pts[i].depth + 0.2), draw1 < 1)
      }
      l.members.forEach(([a, b]) => smile.set(`${a}:${b}`, shine))
    }
    for (let m = 0; m < MERIDIANS; m++) {
      for (let j = 1; j < AGENTS; j++) {
        const p = place(m, j, turn, R, cx, cy)
        if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue
        const k = smile.get(`${m}:${j}`) ?? 0
        const d = ((7 + p.depth * 11 + k * 6) * unit) / 0.68 // the sprite edge for an orb of that diameter
        ctx.globalAlpha = Math.min(1, 0.16 + p.depth * 0.5 + k * 0.45)
        ctx.drawImage(k > 0.4 ? lit : calm, p.x - d / 2, p.y - d / 2, d, d)
      }
    }
    ctx.globalAlpha = 1
  }

  const tick = () => {
    if (raf || dead) return
    raf = requestAnimationFrame((ms) => {
      raf = 0
      if (dead) return
      draw(ms / 1000)
      if (visible && !reduced && !document.hidden) tick()
    })
  }
  const wake = () => tick()

  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    if (visible) tick()
  })
  io.observe(canvas)
  document.addEventListener('visibilitychange', wake)
  resize()
  tick()

  return () => {
    dead = true
    if (raf) cancelAnimationFrame(raf)
    ro.disconnect()
    io.disconnect()
    document.removeEventListener('visibilitychange', wake)
  }
}
