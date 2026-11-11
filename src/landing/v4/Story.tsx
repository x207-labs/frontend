import { useEffect, useRef } from 'react'
import { EPOCH8, LIVE } from '../facts'
import { FIG, LOOPS } from './epoch'
import { mountStory3D } from './engine/scene3d.js'
import { canDraw2D } from './HeroRing'

const STEPS = ['Open', 'Clearing', 'Commit', 'Payment', 'Finalized']

/** Scroll is the timeline: the page pins this stage for five screens and the epoch plays as you scroll. The scene engine (engine/scene3d.js) draws the canvas and fills the
 * `data-k` readouts and the chapter buttons; this component only owns the markup and mounts and unmounts the engine. Without a 2D canvas the captions and the zeroed tallies stay. */
export function Story() {
  const story = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = story.current
    const canvas = root?.querySelector('canvas')
    if (!root || !canvas || !canDraw2D(canvas)) return
    const scene = mountStory3D(root)
    return () => scene.destroy()
  }, [])

  return (
    <div className="story" id="story" ref={story} data-story3d>
      <section className="stage" data-scene3d aria-label="One epoch of the x207 circle, played by scrolling">
        <div className="stage-say">
          <div className="chapter is-on">
            <p className="k agent">01 · open</p>
            <h2>Agents pay with vouchers.</h2>
            <p>Each call is paid with a signed, cumulative voucher. Nothing moves on chain yet; {EPOCH8.vouchers} vouchers add up to {FIG.gross} owed.</p>
          </div>
          <div className="chapter">
            <p className="k agent">02 · clearing</p>
            <h2>Loops cancel.</h2>
            <p>An open solver finds debts that run in a circle. The contract checks that no agent&apos;s net position changes before it accepts, so nobody has to trust the solver.</p>
          </div>
          <div className="chapter">
            <p className="k agent">03 · commit</p>
            <h2>Every agent nets to one amount.</h2>
            <p>What you owe is set against what you are owed. Fifteen agents, fourteen amounts, one agent is flat.</p>
          </div>
          <div className="chapter">
            <p className="k agent">04 · payment window</p>
            <h2>Debtors pay in once.</h2>
            <p>Six agents owe. Five pay. The sixth does not, so {FIG.defaultDue} comes out of the stake it locked when it joined.</p>
          </div>
          <div className="chapter">
            <p className="k agent">05 · finalized</p>
            <h2>Creditors are paid.</h2>
            <p>Every agent ends with a result code of its own: 200 settled, 202 ready to claim, 409 covered from stake. That is the 207 in the name.</p>
          </div>
          <span className="sr" data-k="phase" />
          <span className="sr" data-k="caption" aria-live="polite" />
        </div>
        <div className="stage-ring">
          <canvas aria-hidden="true" />
          <p className="sr">
            Fifteen agents on a ring in 3D. Vouchers arch between them, loops cancel, and each agent settles one net amount with the circle contract in the middle. Drag to turn the circle.
          </p>
          <div className="scene-tip" hidden />
          <p className="drag-hint agent" aria-hidden="true">drag to turn · hover an agent</p>
        </div>
        <dl className="tally">
          <div className="t-owed">
            <dt>Owed between agents</dt>
            <dd><span data-k="owed">0.00</span><small data-k="sub-owed">0 of {EPOCH8.vouchers} vouchers</small></dd>
          </div>
          <div className="t-cancel">
            <dt>Cancelled in loops</dt>
            <dd><span data-k="cancelled">0.00</span><small data-k="sub-cancelled">0 of {LOOPS} loops</small></dd>
          </div>
          <div className="t-moved">
            <dt>Moved as mock USDT</dt>
            <dd><span data-k="moved">0.00</span><small data-k="sub-moved">nothing yet</small></dd>
          </div>
        </dl>
        <div className="stage-time">
          <a className="play" href={LIVE.epoch8Stats}>Replay</a>
          <div className="chapters" role="group" aria-label="Jump to a step">
            {STEPS.map((s) => (
              <button key={s} type="button" data-chapter>{s}</button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
