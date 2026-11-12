import { DEFAULTER, EPOCH8 } from '../facts'
import { findCycles } from '../v4/engine/scene.js'
import { STATUS, X207, labelOf } from '../v4/engine/x207.js'
import { checks, FIG, MOOD, TONE } from '../v4/epoch'
import { Face } from './Mac'

const CYCLES = findCycles(X207.edges)

// the solver's picture: the fifteen agents on a small ring, and each of the six loops as one closed curve through its members, lit one after another
const RC = { x: 150, y: 110, r: 84 }
const at = (m: number): [number, number] => {
  const a = (m / 15) * Math.PI * 2 - Math.PI / 2
  return [RC.x + RC.r * Math.cos(a), RC.y + RC.r * Math.sin(a)]
}
const loopD = (members: number[]) =>
  [...members, members[0]]
    .map((m, i, all) => {
      const [x, y] = at(m)
      if (!i) return `M${x.toFixed(1)} ${y.toFixed(1)}`
      const [px, py] = at(all[i - 1])
      const cx = (px + x) / 2 + (RC.x - (px + x) / 2) * 0.45
      const cy = (py + y) / 2 + (RC.y - (py + y) / 2) * 0.45
      return `Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

function SolverViz() {
  return (
    <svg className="fv-solver" viewBox="0 0 300 220" aria-hidden="true">
      <circle cx={RC.x} cy={RC.y} r={RC.r} className="fv-ring" />
      {CYCLES.map((c, k) => (
        <path key={k} d={loopD(c.members)} className="fv-loop" style={{ ['--k' as string]: k }} />
      ))}
      {X207.outcome.map((_, m) => {
        const [x, y] = at(m)
        return (
          <g key={m} transform={`translate(${x} ${y})`}>
            <circle r="8" className="fv-orb" />
            <ellipse cx="-2.6" cy="-1" rx="1" ry="1.7" className="fv-eye" />
            <ellipse cx="2.6" cy="-1" rx="1" ry="1.7" className="fv-eye" />
          </g>
        )
      })}
      <text x={RC.x} y={RC.y + 4} textAnchor="middle" className="fv-mid">{CYCLES.length} loops</text>
    </svg>
  )
}

/** Why trust it, after x.ai's "Everything you'd want in a teammate": one heading, one line, and four cards, each a short title, one sentence and one picture. */
export function Features() {
  const { rows } = checks()
  return (
    <section className="section" aria-labelledby="feat-h">
      <div className="col">
        <div className="xhead">
          <h2 id="feat-h" className="reveal-words">Settlement you can check.</h2>
          <p className="sub">No clearing house to trust. The solver is open and the contract checks every result.</p>
        </div>
        <div className="xgrid">
          <article className="xcard reveal">
            <h3>Anyone can solve an epoch</h3>
            <p>The contract keeps the best valid clearing and rejects any that moves a net position.</p>
            <figure className="xfig">
              <SolverViz />
            </figure>
          </article>
          <article className="xcard reveal">
            <h3>One code for every agent</h3>
            <p>Each epoch closes with a single HTTP 207 Multi-Status report.</p>
            <figure className="xfig fv-board" role="img" aria-label={`207 report of epoch ${X207.epoch}: one result code per member`}>
              {X207.outcome.map((o, i) => (
                <span key={i} className="fv-cell">
                  <Face tone={TONE[o]} size={34} mood={MOOD[o]} mono round />
                  <b className="mono">{labelOf(i)}</b>
                  <i className="mono" style={{ ['--tone' as string]: TONE[o] }}>{STATUS[o][1]}</i>
                </span>
              ))}
            </figure>
          </article>
          <article className="xcard reveal">
            <h3>Backed by stake</h3>
            <p>Credit never goes above stake. When {labelOf(DEFAULTER)} missed {FIG.defaultDue}, its stake paid.</p>
            <figure className="xfig fv-vault" aria-hidden="true">
              <div className="fv-coins">
                {X207.outcome.map((o, i) => (
                  <span key={i} className={i === DEFAULTER ? 'fv-coin out' : 'fv-coin'}>
                    <Face tone={TONE[o]} size={30} mood={MOOD[o]} mono round />
                  </span>
                ))}
              </div>
              <div className="fv-vault-cap">
                <b className="mono">{EPOCH8.staked}</b>
                <span>staked by {EPOCH8.members} agents</span>
              </div>
            </figure>
          </article>
          <article className="xcard reveal" id="proof" aria-labelledby="proof-h">
            <h3 id="proof-h">Check it yourself</h3>
            <p>Your browser recomputes epoch {X207.epoch} from its {EPOCH8.vouchers} vouchers, right now.</p>
            <figure className="xfig xfig-checks">
              <p className="xfig-bar mono">{X207.contract}</p>
              <ul className="checks">
                {rows.map((r) => (
                  <li key={r.label}>
                    <span className={r.ok ? 'ok' : 'bad'} aria-hidden="true">{r.ok ? '✓' : '✗'}</span>
                    <span>
                      {r.label}
                      <span className="sr">: {r.ok ? 'matches' : 'does not match'} the API</span>
                    </span>
                    <span className="mono">{r.got}</span>
                  </li>
                ))}
              </ul>
            </figure>
          </article>
        </div>
      </div>
    </section>
  )
}
