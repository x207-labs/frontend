import { EPOCH8 } from '../facts'
import { checks, FIG, SCALE } from './epoch'

/** Epoch 8 in two numbers: what was owed between agents and what moved on chain, with the three bands of the difference and the browser's own recomputation. */
export function Statement() {
  const { match } = checks()
  return (
    <section className="statement" aria-labelledby="st-h">
      <div className="col">
        <h2 id="st-h" className="sr">Epoch 8 in two numbers</h2>
        <div className="st-grid">
          <div>
            <p className="st-label">Owed between agents, {EPOCH8.vouchers} vouchers</p>
            <p className="st-big">{FIG.gross}<small>credit</small></p>
          </div>
          <div className="st-arrow" aria-hidden="true">→</div>
          <div className="st-moved">
            <p className="st-label">Moved on chain, {EPOCH8.movements} transfers</p>
            <p className="st-big">{FIG.moved}<small>mock USDT</small></p>
          </div>
        </div>
        <div className="scale" role="img" aria-label={`Of ${FIG.gross} owed: ${FIG.moved} moved, ${FIG.cleared} cancelled in solver loops, ${FIG.pairs} netted between pairs.`}>
          <i className="s-moved" style={{ width: SCALE.moved }} />
          <i className="s-loops" style={{ width: SCALE.loops }} />
          <i className="s-pairs" style={{ width: SCALE.pairs }} />
        </div>
        <div className="legend">
          <span><i className="l-moved" /><b>{FIG.moved}</b> moved</span>
          <span><i className="l-loops" /><b>{FIG.cleared}</b> cancelled in loops by the solver</span>
          <span><i className="l-pairs" /><b>{FIG.pairs}</b> netted between pairs</span>
        </div>
        <p className="st-note">
          {match ? (
            <>
              <span className="ok">✓</span> Recomputed in your browser from the {EPOCH8.vouchers} vouchers: matches the read API. Net positions sum to zero. Mock USDT on NEAR testnet.
            </>
          ) : (
            '✗ Recomputation does not match the read API.'
          )}
        </p>
      </div>
    </section>
  )
}
