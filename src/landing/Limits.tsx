import { EPOCH8, LIVE } from './facts'
import { Reveal } from './motion'

// FE-044, FE-048: what x207 is not, one line each. From README "The idea in one breath" and CLAIMS.md.
const ROWS = [
  {
    title: 'No gas saving on NEAR.',
    figure: `${EPOCH8.gasEpoch} vs ${EPOCH8.gasTransfers} Tgas`,
    body: `Epoch 8 burnt more than ${EPOCH8.vouchers} plain transfers. It pays off when a pair trades about 3 to 4 times an epoch.`,
  },
  {
    title: 'Not credit without cash.',
    figure: '≥ 125% locked',
    body: `Members lock at least 125% of the debt they can run up.`,
  },
  {
    title: 'Not for every graph.',
    figure: 'needs loops',
    body: 'A star graph, everyone paying one hub, gains nothing.',
  },
  {
    title: 'Not on mainnet.',
    figure: 'testnet only',
    body: 'Mock USDT on NEAR testnet. No transaction has run on mainnet.',
  },
  {
    title: 'Not an x402 standard yet.',
    figure: 'a proposal',
    body: 'The multi-party binding is proposed upstream:',
    link: { href: LIVE.x402Proposal, text: 'x402#4131' },
  },
]

export function Limits() {
  return (
    <section id="limits" className="section limits" aria-labelledby="limits-title">
      <Reveal>
        <h2 id="limits-title" className="section-title">What x207 is not.</h2>
      </Reveal>
      <ul className="rows">
        {ROWS.map((row, i) => (
          <Reveal key={row.title} as="li" delay={i * 0.05} className="row">
            <span className="row-figure">{row.figure}</span>
            <h3>{row.title}</h3>
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
