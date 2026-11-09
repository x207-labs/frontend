import { EPOCH8, LIVE } from './facts'
import { Icon, type IconName } from './icons'
import { Reveal } from './motion'

// FE-044, FE-048, FE-051: what x207 is not, one line each, as a spec sheet: the object, the claim, the figure. From README "The idea in one breath" and CLAIMS.md.
const ROWS: { icon: IconName; title: string; figure: string; body: string; link?: { href: string; text: string } }[] = [
  {
    icon: 'gauge',
    title: 'No gas saving on NEAR.',
    figure: `${EPOCH8.gasEpoch} vs ${EPOCH8.gasTransfers} Tgas`,
    body: `Epoch 8 burnt more than ${EPOCH8.vouchers} plain transfers. It pays off when a pair trades about 3 to 4 times an epoch.`,
  },
  {
    icon: 'lock',
    title: 'Not credit without cash.',
    figure: '≥ 125% locked',
    body: `Members lock at least 125% of the debt they can run up.`,
  },
  {
    icon: 'hub',
    title: 'Not for every graph.',
    figure: 'needs loops',
    body: 'A star graph, everyone paying one hub, gains nothing.',
  },
  {
    icon: 'flask',
    title: 'Not on mainnet.',
    figure: 'testnet only',
    body: 'Mock USDT on NEAR testnet. No transaction has run on mainnet.',
  },
  {
    icon: 'doc',
    title: 'Not an x402 standard yet.',
    figure: 'a proposal',
    body: 'The multi-party binding is proposed upstream:',
    link: { href: LIVE.x402Proposal, text: 'x402#4131' },
  },
]

export function Limits() {
  return (
    <section id="limits" className="section limits" aria-labelledby="limits-title">
      <p className="section-kicker">
        Fig. 06 <span>Limits</span>
      </p>
      <h2 id="limits-title" className="section-title">What x207 is not.</h2>
      <ul className="spec">
        {ROWS.map((row, i) => (
          <Reveal key={row.title} as="li" delay={i * 0.05} className="spec-row">
            <span className="spec-icon">
              <Icon name={row.icon} />
            </span>
            <div className="spec-text">
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
            </div>
            <span className="spec-figure">{row.figure}</span>
          </Reveal>
        ))}
      </ul>
    </section>
  )
}
