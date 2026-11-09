import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three'
import { EDGES, NET } from '../facts'
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

// FE-044, FE-048: the brain of the landing page, drawn as a hologram over a projector. It stands for the circle's settlement and plays the story as the page
// scrolls (story 0..1, chapters in tokens.ts STORY): asset kinds orbit and are drawn in, one pipeline flows in for each of the 24 vouchers of epoch 8, the loops
// cancel (the brain pulses, the lines in dim), one pipeline flows out for each of the 14 net positions that moved, and the camera dives in. Under reduced motion
// nothing moves on its own: the scene is drawn again only when the story value changes.

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
const X_AXIS = new Vector3(1, 0, 0)
const Y_AXIS = new Vector3(0, 1, 0)
const BASE_YAW = -0.62
const BRAIN_SCALE = 0.9

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const ease = (from: number, to: number, x: number) => {
  const t = clamp01((x - from) / (to - from))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// A seeded generator, so the pipelines are laid out the same on every load.
function random(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A point just under the cortex in direction d (the ellipsoid of the shader without its folds).
const surface = (d: Vector3, depth = 0.95) => new Vector3(d.x * 0.78, d.y * 0.68, d.z * 1.06).multiplyScalar(depth)

const additive = { transparent: true, depthWrite: false, blending: AdditiveBlending } as const

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
  const camera = new PerspectiveCamera(30, 1, 0.05, 60)

  const css = getComputedStyle(host)
  const token = (name: string, fallback: string) => new Color(css.getPropertyValue(name).trim() || fallback)
  const holo = token('--lp-holo', '#5fe1ff')
  const holoDeep = token('--lp-holo-deep', '#1a3cff')
  const inColor = token('--lp-violet', '#8b7bff')
  const outColor = token('--lp-green', '#34e39a')

  const disposables: (BufferGeometry | Material)[] = []
  const keep = <T extends BufferGeometry | Material>(x: T) => (disposables.push(x), x)

  const rig = new Group()
  const brain = new Group()
  rig.add(brain)
  scene.add(rig)

  // The hologram: cortex and cerebellum share one shader, each with its own shape.
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
  const segments = small ? 160 : 260
  const cortexMat = holoMaterial(CORTEX)
  const cerebellumMat = holoMaterial(CEREBELLUM)
  const cortex = new Mesh(keep(new SphereGeometry(1, segments, Math.round(segments * 0.7))), cortexMat)
  const cerebellum = new Mesh(keep(new SphereGeometry(1, small ? 100 : 150, small ? 70 : 100)), cerebellumMat)
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

  // The projector: a beam from a small emitter under the brain, and three turning rings on its floor.
  const base = new Group()
  base.position.y = -0.92
  rig.add(base)
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

  // Pipelines: in, one per voucher (thicker for more credit); out, one per net position that moved.
  const rand = random(207)
  const pipe = (points: Vector3[], radius: number, color: Color) => {
    const material = keep(
      new ShaderMaterial({
        vertexShader: PIPE_VERTEX,
        fragmentShader: PIPE_FRAGMENT,
        ...additive,
        uniforms: { uTime: { value: 0 }, uGrow: { value: 0 }, uSpeed: { value: 0.16 + rand() * 0.12 }, uOffset: { value: rand() }, uOpacity: { value: 1 }, uColor: { value: color } },
      }),
    )
    const curve = new CatmullRomCurve3(points, false, 'centripetal')
    brain.add(new Mesh(keep(new TubeGeometry(curve, 96, radius, 6, false)), material))
    return material
  }
  const pipesIn = EDGES.map(([, , credit], i) => {
    const end = new Vector3(rand() * 2 - 1, rand() * 1.1 - 0.15, rand() * 2 - 1).normalize()
    const swing = (i % 2 ? 1 : -1) * (0.5 + rand() * 0.6)
    const out = end.clone().applyAxisAngle(Y_AXIS, swing)
    out.y = Math.min(0.85, Math.max(-0.55, out.y + (rand() - 0.5) * 0.8))
    out.normalize()
    const start = out.clone().multiplyScalar(2.3 + rand() * 0.6)
    const mid1 = out.clone().applyAxisAngle(Y_AXIS, -swing * 0.35).multiplyScalar(1.6)
    return pipe([start, mid1, surface(end, 1.45), surface(end)], 0.005 + credit * 0.001, inColor)
  })
  const pipesOut = NET.filter((n) => n !== 0).map((net, i, all) => {
    const angle = (i / all.length) * TAU + rand() * 0.3
    const from = new Vector3(Math.cos(angle), -0.25 - rand() * 0.35, Math.sin(angle)).normalize()
    const far = new Vector3(Math.cos(angle + 0.7), -0.9 - rand() * 0.5, Math.sin(angle + 0.7)).normalize().multiplyScalar(2.4)
    const mid = new Vector3(Math.cos(angle + 0.3), -0.45, Math.sin(angle + 0.3)).multiplyScalar(1.45)
    return pipe([surface(from), surface(from, 1.3), mid, far], 0.006 + Math.abs(net) * 0.0012, outColor)
  })

  // HTML chips of asset kinds orbit on a tilted ring, then spiral into the brain in the first chapter.
  const chips = Array.from(stage.querySelectorAll<HTMLElement>('[data-orbit]'))
  const world = new Vector3()
  const view = new Vector3()
  let width = 1
  let height = 1
  let wide = true
  let distance = 6
  const widths = new Map<HTMLElement, number>()
  const placeChips = (t: number, absorb: number, appear: number) => {
    const radius = (small ? 1.25 : 1.6) * (1 - 0.88 * absorb)
    chips.forEach((chip, i) => {
      const angle = 0.4 + (i / chips.length) * TAU + t * 0.07 + absorb * absorb * 4.5
      world.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius).applyAxisAngle(X_AXIS, 0.28)
      world.multiplyScalar(brain.scale.x).add(rig.position)
      view.copy(world).applyMatrix4(camera.matrixWorldInverse)
      const depth = Math.max(-1, Math.min(1, (view.z + distance) / Math.max(radius, 0.2)))
      world.project(camera)
      const half = (widths.get(chip) ?? 0) / 2
      const x = Math.min(width - 12 - half, Math.max(12 + half, ((world.x + 1) / 2) * width))
      const y = ((1 - world.y) / 2) * height
      const scale = (0.78 + 0.22 * ((depth + 1) / 2)) * (1 - 0.5 * absorb)
      chip.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`
      const fade = (1 - absorb) ** 1.5 * clamp01((appear * chips.length - i * 0.6) / 1.5)
      chip.style.opacity = ((0.35 + 0.65 * clamp01((depth + 0.6) / 1.2)) * fade).toFixed(3)
      chip.style.zIndex = depth > 0 ? '3' : '0'
    })
  }

  const resize = () => {
    width = Math.max(1, stage.clientWidth)
    height = Math.max(1, stage.clientHeight)
    renderer.setSize(width, height, false)
    const aspect = width / height
    wide = aspect > 1.15
    // A portrait screen moves the camera back, so the brain and its pipelines still fit the width.
    distance = Math.max(6.2, 3.6 / aspect)
    camera.aspect = aspect
    camera.updateProjectionMatrix()
    for (const chip of chips) widths.set(chip, chip.offsetWidth)
  }
  resize()

  let time = 0
  let yaw = BASE_YAW
  let pitch = 0.1
  const draw = () => {
    const p = input.story.get()
    const pointerX = input.reduced ? 0 : input.px.get()
    const pointerY = input.reduced ? 0 : input.py.get()
    const build = input.reduced ? 1 : ease(0, 2.4, intro)

    const kinds = ease(STORY.kinds[0] + 0.02, STORY.kinds[1] - 0.02, p)
    const vouchers = ease(STORY.vouchers[0] + 0.01, STORY.vouchers[1] - 0.03, p)
    const loops = ease(STORY.loops[0] + 0.02, STORY.loops[1] - 0.04, p)
    const net = ease(STORY.net[0] + 0.01, STORY.net[1] - 0.04, p)
    const dive = ease(STORY.dive[0], STORY.dive[1], p)

    // On a wide screen the brain stays right of the headline and the captions; on a portrait one it sits above them. The dive brings it to the middle.
    const back = 1 - ease(STORY.net[1], STORY.dive[0] + 0.05, p)
    const aside = ease(STORY.hero[1] - 0.04, STORY.kinds[0] + 0.04, p) * back
    rig.position.set(wide ? 1.05 * back : 0, (wide ? 0.05 : lerp(0.62, 0.55, aside)) * (1 - dive), 0)

    const spin = input.reduced ? 0 : time * 0.14
    const targetYaw = BASE_YAW + spin + pointerX * 0.35 + p * TAU * 0.35
    yaw += (targetYaw - yaw) * (input.reduced ? 1 : 0.08)
    pitch += (0.1 + pointerY * 0.1 - pitch) * (input.reduced ? 1 : 0.06)
    brain.rotation.set(pitch, yaw, 0)
    brain.scale.setScalar(BRAIN_SCALE * (0.92 + 0.08 * build) * (1 + 0.04 * Math.sin(Math.PI * loops)))

    const d = lerp(distance, 1.1, dive ** 1.6)
    camera.position.set(0, lerp(1.0, 0.1, dive), d)
    camera.lookAt(rig.position.x * (1 - dive) * 0.15, lerp(0, rig.position.y, 0.6), 0)
    camera.updateMatrixWorld()

    const pulse = Math.sin(Math.PI * loops) * (input.reduced ? 0.6 : 0.6 + 0.4 * Math.sin(time * 5.5))
    const fadeOut = 1 - ease(0.45, 1, dive)
    for (const m of holos) {
      m.uniforms.uTime.value = input.reduced ? 0.4 : time
      m.uniforms.uBuild.value = build
      m.uniforms.uPulse.value = pulse
      m.uniforms.uOpacity.value = fadeOut
    }
    dustMat.uniforms.uTime.value = input.reduced ? 0.4 : time
    dustMat.uniforms.uOpacity.value = clamp01(build * 1.4 - 0.4) * (1 - ease(0.7, 1, dive))
    dustMat.uniforms.uScatter.value = dive
    beamMat.uniforms.uTime.value = time
    beamMat.uniforms.uOpacity.value = build * (1 - dive)
    for (const m of floorRings) {
      m.uniforms.uTime.value = input.reduced ? 0 : time
      m.uniforms.uOpacity.value = build * (1 - dive)
    }
    // Each pipeline starts a little after the one before, so they are seen being drawn one by one.
    const stagger = (g: number, i: number, n: number) => clamp01(g * 1.6 - (i / n) * 0.6)
    pipesIn.forEach((m, i) => {
      m.uniforms.uTime.value = input.reduced ? 0.4 : time
      m.uniforms.uGrow.value = stagger(vouchers, i, pipesIn.length)
      m.uniforms.uOpacity.value = (1 - 0.8 * loops) * fadeOut
    })
    pipesOut.forEach((m, i) => {
      m.uniforms.uTime.value = input.reduced ? 0.4 : time
      m.uniforms.uGrow.value = stagger(net, i, pipesOut.length)
      m.uniforms.uOpacity.value = fadeOut
    })
    renderer.render(scene, camera)
    placeChips(input.reduced ? 0 : time, kinds, input.reduced ? 1 : ease(0.9, 2.6, intro))
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
    renderer.dispose()
    renderer.domElement.remove()
  }
}
