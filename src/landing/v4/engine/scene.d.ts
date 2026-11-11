// Types for scene.js: the epoch scene model (loops, phases, EpochScene) of the v4 landing, which the app plays on live data too.
import type { Edge, Recomputed, SceneData, SceneOutcome } from './x207.js'
export declare function clamp(v: number, a?: number, b?: number): number
export declare function easeOut(t: number): number
export declare function easeIO(t: number): number
/** One loop the solver cancelled: its members in order, the index of each edge in the data's edges, and the credit cancelled on every edge. */
export type Cycle = { members: number[]; edgeIdx: number[]; amount: number }
/** Splits the cleared amounts into loops. Whatever cannot sit on a loop (a cleared amount that does not close) is left out, so any data is safe. */
export declare function findCycles(edges: Edge[]): Cycle[]
export declare const PHASES: [string, string][]
export type SceneState = {
  p: number
  phase: number
  name: string
  caption: string
  owed: number
  cancelled: number
  net: number
  paidIn: number
  stake: number
  paidOut: number
  waiting: number
  /** debtors that have not paid yet but are still inside the payment window (outcome `due`), from the commit step on */
  due: number
  vouchers: number
  loops: number
  playing?: boolean
  target?: number
}
export declare class EpochScene {
  /** Without `data` it plays the epoch 8 snapshot `X207`. */
  constructor(root: Element, data?: SceneData)
  /** The model of `data` without a canvas: its loops, its figures and `stateAt(p)`. Shows the end figures where the scene cannot be drawn. */
  static model(data?: SceneData): EpochScene
  /** Every figure the scene shows at step `p` (0..5), derived from the data. */
  stateAt(p: number): SceneState
  reduced: boolean
  p: number
  target: number
  /** the furthest step the scene plays to (5, or `data.until`) */
  max: number
  data: SceneData
  /** the edges, one outcome per member, and the member labels in use */
  E: Edge[]
  outcome: SceneOutcome[]
  names: string[] | undefined
  n: number
  cycles: Cycle[]
  r: Recomputed
  /** the five [name, caption] pairs: PHASES for the epoch 8 snapshot, worded from the counts of the data otherwise */
  phases: [string, string][]
  /** loops sharing the clearing step (at least 1) */
  K: number
  /** scale of line widths (by the largest debt), of orb and net-line sizes (by the largest net position) and of the members on a crowded ring; all 1 for the epoch 8 snapshot */
  ak: number
  vk: number
  rs: number
  /** member labels on the canvas */
  showLabels: boolean
  /** members that owe / are owed after netting, in index order */
  debtors: number[]
  creditors: number[]
  /** the share (0..1) of member `i`'s net amount that has moved at step `p` */
  payOf(i: number, p: number): number
  /** how far voucher `i` has appeared (0..1) at step `p`, and its position in the order they appear in */
  reveal(i: number, p: number): number
  rank: number[]
  order: number[]
  /** how far loop `k` has been cancelled (0..1), and how much it glows, at step `p` */
  cancelOf(k: number, p: number): number
  glowOf(k: number, p: number): number
  tip: HTMLElement | null
  draw(p: number, time: number): void
  setHover(i: number | null): void
  emit(): void
  playing: boolean
  onState(fn: (s: SceneState) => void): void
  setTarget(p: number, instant?: boolean): void
  play(): void
  pause(): void
  /** Stops the loop and detaches every observer and listener the constructor attached. */
  destroy(): void
}
export type MountOptions = {
  /** play this instead of the epoch 8 snapshot */
  data?: SceneData
  /** a scene already built (for example an EpochScene3D) */
  scene?: EpochScene
  /** replaces the line under the "moved" figure */
  subMoved?: (state: SceneState, scene: EpochScene) => string
  onChapter?: (k: number) => void
}
/** Fills the `[data-k]` read-outs (owed, cancelled, moved, phase, caption, sub-owed, sub-cancelled, sub-moved) and marks the current `[data-chapter]` with aria-current. */
export declare function hud(scene: EpochScene, root: Element, opts?: Pick<MountOptions, 'subMoved'>): void
/** hud() plus the play button `[data-play]`, the range input and the chapter buttons of `root`. The scene's destroy() also removes those listeners. */
export declare function mountScene(root: Element, opts?: MountOptions): EpochScene
export declare function mountStory(story: Element): EpochScene
