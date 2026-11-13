/* The v6 dashboard replay: the landing's 3D scene (src/landing/v4/engine/scene3d.js, frozen) drawn in solid colours only, with no gradient and no glow.
   It lives here, outside src/landing/, so the landing engine stays exactly as it is in production. It changes only how the scene paints:
   - orbs: solid faces, the same branch the landing's flat story takes (orb() reads `flat` for its fill and nothing else);
   - draw(): each gradient the scene asks for in non-flat mode becomes one solid colour: the floor ring a faint white, the contract's halo
     nothing, the contract one solid disc that turns green as the debts net into it.
   A stand-in colour is an object with addColorStop() and toString(): canvas fillStyle and strokeStyle take any object as its string. */
import { EpochScene3D } from '../landing/v4/engine/scene3d.js'
import { clamp, easeIO, mountScene } from '../landing/v4/engine/scene.js'

const solid = (color) => ({ addColorStop() {}, toString: () => color })
const hexRgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16))
const mixHex = (a, b, t) => {
  const A = hexRgb(a), B = hexRgb(b)
  return `rgb(${A.map((v, k) => Math.round(v + (B[k] - v) * t)).join(',')})`
}

class PlainScene3D extends EpochScene3D {
  orb(...args) {
    this.flat = true
    try {
      super.orb(...args)
    } finally {
      this.flat = false
    }
  }

  draw(p, time) {
    this.ensure()
    const x = this.ctx
    const collapse = easeIO(clamp(p - 2))
    let radials = 0
    // in non-flat mode the scene makes one linear gradient (the floor ring) and two radial ones per frame (the contract's halo, then the contract);
    // own properties on this context shadow the prototype's methods for this frame only
    x.createLinearGradient = () => solid('rgba(255,255,255,0.22)')
    x.createRadialGradient = () => (radials++ === 0 ? solid('rgba(0,0,0,0)') : solid(mixHex('#e8e8ec', '#5be3a0', collapse)))
    try {
      super.draw(p, time)
    } finally {
      delete x.createLinearGradient
      delete x.createRadialGradient
    }
  }
}

/** mountScene3D of the landing engine, with PlainScene3D in place of EpochScene3D. */
export function mountPlainScene3D(root, opts = {}) {
  const scene = new PlainScene3D(root, opts.data)
  scene.bindDrag()
  return mountScene(root, { ...opts, scene })
}
