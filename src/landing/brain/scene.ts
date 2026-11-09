import {
  ACESFilmicToneMapping,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EDGES, NET } from '../facts'
import { CEREBELLUM, CORTEX, PIPE_FRAGMENT, PIPE_VERTEX, SIMPLEX, VERTEX_NORMAL } from './glsl'

// FE-044: the hero brain. The brain stands for the circle's settlement: one pipeline flows in for each of the 24 vouchers of epoch 8 (blue, thicker for more
// credit) and one flows out for each of the 14 net positions that moved (green). Labels orbit it on two tilted rings. Under reduced motion it is drawn once, still.

type Readable = { get(): number }
export type BrainInput = { reduced: boolean; px: Readable; py: Readable; scroll: Readable; onReady(): void }

const TAU = Math.PI * 2
const X_AXIS = new Vector3(1, 0, 0)
const CAMERA_DISTANCE = 5.9
const BASE_YAW = -0.62
// The brain fills a little over half the view, so the pipelines have room to run in from the faded edge of the canvas.
const BRAIN_SCALE = 0.84

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

function cortexMaterial(shape: string, key: string, color: string) {
  const material = new MeshPhysicalMaterial({
    color: new Color(color),
    roughness: 0.5,
    clearcoat: 0.35,
    clearcoatRoughness: 0.42,
    sheen: 0.7,
    sheenRoughness: 0.45,
    sheenColor: new Color('#ffd9d2'),
  })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying float vFold;\nvarying float vCleft;\n${SIMPLEX}\n${shape}`)
      .replace('#include <beginnormal_vertex>', VERTEX_NORMAL)
      .replace('#include <begin_vertex>', 'vec3 transformed = bP0;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFold;\nvarying float vCleft;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= mix(vec3(0.4, 0.22, 0.25), vec3(1.0), smoothstep(0.03, 0.8, vFold));
        diffuseColor.rgb *= 1.0 - 0.6 * vCleft;`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.75, roughnessFactor, smoothstep(0.0, 0.6, vFold));')
  }
  material.customProgramCacheKey = () => key
  return material
}

function pipeMaterial(color: Color, speed: number, offset: number) {
  return new ShaderMaterial({
    vertexShader: PIPE_VERTEX,
    fragmentShader: PIPE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uGrow: { value: 0 },
      uSpeed: { value: speed },
      uOffset: { value: offset },
      uOpacity: { value: 1 },
      uColor: { value: color },
    },
  })
}

export function mountBrain(host: HTMLElement, input: BrainInput): () => void {
  const stage = host.querySelector<HTMLElement>('.brain-stage')
  if (!stage) throw new Error('brain stage missing')
  const small = host.clientWidth < 480

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 2 : 1.75))
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.setClearColor(0x000000, 0)
  renderer.domElement.className = 'brain-canvas'
  renderer.domElement.setAttribute('aria-hidden', 'true')
  stage.prepend(renderer.domElement)

  const scene = new Scene()
  const pmrem = new PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  scene.environment = pmrem.fromScene(room, 0.04).texture
  scene.environmentIntensity = 0.5
  room.dispose?.()
  pmrem.dispose()

  const camera = new PerspectiveCamera(30, 1, 0.1, 40)
  camera.position.set(0, 1.15, CAMERA_DISTANCE)
  camera.lookAt(0, -0.05, 0)

  scene.add(new HemisphereLight(0xf4f1ff, 0x403030, 0.55))
  const key = new DirectionalLight(0xfff1e6, 2.1)
  key.position.set(2.4, 3.2, 2.6)
  const fill = new DirectionalLight(0x9fbcff, 0.8)
  fill.position.set(-3, 0.4, 1.2)
  const rim = new DirectionalLight(0xffffff, 1.6)
  rim.position.set(0.4, 1.6, -3.4)
  scene.add(key, fill, rim)

  const brain = new Group()
  scene.add(brain)
  const disposables: (BufferGeometry | Material)[] = []
  const keep = <T extends BufferGeometry | Material>(x: T) => (disposables.push(x), x)

  const segments = small ? 180 : 300
  const cortex = new Mesh(keep(new SphereGeometry(1, segments, Math.round(segments * 0.7))), keep(cortexMaterial(CORTEX, 'x207-cortex', '#e7bcb3')))
  const cerebellum = new Mesh(keep(new SphereGeometry(1, small ? 120 : 180, small ? 80 : 120)), keep(cortexMaterial(CEREBELLUM, 'x207-cerebellum', '#dcaaa2')))
  cerebellum.position.set(0, -0.34, -0.58)
  cerebellum.rotation.x = 0.35
  const stem = new Mesh(keep(new CylinderGeometry(0.12, 0.08, 0.6, 32)), keep(new MeshPhysicalMaterial({ color: '#d9b0a6', roughness: 0.55, sheen: 0.5, sheenColor: new Color('#ffd9d2') })))
  stem.position.set(0, -0.62, -0.26)
  stem.rotation.x = 0.42
  brain.add(cortex, cerebellum, stem)

  // Pipelines.
  const css = getComputedStyle(host)
  const inColor = new Color(css.getPropertyValue('--lp-accent').trim() || '#0a6cff')
  const outColor = new Color(css.getPropertyValue('--lp-green').trim() || '#1f9d55')
  const rand = random(207)
  const pipes: ShaderMaterial[] = []
  const tube = (points: Vector3[], radius: number, material: ShaderMaterial) => {
    const curve = new CatmullRomCurve3(points, false, 'centripetal')
    brain.add(new Mesh(keep(new TubeGeometry(curve, 96, radius, 6, false)), keep(material)))
    pipes.push(material)
  }
  EDGES.forEach(([, , credit], i) => {
    const end = new Vector3(rand() * 2 - 1, rand() * 1.1 - 0.15, rand() * 2 - 1).normalize()
    const swing = (i % 2 ? 1 : -1) * (0.5 + rand() * 0.6)
    const out = end.clone().applyAxisAngle(new Vector3(0, 1, 0), swing)
    out.y = Math.min(0.85, Math.max(-0.55, out.y + (rand() - 0.5) * 0.8))
    out.normalize()
    const start = out.clone().multiplyScalar(2.15 + rand() * 0.45)
    const mid1 = out.clone().applyAxisAngle(new Vector3(0, 1, 0), -swing * 0.35).multiplyScalar(1.6)
    const mid2 = surface(end, 1.45)
    tube([start, mid1, mid2, surface(end)], 0.006 + credit * 0.0011, pipeMaterial(inColor, 0.16 + rand() * 0.12, rand()))
  })
  NET.filter((n) => n !== 0).forEach((net, i, all) => {
    const angle = (i / all.length) * TAU + rand() * 0.3
    const from = new Vector3(Math.cos(angle), -0.25 - rand() * 0.35, Math.sin(angle)).normalize()
    const far = new Vector3(Math.cos(angle + 0.7), -0.9 - rand() * 0.5, Math.sin(angle + 0.7)).normalize().multiplyScalar(2.3)
    const mid = new Vector3(Math.cos(angle + 0.3), -0.45, Math.sin(angle + 0.3)).multiplyScalar(1.45)
    tube([surface(from), surface(from, 1.3), mid, far], 0.006 + Math.abs(net) * 0.0012, pipeMaterial(outColor, 0.14 + rand() * 0.1, rand()))
  })

  // Labels on two tilted rings: the cards (ring 0) and the method names (ring 1).
  const rings = [
    { tags: Array.from(stage.querySelectorAll<HTMLElement>('[data-orbit="0"]')), radius: small ? 1.1 : 1.32, tilt: 0.3, lift: 0.05, speed: 0.07, phase: 0.6 },
    { tags: Array.from(stage.querySelectorAll<HTMLElement>('[data-orbit="1"]')), radius: small ? 0.95 : 1.05, tilt: -0.24, lift: 0.0, speed: -0.11, phase: 0.2 },
  ]
  const world = new Vector3()
  const view = new Vector3()
  let width = 1
  let height = 1
  let minX = 0
  let maxX = 1
  const widths = new Map<HTMLElement, number>()
  const placeTags = (t: number) => {
    for (const ring of rings) {
      ring.tags.forEach((tag, i) => {
        const angle = ring.phase + (i / ring.tags.length) * TAU + t * ring.speed
        world.set(Math.cos(angle) * ring.radius, 0, Math.sin(angle) * ring.radius).applyAxisAngle(X_AXIS, ring.tilt)
        world.y += ring.lift
        const yaw = Math.atan2(world.x, world.z) * 0.5
        view.copy(world).applyMatrix4(camera.matrixWorldInverse)
        const depth = Math.max(-1, Math.min(1, (view.z + CAMERA_DISTANCE) / ring.radius))
        world.project(camera)
        // Kept inside the viewport: a label never runs off the screen edge, whatever the stage overhangs.
        const half = (widths.get(tag) ?? 0) / 2
        const x = Math.min(maxX - half, Math.max(minX + half, ((world.x + 1) / 2) * width))
        const y = ((1 - world.y) / 2) * height
        const scale = 0.8 + 0.2 * ((depth + 1) / 2)
        tag.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) perspective(700px) rotateY(${yaw.toFixed(3)}rad) scale(${scale.toFixed(3)})`
        tag.style.opacity = (0.3 + 0.7 * Math.min(1, Math.max(0, (depth + 0.6) / 1.2))).toFixed(3)
        tag.style.zIndex = depth > 0 ? '3' : '0'
      })
    }
  }

  const resize = () => {
    width = Math.max(1, stage.clientWidth)
    height = Math.max(1, stage.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    const left = stage.getBoundingClientRect().left
    const viewport = document.documentElement.clientWidth
    minX = Math.max(0, -left) + 12
    maxX = Math.min(width, viewport - left) - 12
    for (const ring of rings) for (const tag of ring.tags) widths.set(tag, tag.offsetWidth)
  }
  resize()

  let time = 0
  let grow = input.reduced ? 1 : 0
  let yaw = BASE_YAW
  let pitch = 0.1
  const draw = () => {
    const pointerX = input.reduced ? 0 : input.px.get()
    const pointerY = input.reduced ? 0 : input.py.get()
    const scroll = input.reduced ? 0 : input.scroll.get()
    const targetYaw = BASE_YAW + (input.reduced ? 0 : Math.sin(time * 0.17) * 0.5) + pointerX * 0.35 + scroll * 1.1
    yaw += (targetYaw - yaw) * (input.reduced ? 1 : 0.06)
    pitch += (0.1 + pointerY * 0.1 - pitch) * (input.reduced ? 1 : 0.06)
    brain.rotation.set(pitch, yaw, 0)
    brain.position.y = scroll * 0.35
    const intro = input.reduced ? 1 : Math.min(1, time / 1.4)
    brain.scale.setScalar(BRAIN_SCALE * (0.9 + 0.1 * (1 - (1 - intro) ** 3)))
    for (const pipe of pipes) {
      pipe.uniforms.uTime.value = input.reduced ? 0.4 : time
      pipe.uniforms.uGrow.value = grow
    }
    renderer.render(scene, camera)
    placeTags(input.reduced ? 0 : time)
  }

  let frame = 0
  let last = 0
  let visible = true
  let ready = false
  const loop = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
    last = now
    time += dt
    grow = Math.min(1, grow + dt / 1.8)
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
    sized.disconnect()
    seen.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    scene.environment?.dispose()
    for (const x of disposables) x.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
