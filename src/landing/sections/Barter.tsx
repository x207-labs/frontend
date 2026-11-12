import { useState } from 'react'
import { BARTER, KIND_CLASSES, LIVE } from '../facts'
import { BARTER_FIG } from '../v4/epoch'
import nearLogo from '../assets/near.jpg'
import { KindIcon } from './kindIcon'
import { LogoMark } from '../Logo'

// the status of a kind in one word, shown at the end of its chip
const SHORT: Record<(typeof BARTER)[number]['key'], string> = { testnet: 'NEAR', sandbox: 'sandbox', mock: 'mock', unit: 'unit', generic: 'generic', p1: 'design', roadmap: 'roadmap', refused: 'refused' }

// one short chip label and one plain line per class of the catalog (the classes are facts.ts KIND_CLASSES; the lines only say what their kinds are)
const CLASS: Record<string, { label: string; line: string }> = {
  A: { label: 'On-chain assets', line: 'Tokens, NFTs, tickets and even NEAR accounts, held in escrow until the trade clears.' },
  B: { label: 'Revocable access', line: 'Seats, roles and scoped tokens, granted for a while and taken back when it ends.' },
  C: { label: 'Secrets', line: 'One API key or gift code, passed through the broker and revealed only to the buyer.' },
  D: { label: 'Compute & services', line: 'GPU hours, storage, models, datasets and services an agent runs itself.' },
  E: { label: 'Digital goods', line: 'Credits, domains, templates, game items and the other digital goods people already own.' },
  X: { label: 'Refused', line: 'What x207 refuses on purpose, like personal data, stolen access and securities.' },
}

const LABEL = Object.fromEntries(BARTER.map((r) => [r.key, r.label])) as Record<(typeof BARTER)[number]['key'], string>

/** Pay with anything that has value, after x.ai's "Give each Bot a job": the heading, one chip per class of the catalog, one line on the chosen class and a link on
 * the left; on the right, one card with the kinds of that class and their real status (facts.ts KIND_CLASSES, kept equal to docs/barter-evidence.md by Landing.test.tsx). */
export function Barter() {
  const [on, setOn] = useState(0)
  const cls = KIND_CLASSES[on]
  const ran = cls.kinds.filter(([, , st]) => st === 'testnet').length // 0 for the refused class
  return (
    <section className="section" id="barter" aria-labelledby="barter-h">
      <div className="col xsplit">
        <div className="xsplit-copy">
          <h2 id="barter-h" className="reveal-words">Anything with value can pay.</h2>
          <div className="xchips" role="group" aria-label="Classes of the barter catalog">
            {KIND_CLASSES.map((c, i) => (
              <button key={c.key} type="button" aria-pressed={i === on} title={c.name} onClick={() => setOn(i)}>
                {i === on && <LogoMark className="xchip-ic" />}
                {CLASS[c.key].label}
              </button>
            ))}
          </div>
          <p className="xlead">
            {CLASS[cls.key].line} {cls.kinds.length} kinds{ran ? `, ${ran} already ran on NEAR testnet` : ''}.
          </p>
          <a className="pill dark lg xbtn" href={LIVE.barterEvidence}>Explore every kind</a>
        </div>
        <figure className="xcard xsplit-fig reveal">
          <ul className="kinds" aria-label={`${cls.name}: ${cls.kinds.length} kinds`} key={cls.key}>
            {cls.kinds.map(([id, code, status]) => (
              <li key={id} data-s={status} title={LABEL[status]}>
                <span className="kind-box">
                  {/^near(-rpc)?:/.test(code) ? <img src={nearLogo} alt="" width="16" height="16" /> : <KindIcon code={code} refused={status === 'refused'} />}
                </span>
                <span className="mono">{code}</span>
                <span className="kind-st" aria-hidden="true">
                  {status === 'testnet' && <img src={nearLogo} alt="" width="12" height="12" />}
                  {SHORT[status]}
                </span>
                <span className="sr">: {LABEL[status]}</span>
              </li>
            ))}
          </ul>
          <div className="evidence">
            <div><b className="mono">{BARTER_FIG.offered}</b><span>kinds can be offered</span></div>
            <div><b className="mono">{BARTER_FIG.testnet}</b><span>ran on testnet</span></div>
            <div><b className="mono">{BARTER_FIG.sandbox}</b><span>in near-sandbox</span></div>
          </div>
        </figure>
      </div>
    </section>
  )
}
