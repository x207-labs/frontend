// Types for plainScene3d.js: the landing's 3D scene in solid colours (no gradient, no glow) for the v6 dashboard replay.
import type { MountOptions } from '../landing/v4/engine/scene.js'
import type { EpochScene3D } from '../landing/v4/engine/scene3d.js'
/** Same as mountScene3D of the landing engine, drawn in solid colours. destroy() undoes everything. */
export declare function mountPlainScene3D(root: Element, opts?: Pick<MountOptions, 'data' | 'subMoved'>): EpochScene3D
