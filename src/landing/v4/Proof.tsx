import { EPOCH8 } from '../facts'
import { checks, epochWhen } from './epoch'
import { X207 } from './engine/x207.js'

/** Check it yourself: the browser recomputes epoch 8 from the 24 raw vouchers and compares with what the read API reported, next to where to look on chain. */
export function Proof() {
  const { rows } = checks()
  return (
    <section className="section" id="proof" aria-labelledby="proof-h">
      <div className="col">
        <div className="sechead">
          <h2 id="proof-h">Check it yourself.</h2>
          <p>Your browser recomputes epoch {X207.epoch} from the {EPOCH8.vouchers} vouchers the read API returns. Every figure above comes from this.</p>
        </div>
        <div className="proof">
          <div className="panel">
            <h3>Recomputed here</h3>
            <p className="sub">Compared with what the API reports.</p>
            <ul className="checks">
              {rows.map((r) => (
                <li key={r.label}>
                  <span className={r.ok ? 'ok' : 'bad'} aria-hidden="true">{r.ok ? '✓' : '✗'}</span>
                  <span>
                    {r.label}
                    <span className="sr">: {r.ok ? 'matches' : 'does not match'} the API</span>
                  </span>
                  <span>{r.got}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel">
            <h3>Where to look</h3>
            <p className="sub">Contract, code and transactions on NEAR testnet.</p>
            <dl className="facts">
              <dt>Contract</dt>
              <dd className="mono">{X207.contract}</dd>
              <dt>Code hash</dt>
              <dd className="mono">{X207.codeHash}</dd>
              <dt>Epoch</dt>
              <dd>{epochWhen()}</dd>
              <dt>Read API</dt>
              <dd className="mono">curl {X207.api}/epochs/{X207.epoch}</dd>
              <dt>Solver</dt>
              <dd>Open: anyone may submit a clearing; the contract keeps the best valid one</dd>
            </dl>
          </div>
        </div>
      </div>
    </section>
  )
}
