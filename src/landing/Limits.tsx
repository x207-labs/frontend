import { EPOCH8, LIVE } from './facts'
import { Reveal } from './motion'

// FE-044: what x207 is not, said as plainly as what it is. From README "The idea in one breath" and CLAIMS.md.
const ROWS = [
  {
    title: 'It does not save gas on NEAR.',
    figure: `${EPOCH8.gasEpoch} vs ${EPOCH8.gasTransfers} Tgas`,
    body: `Epoch 8 burnt ${EPOCH8.gasEpoch} Tgas against ${EPOCH8.gasTransfers} Tgas for ${EPOCH8.vouchers} plain transfers. By a model of the measured gas it burns less only when a pair trades about 3 to 4 times or more in an epoch.`,
  },
  {
    title: 'It is not credit without cash.',
    figure: '≥ 125% locked',
    body: `A member locks capital of at least 125% of the debt it can run up. In epoch 8 the members had ${EPOCH8.staked} staked against ${EPOCH8.gross} of obligations.`,
  },
  {
    title: 'It does not help every graph.',
    figure: 'needs loops',
    body: 'Netting needs debts in both directions and cycle clearing needs a loop. A star graph, where everyone only pays one hub, gains nothing from either.',
  },
  {
    title: 'It is not on mainnet.',
    figure: 'testnet only',
    body: 'Every run is on NEAR testnet with a mock USDT. No transaction has run on mainnet.',
  },
  {
    title: 'It is not an accepted x402 standard.',
    figure: 'a proposal',
    body: 'The multi-party binding of the x402 batch-settlement scheme is proposed upstream. Nobody has accepted it yet.',
    link: { href: LIVE.x402Proposal, text: 'x402-foundation/x402#4131' },
  },
]

export function Limits() {
  return (
    <section id="limits" className="section limits" aria-labelledby="limits-title">
      <Reveal>
        <p className="eyebrow">Limits</p>
        <h2 id="limits-title" className="section-title">What x207 is not.</h2>
      </Reveal>
      <ul className="rows">
        {ROWS.map((row, i) => (
          <Reveal key={row.title} as="li" delay={i * 0.05} className="row">
              <h3>{row.title}</h3>
              <span className="row-figure">{row.figure}</span>
              <p>
                {row.body}
                {row.link && (
                  <>
                    {' '}
                    <a href={row.link.href} target="_blank" rel="noreferrer">{row.link.text}</a>
                  </>
                )}
              </p>
          </Reveal>
        ))}
      </ul>
    </section>
  )
}
