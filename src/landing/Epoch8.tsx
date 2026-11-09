import { m } from 'motion/react'
import { EPOCH8, LIVE } from './facts'
import { Reveal } from './motion'
import { EASE_OUT } from './tokens'

// FE-044: the one measured run, as large type. Every figure is from README "What epoch 8 showed" and CLAIMS.md.
const FIGURES = [
  { value: String(EPOCH8.vouchers), unit: '', label: 'vouchers registered' },
  { value: String(EPOCH8.members), unit: '', label: 'members in the circle' },
  { value: String(EPOCH8.movements), unit: '', label: 'settlement movements' },
  { value: String(EPOCH8.cleared), unit: `${EPOCH8.clearedShare}%`, label: 'credit cleared in cycles' },
  { value: '1', unit: '', label: `default, ${EPOCH8.defaultDue} covered from the stake` },
]

export function Epoch8() {
  return (
    <section id="epoch-8" className="section epoch" aria-labelledby="epoch-title">
      <Reveal>
        <p className="eyebrow">Measured, not projected</p>
        <h2 id="epoch-title" className="section-title">
          Epoch 8: {EPOCH8.gross} of credit settled with <span className="is-accent">{EPOCH8.moved} USDT</span>.
        </h2>
        <p className="section-lead">
          Fifteen agents on <code>x207-v013.testnet</code> registered {EPOCH8.vouchers} vouchers between them. At the end of the epoch {EPOCH8.debtors} of them paid in and {EPOCH8.creditors} claimed out; the rest
          netted to zero. The token is a mock USDT.
        </p>
      </Reveal>

      <div className="bars" role="img" aria-label={`Gross credit ${EPOCH8.gross} against ${EPOCH8.moved} USDT moved, ${EPOCH8.movedShare} percent`}>
        <div className="bar-row">
          <span className="bar-label">Gross credit</span>
          <div className="bar"><m.span className="bar-fill is-gross" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1.1, ease: EASE_OUT }} /></div>
          <span className="bar-value">{EPOCH8.gross}</span>
        </div>
        <div className="bar-row">
          <span className="bar-label">Moved</span>
          <div className="bar">
            <m.span
              className="bar-fill is-net"
              initial={{ scaleX: 1 }}
              whileInView={{ scaleX: EPOCH8.movedShare / 100 }}
              viewport={{ once: true }}
              transition={{ type: 'spring', stiffness: 60, damping: 16, delay: 0.9 }}
            />
          </div>
          <span className="bar-value is-accent">{EPOCH8.moved} <small>{EPOCH8.movedShare}%</small></span>
        </div>
      </div>

      <ul className="figures">
        {FIGURES.map((f, i) => (
          <Reveal key={f.label} as="li" delay={i * 0.06} className="figure">
            <span className="figure-value">{f.value}{f.unit && <small>{f.unit}</small>}</span>
            <span className="figure-label">{f.label}</span>
          </Reveal>
        ))}
      </ul>

      <p className="source">
        Sources: <a href={LIVE.finalizeTx} target="_blank" rel="noreferrer">the finalize_epoch transaction</a> ·{' '}
        <a href={LIVE.epoch8Run} target="_blank" rel="noreferrer">the full run</a> · <a href={LIVE.claims} target="_blank" rel="noreferrer">CLAIMS.md</a>
      </p>
    </section>
  )
}
