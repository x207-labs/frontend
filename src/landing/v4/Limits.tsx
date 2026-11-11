import { EPOCH8, LIVE } from '../facts'

/** What x207 is not, stated before anyone asks. The gas figures are the measured ones of epoch 8 (facts.ts). */
export function Limits() {
  const items = [
    {
      title: 'Not credit without cash',
      body: <>An agent stakes 125% of the debt it can run up when it joins. The limit can grow with its history, never above its stake.</>,
    },
    {
      title: 'Not a gas saving on NEAR',
      body: <>Epoch 8 burnt {EPOCH8.gasEpoch} Tgas where {EPOCH8.vouchers} plain transfers burn {EPOCH8.gasTransfers}. It pays off when a pair trades about 3 to 4 times an epoch.</>,
    },
    {
      title: 'Not for a star',
      body: <>If everyone only pays one hub there is nothing to net. Use x402 <code>exact</code> for that.</>,
    },
    {
      title: 'Not on mainnet',
      body: <>NEAR testnet with mock USDT. No mainnet transaction has been sent.</>,
    },
    {
      title: 'Not audited',
      body: <>The contracts are tested, not externally audited. Known issues are listed in <a href={LIVE.security}>security.md</a>.</>,
    },
  ]
  return (
    <section className="section" id="limits" aria-labelledby="lim-h">
      <div className="col">
        <div className="sechead">
          <h2 id="lim-h">What x207 is not.</h2>
          <p>Stated before you ask.</p>
        </div>
        <ol className="ledger">
          {items.map((it, i) => (
            <li key={it.title}>
              <h3>{it.title}</h3>
              <p>{it.body}</p>
              <span className="n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
