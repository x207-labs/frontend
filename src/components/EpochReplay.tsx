import { useEffect, useMemo, useRef, useState } from 'react'
import { useObligations, useReport } from '../api/queries'
import { Button, Tally } from '../ds/components'
import { EpochScene, type SceneState } from '../landing/v4/engine/scene.js'
import { mountScene3D } from '../landing/v4/engine/scene3d.js'
import { fmt, type SceneData as EngineData } from '../landing/v4/engine/x207.js'
import { formatTime } from '../lib/format'
import { toSceneData, type SceneData } from './epochReplayData'
import { Loading } from './QueryState'

/** The five chapters: what the button says, and the full name for screen readers. */
const STEPS: [string, string][] = [['Open', 'Open'], ['Clearing', 'Clearing'], ['Commit', 'Commit'], ['Payment', 'Payment window'], ['Finalized', 'Finalized']]

/** The line under the "moved" figure. Before the payment window nothing has moved; inside it, who paid in and who is still due; after it, what was claimed. */
function subMoved(s: SceneState, scene: { max: number }): string {
  if (s.p < 2) return 'nothing yet'
  if (s.p < 3) return `${fmt(s.net)} to settle`
  if (s.p >= 4 && scene.max > 4) return `${fmt(s.paidOut)} claimed, ${fmt(s.waiting)} waiting`
  const parts = [`${fmt(s.paidIn)} paid in`]
  if (s.stake > 0) parts.push(`${fmt(s.stake)} from a stake`)
  if (s.due > 0) parts.push(`${fmt(s.due)} still due`)
  return parts.join(', ')
}

/** Whether this browser can draw a 2D canvas and watch its size. jsdom and a few locked-down browsers cannot: the replay then shows the end figures and no controls. */
function canDrawCanvas(): boolean {
  try {
    return typeof ResizeObserver !== 'undefined' && !!document.createElement('canvas').getContext('2d')
  } catch {
    return false
  }
}

/** What a screen reader gets instead of the canvas: the end figures of the replay, in words. */
function summary(data: SceneData, end: SceneState, members: number): string {
  const part = `${members} ${members === 1 ? 'member' : 'members'} on a ring and ${data.edges.length} ${data.edges.length === 1 ? 'voucher' : 'vouchers'} between them.`
  return `${part} ${fmt(end.owed)} credit owed, ${fmt(end.cancelled)} cancelled in loops, ${fmt(end.paidIn + end.stake)} moved as mock USDT. Drag to turn the ring; hover a member for its figures.`
}

function Floor({ data, settled }: { data: SceneData; settled: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const [live] = useState(canDrawCanvas)
  // The replay stops where the epoch has got to; it opens on that end state, so the figures agree with the statement above it.
  const until = settled ? data.until : Math.min(data.until, 1.999)
  const engine = useMemo<EngineData>(() => ({ edges: data.edges, outcome: data.outcome, names: data.names, reported: data.reported, until, start: until }), [data, until])
  const model = useMemo(() => EpochScene.model(engine), [engine])
  const end = useMemo(() => model.stateAt(until), [model, until])
  const members = model.n

  useEffect(() => {
    const el = root.current
    if (!el || !live) return
    let scene: ReturnType<typeof mountScene3D> | null = null
    try {
      scene = mountScene3D(el, { data: engine, subMoved })
    } catch {
      scene = null // the figures and the captions stay; only the picture is missing
    }
    return () => scene?.destroy()
  }, [engine, live])

  const reach = Math.min(4, Math.floor(until - 1e-6))
  return (
    <section className="rp" aria-label={`Replay of epoch ${data.epoch}`}>
      <div className="rp-floor" ref={root} data-phase={Math.min(4, Math.floor(until + 1e-6))}>
        <div className="rp-say">
          <p className="rp-meta">
            {members} {members === 1 ? 'member' : 'members'} · {data.edges.length} {data.edges.length === 1 ? 'voucher' : 'vouchers'}
            {data.committedAt ? ` · committed ${formatTime(data.committedAt)}` : ''}
          </p>
          <p className="rp-step" data-k="phase">{end.name}</p>
          <p className="rp-caption" data-k="caption" aria-live="polite">{end.caption}</p>
        </div>
        <div className="rp-ring">
          <div className="rp-canvas">
            {live && <canvas aria-hidden="true" />}
            <div className="scene-tip" hidden />
          </div>
          <p className="sr-only">{summary(data, end, members)}</p>
          {live && <p className="rp-hint" aria-hidden="true">{members > 24 ? 'drag to turn · hover a member for its name' : 'drag to turn · hover a member'}</p>}
        </div>
        <Tally
          items={[
            { tone: 'paper', label: 'Owed between members', value: <span data-k="owed">{fmt(end.owed)}</span>, note: <span data-k="sub-owed">{`${end.vouchers} of ${data.edges.length} ${data.edges.length === 1 ? 'voucher' : 'vouchers'}`}</span> },
            { tone: 'lime', label: 'Cancelled in loops', value: <span data-k="cancelled">{fmt(end.cancelled)}</span>, note: <span data-k="sub-cancelled">{`${end.loops} of ${model.cycles.length} ${model.cycles.length === 1 ? 'loop' : 'loops'}`}</span> },
            { tone: 'floor', label: 'Moved as mock USDT', value: <span data-k="moved">{fmt(end.paidIn + end.stake)}</span>, note: <span data-k="sub-moved">{subMoved(end, model)}</span> },
          ]}
        />
        {live && (
          <div className="rp-time">
            <button type="button" className="rp-play" data-play>Replay</button>
            <div className="rp-track">
              <input type="range" min={0} max={Math.floor(until * 200)} step={1} defaultValue={Math.floor(until * 200)} aria-label="Position in the epoch" />
              <div className="rp-chapters" role="group" aria-label="Jump to a step">
                {STEPS.map(([short, full], k) => (
                  <button key={short} type="button" data-chapter disabled={k > reach} aria-label={full}>{short}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <p className="rp-unit">
        Amounts in credit. Payments are mock USDT on NEAR testnet; no real funds move.
        {!settled && ' The settlement results of this epoch could not be read, so the replay stops after clearing.'}
      </p>
    </section>
  )
}

/**
 * The replay of one epoch on live data: the members on a ring, the debts between them, the loops that cancel, and each member's one net payment to the circle
 * contract. It plays the same scene as the landing (engine/scene3d.js) from the obligations and the report of the read API, and stops where the epoch has got to.
 * `final` marks a finalized epoch, whose data is read once and not polled. Without a 2D canvas it shows the end figures and no controls.
 */
export function EpochReplay({ epoch, final = false }: { epoch: number; final?: boolean }) {
  const ob = useObligations(epoch, 'cleared', final)
  const report = useReport(epoch, final)
  const data = useMemo(() => (ob.data ? toSceneData(ob.data, report.data) : null), [ob.data, report.data])
  if (ob.data === undefined) {
    if (ob.isError) {
      return (
        <p className="state rp-state">
          The replay of epoch {epoch} is not available: the vouchers could not be read.{' '}
          <Button onClick={() => ob.refetch()}>Try again</Button>
        </p>
      )
    }
    return <Loading label="Loading replay" />
  }
  if (report.data === undefined && !report.isError) return <Loading label="Loading replay" />
  if (!data) return <p className="state rp-state">Epoch {epoch} has no vouchers, so there is nothing to replay.</p>
  return <Floor data={data} settled={report.data !== undefined} />
}
