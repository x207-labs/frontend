// Types for scene3d.js: the story scene in 2.5D (perspective canvas, drag to turn) of the v4 landing, which the app mounts on its own for one epoch.
import { EpochScene, type MountOptions } from './scene.js'
import type { SceneData } from './x207.js'
export declare class EpochScene3D extends EpochScene {
  constructor(root: Element, data?: SceneData)
  bindDrag(): void
  /** Solid faces, a plain contract disc and a hairline ring: no gradients, no halo (the landing's story). */
  flat?: boolean
}
/** Mounts the scroll story: `story` holds `[data-scene3d]` (canvas, .scene-tip, [data-k] readouts, [data-chapter] buttons) and the `.chapter` captions. destroy() undoes everything. */
export declare function mountStory3D(story: Element, opts?: { flat?: boolean }): EpochScene3D
/** Mounts the 3D scene on `root` (canvas, .scene-tip, [data-k] readouts, [data-play], a range input and [data-chapter] buttons) and plays `opts.data`. destroy() undoes everything. */
export declare function mountScene3D(root: Element, opts?: Pick<MountOptions, 'data' | 'subMoved'> & { /** solid colours only, no gradient and no glow (the v6 dashboard) */ plain?: boolean }): EpochScene3D
