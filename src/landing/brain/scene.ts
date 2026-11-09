import { animate, createDrawable, stagger } from 'animejs'
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineCurve3,
  LineDashedMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  QuadraticBezierCurve3,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TetrahedronGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
  type Curve,
  type Material,
} from 'three'
import { DEFAULTER, EDGES, NET } from '../facts'
import { STORY } from '../tokens'
import {
  BEAM_FRAGMENT,
  BEAM_VERTEX,
  CEREBELLUM,
  CORTEX,
  DUST_FRAGMENT,
  DUST_VERTEX,
  HOLO_FRAGMENT,
  HOLO_VERTEX,
  PIPE_FRAGMENT,
  PIPE_VERTEX,
  RING_FRAGMENT,
} from './glsl'

// FE-044, FE-048, FE-050: the world of the scroll theatre, walked through by the camera as the page scrolls (story 0..1, chapters in tokens.ts STORY).
//   hero      the hologram brain, the circle contract, over its projector
//   barter    a cabinet of lockers beside it: the doors open, an asset kind comes out of each and is drawn into the brain
//   vouchers  the circle of epoch 8 lies around the brain: 15 members, and the 24 vouchers drawn between them as they were registered
//   clearing  the camera rises over the circle; the gross credit fades, each member's net position is labelled
//   net       only the net moves: one arrow per member with a position, debtors into the contract, the contract out to creditors
//   dive      the camera returns to the brain and dives in
// Every member, voucher and position is epoch 8 of x207-v013 (facts.ts). Labels are drawn in HTML over the canvas, with leader lines in one SVG, and
// anime.js draws the lines and brings the text in as a group comes on stage. Under reduced motion nothing moves on its own: the scene is drawn again only
// when the story value changes, and labels appear without the draw.

type Readable = { get(): number }
export type BrainInput = {
  reduced: boolean
  px: Readable
  py: Readable
  story: Readable
  /** Calls back when the story value changes; returns the unsubscribe. Used under reduced motion, where there is no frame loop. */
  watch(cb: () => void): () => void
  onReady(): void
}

const TAU = Math.PI * 2
const UP = new Vector3(0, 1, 0)
const BASE_YAW = -0.62
const SVG = 'http://www.w3.org/2000/svg'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const ease = (from: number, to: number, x: number) => {
  const t = clamp01((x - from) / (to - from))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// A seeded generator, so the layout is the same on every load.
function random(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The circle: members 4 slots apart (4 and 15 share no factor), so trading neighbours sit across the ring, as on the flat ring of the fallback.
const RING_R = 2.15
const N = NET.length
const slot = (member: number) => (member * 4) % N
const memberAt = (member: number, radius = RING_R) => {
  const a = (slot(member) / N) * TAU - Math.PI / 2
  return new Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)
}
const memberId = (member: number) => `m${String(member).padStart(2, '0')}`

// The barter cabinet stands left of the circle. Nine of the asset kinds of the barter catalog (docs/barter-evidence.md), one per locker.
const CAB = new Vector3(-4.7, 0.2, 0.3)
const CELL = 0.62
const KINDS = ['GPU hours', 'Dataset', 'API key', 'NEAR account', 'NFT', 'Token', 'Model weights', 'Storage', 'Team seat']

// The camera path: where it stands and what it looks at, at each point of the story. Between two keys it moves on an eased curve.
type Key = { p: number; pos: readonly [number, number, number]; at: readonly [number, number, number] }
const KEYS: Key[] = [
  { p: 0, pos: [0, 1.0, 6.2], at: [0, 0, 0] },
  { p: STORY.hero[1], pos: [0.3, 1.1, 5.9], at: [0, 0, 0] },
  { p: STORY.kinds[0] + 0.05, pos: [CAB.x + 2.0, CAB.y + 1.2, CAB.z + 6.8], at: [CAB.x + 0.2, CAB.y - 0.1, CAB.z] },
  { p: STORY.kinds[1] - 0.03, pos: [CAB.x + 1.3, CAB.y + 0.8, CAB.z + 5.7], at: [CAB.x + 0.4, CAB.y - 0.1, CAB.z] },
  { p: STORY.vouchers[0] + 0.05, pos: [2.4, 5.8, 9.4], at: [0, -0.2, 0] },
  { p: STORY.vouchers[1] - 0.03, pos: [0.7, 6.8, 8.4], at: [0, -0.2, 0] },
  { p: STORY.loops[0] + 0.05, pos: [0, 12.6, 3.8], at: [0, 0, 0.15] },
  { p: STORY.loops[1] - 0.03, pos: [-0.4, 13, 3.2], at: [0, 0, 0.1] },
  { p: STORY.net[0] + 0.04, pos: [0, 13.4, 2.4], at: [0, 0, 0.05] },
  { p: STORY.net[1], pos: [0.4, 13, 3.0], at: [0, 0, 0.05] },
  { p: STORY.dive[0] + 0.04, pos: [0, 1.3, 3.6], at: [0, 0, 0] },
  { p: 1, pos: [0, 0.1, 1.05], at: [0, 0, 0] },
]

const additive = { transparent: true, depthWrite: false, blending: AdditiveBlending } as const

type Group3 = 'kinds' | 'voucher' | 'core' | 'members'
type Callout = { group: Group3; el: HTMLElement; text: HTMLElement; line: SVGPolylineElement | null; anchor: Vector3; label?: Vector3 }

export function mountBrain(host: HTMLElement, input: BrainInput): () => void {
  const stage = host.querySelector<HTMLElement>('.brain-stage')
  if (!stage) throw new Error('brain stage missing')
  const small = Math.min(window.innerWidth, window.innerHeight) < 560

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 2 : 1.6))
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  renderer.domElement.className = 'brain-canvas'
  renderer.domElement.setAttribute('aria-hidden', 'true')
  stage.prepend(renderer.domElement)

  const scene = new Scene()
  const camera = new PerspectiveCamera(34, 1, 0.05, 80)

  const css = getComputedStyle(host)
  const token = (name: string, fallback: string) => new Color(css.getPropertyValue(name).trim() || fallback)
  const holo = token('--lp-holo', '#3d8bff')
  const holoDeep = token('--lp-holo-deep', '#1a3cff')
  const payColor = token('--lp-pay', '#3d8bff')
  const getColor = token('--lp-green', '#34c46e')
  const evenColor = token('--lp-ink-2', '#a3a29b')
  const lateColor = token('--lp-late', '#f5a524')
  const lineColor = token('--lp-line', '#8fb4ff')

  const disposables: (BufferGeometry | Material)[] = []
  const keep = <T extends BufferGeometry | Material>(x: T) => (disposables.push(x), x)

  // ---- The brain, the circle contract at the centre of everything ----
  const brain = new Group()
  scene.add(brain)
  const holoMaterial = (shape: string) =>
    keep(
      new ShaderMaterial({
        vertexShader: HOLO_VERTEX.replace('SHAPE', shape),
        fragmentShader: HOLO_FRAGMENT,
        side: DoubleSide,
        ...additive,
        uniforms: {
          uTime: { value: 0 },
          uBuild: { value: input.reduced ? 1 : 0 },
          uPulse: { value: 0 },
          uOpacity: { value: 1 },
          uColor: { value: holo },
          uColorDeep: { value: holoDeep },
        },
      }),
    )
  const segments = small ? 160 : 240
  const cortexMat = holoMaterial(CORTEX)
  const cerebellumMat = holoMaterial(CEREBELLUM)
  const cortex = new Mesh(keep(new SphereGeometry(1, segments, Math.round(segments * 0.7))), cortexMat)
  const cerebellum = new Mesh(keep(new SphereGeometry(1, small ? 100 : 140, small ? 70 : 96)), cerebellumMat)
  cerebellum.position.set(0, -0.34, -0.58)
  cerebellum.rotation.x = 0.35
  brain.add(cortex, cerebellum)
  const holos = [cortexMat, cerebellumMat]

  const dustMat = keep(
    new ShaderMaterial({
      vertexShader: DUST_VERTEX.replace('SHAPE', CORTEX),
      fragmentShader: DUST_FRAGMENT,
      ...additive,
      uniforms: { uTime: { value: 0 }, uScatter: { value: 0 }, uSize: { value: 15 * renderer.getPixelRatio() }, uOpacity: { value: 0 }, uColor: { value: holo } },
    }),
  )
  brain.add(new Points(keep(new SphereGeometry(1, small ? 54 : 80, small ? 36 : 54)), dustMat))

  // The projector under the brain: a beam and three turning rings on its floor. It gives way to the circle.
  const base = new Group()
  base.position.y = -0.92
  scene.add(base)
  const beamMat = keep(
    new ShaderMaterial({ vertexShader: BEAM_VERTEX, fragmentShader: BEAM_FRAGMENT, side: DoubleSide, ...additive, uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: holo } } }),
  )
  const beam = new Mesh(keep(new CylinderGeometry(0.95, 0.2, 0.95, 64, 1, true)), beamMat)
  beam.position.y = 0.47
  base.add(beam)
  const floorRings = [
    { size: 2.1, dash: 0, spin: 0 },
    { size: 2.6, dash: 48, spin: 0.02 },
    { size: 3.4, dash: 12, spin: -0.012 },
  ].map(({ size, dash, spin }) => {
    const mat = keep(
      new ShaderMaterial({
        vertexShader: BEAM_VERTEX,
        fragmentShader: RING_FRAGMENT,
        side: DoubleSide,
        ...additive,
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uDash: { value: dash }, uSpin: { value: spin }, uColor: { value: holo } },
      }),
    )
    const ring = new Mesh(keep(new PlaneGeometry(size, size)), mat)
    ring.rotation.x = -Math.PI / 2
    base.add(ring)
    return mat
  })

  const rand = random(207)
  const tube = (curve: Curve<Vector3>, radius: number, color: Color, speed = 0.16) => {
    const material = keep(
      new ShaderMaterial({
        vertexShader: PIPE_VERTEX,
        fragmentShader: PIPE_FRAGMENT,
        ...additive,
        uniforms: { uTime: { value: 0 }, uGrow: { value: 0 }, uSpeed: { value: speed + rand() * 0.1 }, uOffset: { value: rand() }, uOpacity: { value: 1 }, uColor: { value: color } },
      }),
    )
    return { mesh: new Mesh(keep(new TubeGeometry(curve, 64, radius, 6, false)), material), material }
  }
  const lines = (geometry: BufferGeometry, color: Color, opacity: number) =>
    new LineSegments(keep(new EdgesGeometry(geometry, 1)), keep(new LineBasicMaterial({ color, opacity, ...additive })))

  // ---- Chapter 1: the barter cabinet ----
  const cabinet = new Group()
  cabinet.position.copy(CAB)
  cabinet.rotation.y = 0.18
  scene.add(cabinet)
  const shapes = [
    () => new BoxGeometry(1.3, 0.8, 1.3), // GPU hours: a card
    () => new CylinderGeometry(0.75, 0.75, 1.3, 10), // dataset: a drum
    () => new TetrahedronGeometry(1), // API key
    () => new OctahedronGeometry(1), // NEAR account
    () => new DodecahedronGeometry(0.95), // NFT
    () => new CylinderGeometry(0.95, 0.95, 0.28, 18), // token: a coin
    () => new IcosahedronGeometry(1), // model weights
    () => new BoxGeometry(1.4, 1.4, 0.5), // storage
    () => new ConeGeometry(0.85, 1.4, 6), // team seat
  ]
  type Locker = { door: Group; glyph: LineSegments; home: Vector3; label: Vector3 }
  const lockers: Locker[] = []
  const frameMat = keep(new LineBasicMaterial({ color: lineColor, opacity: 0.4, ...additive }))
  const doorMat = keep(new LineBasicMaterial({ color: lineColor, opacity: 0.85, ...additive }))
  const cellBox = keep(new EdgesGeometry(new BoxGeometry(CELL, CELL, 0.55)))
  const doorEdge = keep(new EdgesGeometry(new PlaneGeometry(CELL * 0.9, CELL * 0.9)))
  for (let i = 0; i < 9; i++) {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = (col - 1) * (CELL + 0.05)
    const y = (1 - row) * (CELL + 0.05)
    const box = new LineSegments(cellBox, frameMat)
    box.position.set(x, y, 0)
    // The door hinges on its left edge and swings towards the viewer.
    const door = new Group()
    door.position.set(x - (CELL * 0.9) / 2, y, 0.28)
    const panel = new LineSegments(doorEdge, doorMat)
    panel.position.x = (CELL * 0.9) / 2
    door.add(panel)
    const geometry = shapes[i]()
    const glyph = lines(geometry, holo, 1)
    geometry.dispose()
    glyph.scale.setScalar(0.15)
    const home = new Vector3(x, y, 0)
    glyph.position.copy(home)
    cabinet.add(box, door, glyph)
    lockers.push({ door, glyph, home, label: new Vector3() })
  }
  // A plinth, so the cabinet stands on something.
  const plinthBox = new BoxGeometry(CELL * 3 + 0.4, 0.08, 0.8)
  const plinth = new LineSegments(keep(new EdgesGeometry(plinthBox)), frameMat)
  plinthBox.dispose()
  plinth.position.y = -1.5 * CELL - 0.16
  cabinet.add(plinth)

  // ---- Chapters 2 to 4: the circle of epoch 8 ----
  const circle = new Group()
  scene.add(circle)
  const ringPoints = (radius: number, n = 160) => {
    const g = new BufferGeometry().setFromPoints(Array.from({ length: n }, (_, i) => new Vector3(Math.cos((i / n) * TAU) * radius, 0, Math.sin((i / n) * TAU) * radius)))
    return keep(g)
  }
  const orbitMat = keep(new LineBasicMaterial({ color: evenColor, opacity: 0.35, ...additive }))
  circle.add(new LineLoop(ringPoints(RING_R), orbitMat))
  const innerMat = keep(new LineDashedMaterial({ color: lineColor, dashSize: 0.03, gapSize: 0.06, opacity: 0.3, ...additive }))
  const inner = new LineLoop(ringPoints(RING_R * 0.62, 220), innerMat)
  inner.computeLineDistances()
  circle.add(inner)

  // Members: a node ring in the colour of the member's net position, a faint stake ring, and a dashed ring around the one that defaulted.
  const roleColor = (net: number) => (net > 0 ? payColor : net < 0 ? getColor : evenColor)
  const nodeGeo = keep(new TorusGeometry(0.1, 0.011, 8, 48))
  const stakeGeo = keep(new TorusGeometry(0.19, 0.004, 6, 48))
  const stakeMat = keep(new MeshBasicMaterial({ color: evenColor, opacity: 0.35, ...additive }))
  const members = NET.map((net, member) => {
    const g = new Group()
    g.position.copy(memberAt(member))
    const nodeMat = keep(new MeshBasicMaterial({ color: roleColor(net), opacity: 1, ...additive }))
    const node = new Mesh(nodeGeo, nodeMat)
    const stake = new Mesh(stakeGeo, stakeMat)
    node.rotation.x = stake.rotation.x = Math.PI / 2
    g.add(node, stake)
    if (member === DEFAULTER) {
      const late = new LineLoop(ringPoints(0.25, 64), keep(new LineDashedMaterial({ color: lateColor, dashSize: 0.035, gapSize: 0.03, ...additive })))
      late.computeLineDistances()
      g.add(late)
    }
    circle.add(g)
    return g
  })

  // Vouchers, one per registered obligation, thicker for more credit, arching a little over the circle.
  const vouchers = EDGES.map(([from, to, credit]) => {
    const a = memberAt(from, RING_R - 0.12)
    const b = memberAt(to, RING_R - 0.12)
    const mid = a.clone().add(b).multiplyScalar(0.32)
    mid.y = 0.18 + credit * 0.05
    const t = tube(new QuadraticBezierCurve3(a, mid, b), 0.006 + credit * 0.0022, lineColor)
    circle.add(t.mesh)
    return t.material
  })
  // The largest voucher gets a callout, at the top of its arc.
  const biggest = EDGES.reduce((best, e, i) => (e[2] > EDGES[best][2] ? i : best), 0)
  const voucherAnchor = (() => {
    const a = memberAt(EDGES[biggest][0], RING_R - 0.12)
    const b = memberAt(EDGES[biggest][1], RING_R - 0.12)
    const mid = a.clone().add(b).multiplyScalar(0.32).setY(0.18 + EDGES[biggest][2] * 0.05)
    return new QuadraticBezierCurve3(a, mid, b).getPoint(0.5)
  })()

  // Net settlement: a debtor pays into the contract, the contract pays a creditor. The arrow points the way the USDT moves.
  const coneGeo = keep(new ConeGeometry(1, 1, 14))
  const movers = NET.map((net, member) => ({ net, member })).filter((x) => x.net !== 0)
  const arrows = movers.map(({ net, member }) => {
    const outer = memberAt(member, RING_R - 0.26)
    const innerAt = memberAt(member, 0.62)
    const [from, to] = net > 0 ? [outer, innerAt] : [innerAt, outer]
    from.y = to.y = 0.02
    const color = net > 0 ? payColor : getColor
    const size = Math.abs(net)
    const t = tube(new LineCurve3(from, to), 0.01 + size * 0.007, color, 0.3)
    const head = new Mesh(coneGeo, keep(new MeshBasicMaterial({ color, opacity: 0, ...additive })))
    head.scale.set(0.05 + size * 0.018, 0.13 + size * 0.02, 0.05 + size * 0.018)
    head.position.copy(to)
    head.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize())
    circle.add(t.mesh, head)
    return { material: t.material, head: head.material as MeshBasicMaterial }
  })

  // ---- Labels: HTML text over the canvas, leader lines in one SVG ----
  const layer = document.createElement('div')
  layer.className = 'callouts'
  layer.setAttribute('aria-hidden', 'true')
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'callout-lines')
  layer.append(svg)
  stage.append(layer)
  const callouts: Callout[] = []
  const addCallout = (group: Group3, text: string, anchor: Vector3, opts: { lead?: boolean; strong?: string; label?: Vector3 } = {}) => {
    const el = document.createElement('div')
    el.className = `callout is-${group}`
    if (opts.strong) {
      const b = document.createElement('b')
      b.textContent = opts.strong
      el.append(b, ' ')
    }
    const span = document.createElement('span')
    span.textContent = text
    el.append(span)
    layer.append(el)
    let line: SVGPolylineElement | null = null
    if (opts.lead !== false) {
      line = document.createElementNS(SVG, 'polyline')
      svg.append(line)
    }
    const c: Callout = { group, el, text: span, line, anchor, label: opts.label }
    callouts.push(c)
    return c
  }
  lockers.forEach((l, i) => addCallout('kinds', KINDS[i], l.label))
  const [vFrom, vTo, vCredit] = EDGES[biggest]
  addCallout('voucher', `owes ${memberId(vTo)} ${vCredit.toFixed(2)}`, voucherAnchor, { strong: memberId(vFrom) })
  const coreAnchor = new Vector3(0, 0.55, 0)
  addCallout('core', 'circle contract', coreAnchor, { strong: 'x207' })
  NET.forEach((net, member) => {
    const text = net > 0 ? `pays ${net.toFixed(2)}` : net < 0 ? `gets ${(-net).toFixed(2)}` : 'nets 0'
    addCallout('members', text, memberAt(member), { lead: false, strong: memberId(member), label: memberAt(member, RING_R + 0.42) })
  })

  // A group comes on stage: anime.js draws its leader lines from the anchor out, and the text settles out of a scramble.
  const shown = new Map<Group3, boolean>()
  const setGroup = (group: Group3, on: boolean) => {
    if ((shown.get(group) ?? false) === on) return
    shown.set(group, on)
    const items = callouts.filter((c) => c.group === group)
    for (const c of items) {
      c.el.classList.toggle('is-on', on)
      c.line?.classList.toggle('is-on', on)
    }
    if (!on || input.reduced) return
    const drawn = items.flatMap((c) => (c.line ? [c.line] : []))
    if (drawn.length) animate(createDrawable(drawn), { draw: ['0 0', '0 1'], duration: 700, delay: stagger(45), ease: 'outQuint' })
    animate(
      items.map((c) => c.text),
      { opacity: [0, 1], translateX: [-6, 0], delay: stagger(35, { start: drawn.length ? 260 : 0 }), duration: 450, ease: 'outQuad' },
    )
  }

  const world = new Vector3()
  const project = (v: Vector3) => {
    world.copy(v).project(camera)
    return { x: ((world.x + 1) / 2) * width, y: ((1 - world.y) / 2) * height, front: world.z < 1 }
  }
  const centre = new Vector3()
  const placeCallouts = () => {
    const mid = project(centre)
    for (const c of callouts) {
      const a = project(c.anchor)
      if (c.label) {
        // A member label stands just outside its node, on the side away from the centre of the circle.
        const l = project(c.label)
        const side = l.x > mid.x + 24 ? 0 : l.x < mid.x - 24 ? -100 : -50
        c.el.style.transform = `translate3d(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px, 0) translate(${side}%, -50%)`
      } else {
        // A leader line: up and out at 45 degrees, then a short level run to the text.
        // The contract's label leans left, so it never meets the voucher's, which leans right.
        const dir = c.group === 'core' || a.x > width * 0.82 ? -1 : 1
        const ex = a.x + dir * 22
        const ey = a.y - 22
        const tx = ex + dir * 16
        c.line?.setAttribute('points', `${a.x.toFixed(1)},${a.y.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)} ${tx.toFixed(1)},${ey.toFixed(1)}`)
        c.el.style.transform = `translate3d(${(tx + dir * 6).toFixed(1)}px, ${ey.toFixed(1)}px, 0) translate(${dir > 0 ? 0 : -100}%, -50%)`
      }
      c.el.style.visibility = a.front ? '' : 'hidden'
    }
  }

  let width = 1
  let height = 1
  let wide = true
  let fit = 1
  const resize = () => {
    width = Math.max(1, stage.clientWidth)
    height = Math.max(1, stage.clientHeight)
    renderer.setSize(width, height, false)
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    const aspect = width / height
    wide = aspect > 1.15
    // A portrait screen moves the camera back, so the circle and its labels still fit the width.
    fit = Math.max(1, 1.5 / aspect)
    camera.aspect = aspect
    camera.updateProjectionMatrix()
  }
  resize()

  const pos = new Vector3()
  const at = new Vector3()
  const keyPos = new Vector3()
  const keyAt = new Vector3()
  const placeCamera = (p: number, px: number, py: number) => {
    let i = 0
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++
    const a = KEYS[i]
    const b = KEYS[i + 1]
    const t = ease(a.p, b.p, p)
    pos.set(...a.pos).lerp(keyPos.set(...b.pos), t)
    at.set(...a.at).lerp(keyAt.set(...b.at), t)
    // Between two stations the camera lifts a little, so a move reads as a flight rather than a slide.
    pos.y += Math.sin(Math.PI * t) * 0.5 * (a.p === b.p ? 0 : 1)
    pos.sub(at).multiplyScalar(fit).add(at)
    pos.x += px * 0.3
    pos.y += py * 0.18
    camera.position.copy(pos)
    camera.lookAt(at)
    camera.updateMatrixWorld()
  }

  let time = 0
  let yaw = BASE_YAW
  let pitch = 0.1
  const draw = () => {
    const p = input.story.get()
    const pointerX = input.reduced ? 0 : input.px.get()
    const pointerY = input.reduced ? 0 : input.py.get()
    const build = input.reduced ? 1 : ease(0, 2.4, intro)
    const now = input.reduced ? 0.4 : time

    const kinds = clamp01((p - STORY.kinds[0]) / (STORY.kinds[1] - STORY.kinds[0]))
    const voucherGrow = ease(STORY.vouchers[0] + 0.04, STORY.vouchers[1] - 0.03, p)
    const loops = ease(STORY.loops[0] + 0.03, STORY.loops[1] - 0.05, p)
    const net = ease(STORY.net[0] + 0.03, STORY.net[1] - 0.04, p)
    const dive = ease(STORY.dive[0], STORY.dive[1], p)
    const ringOn = ease(STORY.kinds[1] - 0.04, STORY.vouchers[0] + 0.04, p) * (1 - ease(STORY.net[1] + 0.01, STORY.dive[0] + 0.05, p))

    // The frame: on a wide screen the stage stands right of the captions, on a portrait one above them. The dive centres it.
    const offset = (wide ? -0.16 * width : 0) * (1 - dive)
    const lift = (wide ? 0 : 0.16 * height) * (1 - dive)
    camera.setViewOffset(width, height, offset, lift, width, height)
    placeCamera(p, pointerX, pointerY)

    const spin = input.reduced ? 0 : time * 0.14
    yaw += (BASE_YAW + spin + pointerX * 0.35 + p * TAU * 0.35 - yaw) * (input.reduced ? 1 : 0.08)
    pitch += (0.1 + pointerY * 0.1 - pitch) * (input.reduced ? 1 : 0.06)
    brain.rotation.set(pitch, yaw, 0)
    const pulse = Math.sin(Math.PI * loops) * (input.reduced ? 0.6 : 0.6 + 0.4 * Math.sin(time * 5.5))
    // Each asset kind drawn in makes the brain swell a little; it is the core of the circle while the circle is on stage.
    brain.scale.setScalar(lerp(0.9, 0.46, ringOn) * (0.92 + 0.08 * build) * (1 + 0.05 * pulse))

    const fadeOut = 1 - ease(0.45, 1, dive)
    for (const m of holos) {
      m.uniforms.uTime.value = now
      m.uniforms.uBuild.value = build
      m.uniforms.uPulse.value = pulse
      m.uniforms.uOpacity.value = fadeOut
    }
    dustMat.uniforms.uTime.value = now
    dustMat.uniforms.uOpacity.value = clamp01(build * 1.4 - 0.4) * (1 - ease(0.7, 1, dive))
    dustMat.uniforms.uScatter.value = dive
    const projector = build * (1 - ringOn) * (1 - dive)
    base.visible = projector > 0.01
    beamMat.uniforms.uTime.value = time
    beamMat.uniforms.uOpacity.value = projector
    for (const m of floorRings) {
      m.uniforms.uTime.value = input.reduced ? 0 : time
      m.uniforms.uOpacity.value = projector
    }

    // Barter: doors open one after the other, each kind slides out, then all are drawn into the brain.
    const cabinetOn = ease(STORY.hero[1] - 0.02, STORY.kinds[0] + 0.03, p) * (1 - ease(STORY.vouchers[0] + 0.02, STORY.vouchers[0] + 0.1, p))
    cabinet.visible = cabinetOn > 0.01
    frameMat.opacity = 0.4 * cabinetOn
    doorMat.opacity = 0.85 * cabinetOn
    lockers.forEach((l, i) => {
      const open = ease(0.06 + i * 0.035, 0.24 + i * 0.035, kinds)
      const out = ease(0.18 + i * 0.035, 0.36 + i * 0.035, kinds)
      const fly = ease(0.74 + i * 0.012, 0.95 + i * 0.012, kinds)
      l.door.rotation.y = -open * 1.85
      l.glyph.position.copy(l.home).setZ(out * 0.5)
      l.glyph.rotation.set(now * 0.5 + i, now * 0.7 + i * 0.6, 0)
      if (fly > 0) {
        // Out of the cabinet and into the brain, along a low arc.
        cabinet.worldToLocal(world.set(0, 0, 0))
        l.glyph.position.lerp(world, fly)
        l.glyph.position.y += Math.sin(Math.PI * fly) * 0.6
      }
      l.glyph.scale.setScalar(0.15 * (0.4 + 0.6 * out) * (1 - fly))
      l.glyph.visible = fly < 0.995
      ;(l.glyph.material as LineBasicMaterial).opacity = cabinetOn * (0.35 + 0.65 * out)
      l.label.copy(l.glyph.position).applyMatrix4(cabinet.matrixWorld)
    })
    cabinet.updateMatrixWorld()

    // The circle: members appear, vouchers are drawn, the gross fades as the loops clear, the net arrows move.
    circle.visible = ringOn > 0.01
    orbitMat.opacity = 0.35 * ringOn
    innerMat.opacity = 0.3 * ringOn
    stakeMat.opacity = 0.35 * ringOn
    members.forEach((g, member) => {
      const appear = ease(STORY.vouchers[0] - 0.02 + slot(member) * 0.003, STORY.vouchers[0] + 0.03 + slot(member) * 0.003, p) * ringOn
      g.scale.setScalar(Math.max(0.001, appear))
    })
    const stagger3 = (g: number, i: number, n: number) => clamp01(g * 1.6 - (i / n) * 0.6)
    vouchers.forEach((m, i) => {
      m.uniforms.uTime.value = now
      m.uniforms.uGrow.value = stagger3(voucherGrow, i, vouchers.length)
      m.uniforms.uOpacity.value = (1 - 0.86 * loops) * ringOn
    })
    arrows.forEach(({ material, head }, i) => {
      const grow = stagger3(net, i, arrows.length)
      material.uniforms.uTime.value = now
      material.uniforms.uGrow.value = grow
      material.uniforms.uOpacity.value = ringOn
      head.opacity = ease(0.9, 1, grow) * ringOn
    })

    setGroup('kinds', kinds > 0.3 && kinds < 0.72)
    setGroup('voucher', p > STORY.vouchers[0] + 0.1 && p < STORY.vouchers[1] - 0.01)
    setGroup('core', p > STORY.vouchers[0] + 0.05 && p < STORY.net[1])
    setGroup('members', p > STORY.loops[0] + 0.05 && p < STORY.net[1])

    renderer.render(scene, camera)
    placeCallouts()
  }

  let frame = 0
  let last = 0
  // The build-up runs on the wall clock: `time` takes at most 50 ms a frame, so on a slow frame rate it would drag the intro out for many seconds.
  let introStart = 0
  let intro = 0
  let visible = true
  let ready = false
  const loop = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
    last = now
    time += dt
    introStart ||= now
    intro = (now - introStart) / 1000
    draw()
    if (!ready) {
      ready = true
      input.onReady()
    }
    frame = visible && !document.hidden ? requestAnimationFrame(loop) : 0
  }
  // Nothing is drawn before the shaders are compiled off the main thread (KHR_parallel_shader_compile), so the first frame does not freeze the page.
  let compiled = false
  let disposed = false
  const start = () => {
    if (!compiled || frame || input.reduced) return
    last = 0
    frame = requestAnimationFrame(loop)
  }
  const stop = () => {
    cancelAnimationFrame(frame)
    frame = 0
  }

  const sized = new ResizeObserver(() => {
    resize()
    if (compiled && (input.reduced || !frame)) draw()
  })
  sized.observe(stage)
  const seen = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) start()
    else stop()
  })
  seen.observe(host)
  const onVisibility = () => (document.hidden ? stop() : visible && start())
  document.addEventListener('visibilitychange', onVisibility)
  const unwatch = input.reduced ? input.watch(() => compiled && draw()) : () => undefined

  renderer
    .compileAsync(scene, camera)
    .catch(() => undefined)
    .then(() => {
      if (disposed) return
      compiled = true
      if (input.reduced) {
        draw()
        input.onReady()
      } else start()
    })

  return () => {
    disposed = true
    stop()
    unwatch()
    sized.disconnect()
    seen.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    for (const x of disposables) x.dispose()
    layer.remove()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
