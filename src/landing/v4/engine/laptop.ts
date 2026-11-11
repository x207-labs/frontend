/* The photoreal laptop of the v4 landing's last section (port of the approved draft 42-laptop-real.html).
   One scene and one camera hold the whole laptop (deck, keys, trackpad, hinge, lid, screen), so the opening and the zoom move it as one
   object. The live dashboard is an iframe mapped onto the four projected screen corners with a CSS matrix3d (a homography), so it sits in
   the glass at any angle; at the end the screen is exactly the stage (the window) and the page can move to the dashboard route.
   Model: a 14-inch class aluminium laptop in millimetres. x = width (right), y = up, z = toward the viewer; the deck lies on y = 0. */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export type Region = { top: number; bottom: number; maxW: number }
export type Finish = 'silver' | 'gray' | 'black'
const FINISH: Record<Finish, string> = { silver: '#c5c9cf', gray: '#7d828a', black: '#3a3c41' }

/* ---------- dimensions (mm) ---------- */
const BW = 312.6, BD = 221.2, R = 9.5
const FEET = 0.9, BBEV = 1.1, BDEP = 8.4, DECK = FEET + 2 * BBEV + BDEP
const LT = 5.0, LBEV = 0.9, LH = 218
const HZ = -BD / 2 + 5.5, HY = DECK + LT / 2 + 0.15
const BETA = (22 * Math.PI) / 180
const DW = 302, DH = 196, DY = 12
const KX0 = -136, KX1 = 136, KZ0 = -100, GAP = 2.8, FNH = 8, KH = 15.5
const AZ0 = 0.62, EL0 = 0.64

const span = (x: number, a: number, b: number) => Math.min(1, Math.max(0, (x - a) / (b - a)))
const io3 = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

function rr(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape(), x = cx - w / 2, y = cy - h / 2
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false); s.lineTo(x + w, y + h - r)
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false); s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}
// a flat shape lying on the deck: shape (x, y) -> world (x, z = -y)
const flat = (shape: THREE.Shape, seg = 12) => new THREE.ShapeGeometry(shape, seg).rotateX(-Math.PI / 2)
const slab = (shape: THREE.Shape, depth: number, bev: number, seg = 24) =>
  new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: seg })
function tex(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d'); if (ctx) draw(ctx, w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}
function mesh(g: THREE.BufferGeometry, m: THREE.Material, o: { cast?: boolean; receive?: boolean; at?: [number, number, number] } = {}) {
  const x = new THREE.Mesh(g, m); x.castShadow = !!o.cast; x.receiveShadow = !!o.receive
  if (o.at) x.position.set(...o.at)
  return x
}
// unit square -> quad (TL, TR, BR, BL), as the 16 numbers of a CSS matrix3d
function homography(p: [number, number][]): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = p
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3, den = dx1 * dy2 - dx2 * dy1 || 1e-9
  const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3
  return [a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, x0, y0, 0, 1].map((v) => +v.toFixed(8)).join(',')
}

export class LaptopScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(15, 1, 120, 12000) // long lens like a product shot; near plane far out so the thin deck layers keep their order
  private pivot = new THREE.Group()
  private pmrem: THREE.PMREMGenerator
  private W = 0
  private H = 0
  private lay = ''
  private lastKey = ''
  private dRest = 1200
  private regionDy = 0
  private loaded = false
  private readonly box: THREE.Vector3[] = []
  private readonly deckC = V(0, DECK, 0)
  private readonly tRest = V(0, 98, -40)

  private readonly canvas: HTMLCanvasElement
  private readonly scr: HTMLElement
  private readonly dash: HTMLIFrameElement
  private readonly dashSrc: string

  /** canvas: the transparent WebGL layer; scr: the div that carries the live screen (it gets the matrix3d); dash: the iframe inside it; dashSrc: what the screen shows. */
  constructor(canvas: HTMLCanvasElement, scr: HTMLElement, dash: HTMLIFrameElement, dashSrc: string, finish: Finish = 'gray') {
    this.canvas = canvas
    this.scr = scr
    this.dash = dash
    this.dashSrc = dashSrc
    const r =(this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }))
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap
    this.pmrem = new THREE.PMREMGenerator(r)
    const env = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environment = env; this.scene.environmentIntensity = 0.9 // less reflective materials get env as their own envMap so their envMapIntensity counts
    const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(-320, 720, 460); key.castShadow = true
    Object.assign(key.shadow.camera, { left: -340, right: 340, top: 340, bottom: -340, near: 100, far: 1800 })
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.6
    const rim = new THREE.DirectionalLight('#7f9bff', 1.6); rim.position.set(260, 300, -620)
    this.scene.add(key, rim, new THREE.HemisphereLight('#c4d4ff', '#0a0f1e', 0.35))
    this.build(env, FINISH[finish])
    for (const x of [-BW / 2, BW / 2]) for (const y of [0, 215]) for (const z of [-188, BD / 2]) this.box.push(V(x, y, z))
  }

  private build(env: THREE.Texture, fin: string) {
    const alu = new THREE.MeshPhysicalMaterial({ color: fin, metalness: 1, roughness: 0.36, clearcoat: 0.15, clearcoatRoughness: 0.45 })
    const aluPad = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(fin).offsetHSL(0, 0, 0.04), metalness: 1, roughness: 0.22 })
    const keyMat = new THREE.MeshPhysicalMaterial({ color: '#08090b', roughness: 0.78, metalness: 0, envMap: env, envMapIntensity: 0.3 })
    const wellMat = new THREE.MeshStandardMaterial({ color: '#101115', roughness: 0.85 })
    const blackMat = new THREE.MeshStandardMaterial({ color: '#07080a', roughness: 0.6 })
    const hingeMat = new THREE.MeshPhysicalMaterial({ color: '#2a2c31', metalness: 1, roughness: 0.42 })
    const glass = new THREE.MeshStandardMaterial({ color: '#040405', roughness: 0.18, metalness: 0, envMap: env, envMapIntensity: 0.06 }) // black glass bezel
    const rubber = new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.95 })
    const laptop = new THREE.Group(); this.scene.add(laptop)
    // the deck
    laptop.add(mesh(slab(rr(BW - 2 * BBEV, BD - 2 * BBEV, R - BBEV), BDEP, BBEV).rotateX(-Math.PI / 2).translate(0, FEET + BBEV, 0), alu, { cast: true, receive: true }))
    for (const [x, z] of [[-128, -88], [128, -88], [-128, 88], [128, 88]]) laptop.add(mesh(new THREE.CylinderGeometry(6, 6, FEET, 24), rubber, { at: [x, FEET / 2, z] }))
    // keyboard well, keys (6 rows, the function row short), speaker grilles, trackpad and its seam
    const kzMid = KZ0 + 49.75
    laptop.add(mesh(flat(rr(KX1 - KX0 + 5, 104.5, 4, 0, -kzMid)), wellMat, { at: [0, DECK + 0.08, 0], receive: true }))
    const rows = [Array(14).fill(1), [...Array(13).fill(1), 1.5], [1.5, ...Array(13).fill(1)], [1.8, ...Array(11).fill(1), 1.8], [2.3, ...Array(10).fill(1), 2.3], [1, 1, 1, 1.25, 5.2, 1.25, 1, 1, 1, 1]]
    const keyGeo = new Map<string, THREE.BufferGeometry>(); let kz = KZ0
    rows.forEach((row: number[], r) => {
      const h = r ? KH : FNH, sum = row.reduce((s, w) => s + w, 0), ku = (KX1 - KX0 - (row.length - 1) * GAP) / sum
      let x = KX0
      for (const w of row) {
        const kw = w * ku, id = kw.toFixed(2) + 'x' + h
        if (!keyGeo.has(id)) keyGeo.set(id, slab(rr(kw - 0.4, h - 0.4, Math.min(1.8, h / 3)), 0.55, 0.2, 6).rotateX(-Math.PI / 2))
        laptop.add(mesh(keyGeo.get(id)!, keyMat, { at: [x + kw / 2, DECK + 0.25, kz + h / 2], cast: true, receive: true }))
        x += kw + GAP
      }
      kz += h + GAP
    })
    const grille = tex(90, 1000, (c) => { c.fillStyle = '#000'; for (let i = 0; i < 62; i++) for (let j = 0; j < 5; j++) { c.beginPath(); c.arc(9 + j * 18, 8 + i * 16.1, 3.4, 0, 7); c.fill() } })
    const grilleMat = new THREE.MeshStandardMaterial({ color: '#050506', map: grille, transparent: true, roughness: 0.7 })
    for (const gx of [-146, 146]) laptop.add(mesh(new THREE.PlaneGeometry(9, 99.5).rotateX(-Math.PI / 2), grilleMat, { at: [gx, DECK + 0.1, kzMid] }))
    laptop.add(mesh(flat(rr(147.4, 92.4, 7, 0, -55)), blackMat, { at: [0, DECK + 0.08, 0] }))
    laptop.add(mesh(flat(rr(145.2, 90.2, 6.2, 0, -55)), aluPad, { at: [0, DECK + 0.18, 0], receive: true }))
    // ports: left side MagSafe, two Thunderbolt, headphone; right side Thunderbolt, HDMI, SD
    const py = FEET + BBEV + BDEP / 2
    for (const [side, z, len, h] of [[-1, -62, 13, 3.2], [-1, -42, 9, 3], [-1, -28, 9, 3], [1, -30, 9, 3], [1, -10, 15, 4.4], [1, 20, 24, 2.2]])
      laptop.add(mesh(new THREE.BoxGeometry(0.5, h, len), blackMat, { at: [side * (BW / 2 - 0.15), py, z] }))
    laptop.add(mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.5, 20).rotateZ(Math.PI / 2), blackMat, { at: [-(BW / 2 - 0.15), py, 70] }))
    laptop.add(mesh(new THREE.CylinderGeometry(3.2, 3.2, 252, 32).rotateZ(Math.PI / 2), hingeMat, { at: [0, HY - 0.6, HZ], cast: true }))
    // the lid, hinged at the back of the deck (it runs from y = -3 to LH - 3 around the hinge line)
    const pivot = this.pivot; pivot.position.set(0, HY, HZ); laptop.add(pivot)
    const lidCy = (LH - 6) / 2
    pivot.add(mesh(slab(rr(BW - 2 * LBEV, LH - 2 * LBEV, R - LBEV, 0, lidCy), LT - 2 * LBEV, LBEV).translate(0, 0, -(LT - 2 * LBEV) / 2), alu, { cast: true, receive: true }))
    pivot.add(mesh(new THREE.ShapeGeometry(rr(BW - 2.2, LH - 2.2, R - 1.1, 0, lidCy), 16), glass, { at: [0, 0, LT / 2 + 0.02] }))
    const screenTex = tex(1024, 664, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0d1733'); g.addColorStop(1, '#060a16'); c.fillStyle = g; c.fillRect(0, 0, w, h)
      const rg = c.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.45, w * 0.5); rg.addColorStop(0, 'rgba(70,110,255,0.28)'); rg.addColorStop(1, 'rgba(70,110,255,0)'); c.fillStyle = rg; c.fillRect(0, 0, w, h)
    })
    pivot.add(mesh(new THREE.PlaneGeometry(DW, DH), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }), { at: [0, DY + DH / 2, LT / 2 + 0.05] }))
    pivot.add(mesh(new THREE.CircleGeometry(1.5, 24), new THREE.MeshStandardMaterial({ color: '#0b1220', roughness: 0.15, envMap: env, envMapIntensity: 0.12 }), { at: [0, DY + DH + 3.6, LT / 2 + 0.06] }))
    const logoTex = tex(512, 512, (c) => {
      c.scale(5.12, 5.12); c.strokeStyle = c.fillStyle = '#fff'; c.lineWidth = 9
      c.save(); c.translate(50, 50); c.rotate((50 * Math.PI) / 180); c.setLineDash([50.27, 25.13]); c.beginPath(); c.arc(0, 0, 36, 0, Math.PI * 2); c.stroke(); c.restore()
      for (const [x, y] of [[50, 14], [81.2, 68], [18.8, 68]]) { c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.fill() }
      c.lineCap = 'round'; c.beginPath(); c.moveTo(40, 40); c.lineTo(60, 60); c.moveTo(60, 40); c.lineTo(40, 60); c.stroke()
    })
    pivot.add(mesh(new THREE.PlaneGeometry(40, 40).rotateY(Math.PI), new THREE.MeshPhysicalMaterial({ color: '#e4e7ec', metalness: 1, roughness: 0.08, map: logoTex, transparent: true }), { at: [0, lidCy, -LT / 2 - 0.05] }))
    // ground: a soft shadow and a contact shade
    this.scene.add(mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.32 }), { receive: true }))
    const ao = tex(256, 256, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.6, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h) })
    this.scene.add(mesh(new THREE.PlaneGeometry(420, 320).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ao, transparent: true, depthWrite: false }), { at: [0, 0.05, 0] }))
  }

  private place(pos: THREE.Vector3, target: THREE.Vector3) {
    const c = this.camera; c.position.copy(pos); c.up.set(0, 1, 0); c.lookAt(target); c.updateMatrixWorld(true)
  }
  private extent(pts: THREE.Vector3[]) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9
    for (const p of pts) { const v = p.clone().project(this.camera), x = ((v.x + 1) / 2) * this.W, y = ((1 - v.y) / 2) * this.H; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    return { w: x1 - x0, h: y1 - y0, cy: (y0 + y1) / 2 }
  }
  private dirOf(az: number, el: number) { return V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)) }
  private setLid(th: number) { this.pivot.rotation.x = th; this.scene.updateMatrixWorld(true) }
  private layout(r: Region) {
    const key = [this.W, this.H, r.top | 0, r.bottom | 0, r.maxW | 0].join(); if (key === this.lay) return
    this.lay = key; this.lastKey = ''
    const c = this.camera
    this.renderer.setSize(this.W, this.H, false); c.aspect = this.W / this.H; c.clearViewOffset(); c.updateProjectionMatrix()
    this.dash.style.width = this.W + 'px'; this.dash.style.height = this.H + 'px'
    const rh = Math.max(80, r.bottom - r.top), dir = this.dirOf(0, BETA)
    this.setLid(-BETA)
    let d = 1200
    for (let i = 0; i < 3; i++) { this.place(this.tRest.clone().addScaledVector(dir, d), this.tRest); const e = this.extent(this.box); d *= Math.max(e.w / r.maxW, e.h / rh) }
    this.dRest = d; this.place(this.tRest.clone().addScaledVector(dir, d), this.tRest)
    this.regionDy = (r.top + r.bottom) / 2 - this.extent(this.box).cy // move the picture down into the free area under the copy
  }
  private quad(): [number, number][] {
    return ([[-DW / 2, DY + DH], [DW / 2, DY + DH], [DW / 2, DY], [-DW / 2, DY]] as const).map(([x, y]) => {
      const v = this.pivot.localToWorld(V(x, y, LT / 2 + 0.05)).project(this.camera)
      return [((v.x + 1) / 2) * this.W, ((1 - v.y) / 2) * this.H] as [number, number]
    })
  }

  /** pr: scroll progress through the section (negative while it is still coming in); tilt: pointer, -1..1; region: the free area under the copy */
  set(pr: number, tilt: [number, number], region: Region, W: number, H: number): { loaded: boolean } {
    if (W !== this.W || H !== this.H) { this.W = W; this.H = H; this.lay = '' }
    this.layout(region)
    if (!this.dash.getAttribute('src') && pr > -0.6) {
      this.dash.addEventListener('load', () => window.setTimeout(() => { this.loaded = true; this.dash.style.opacity = '1'; this.scr.style.background = '#060a14' }, 500), { once: true })
      this.dash.src = this.dashSrc
    }
    const key = [pr.toFixed(4), tilt[0].toFixed(3), tilt[1].toFixed(3), W, H].join(); if (key === this.lastKey) return { loaded: this.loaded }
    this.lastKey = key
    const o = io3(span(pr, -0.24, 0.16)), g = io3(span(pr, 0.2, 0.84)), mm = io3(span(pr, 0.6, 0.9)), fade = 1 - span(g, 0, 0.3)
    this.setLid(lerp(Math.PI / 2, -BETA, o))
    // orbit to face the screen square, then dolly straight at it until the screen fits the stage
    const dir = this.dirOf(lerp(AZ0, 0, o) + tilt[0] * 0.09 * fade, lerp(EL0, BETA, o) - tilt[1] * 0.05 * fade)
    const tgt0 = this.deckC.clone().lerp(this.tRest, o), pos0 = tgt0.clone().addScaledVector(dir, lerp(this.dRest * 1.04, this.dRest, o))
    const dc = this.pivot.localToWorld(V(0, DY + DH / 2, LT / 2 + 0.05)), n = V(0, 0, 1).transformDirection(this.pivot.matrixWorld)
    const c = this.camera, t = Math.tan((c.fov * Math.PI) / 360), dEnd = Math.max(DH / 2 / t, DW / 2 / ((t * W) / H))
    this.place(pos0.clone().lerp(dc.clone().addScaledVector(n, dEnd), g), tgt0.clone().lerp(dc, g))
    c.setViewOffset(W, H, 0, -this.regionDy * (1 - g), W, H); c.updateProjectionMatrix()
    this.renderer.render(this.scene, c)
    this.canvas.style.opacity = String(1 - span(pr, 0.74, 0.9))
    // the live screen in the glass: projected corners, stretched to exactly the stage over the last stretch
    const win: [number, number][] = [[0, 0], [W, 0], [W, H], [0, H]]
    const quad = this.quad().map((p, i) => [lerp(p[0], win[i][0], mm), lerp(p[1], win[i][1], mm)] as [number, number])
    const ew = W, eh = W * lerp(DH / DW, H / W, mm), s = Math.max(ew / W, eh / H)
    const st = this.scr.style
    st.width = ew + 'px'; st.height = eh.toFixed(2) + 'px'
    st.transform = `matrix3d(${homography(quad)}) scale(${1 / ew}, ${1 / eh})`
    st.borderRadius = (6 * (1 - mm)).toFixed(2) + 'px'; st.setProperty('--glare', String(1 - g))
    this.dash.style.transform = `translate(${((ew - W * s) / 2).toFixed(2)}px, 0) scale(${s.toFixed(5)})`
    const facing = n.dot(c.position.clone().sub(dc)) > 0
    st.opacity = String(facing ? span(o, 0.55, 0.92) : 0)
    return { loaded: this.loaded }
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
      for (const mat of mats) { const mm = mat as THREE.MeshStandardMaterial; mm.map?.dispose(); mat.dispose() }
    })
    this.scene.environment?.dispose(); this.pmrem.dispose(); this.renderer.dispose()
  }
}
