// FE-069: the help page a first-time customer can reach from every page (sidebar, page search, sign-in cards, not-found page).
// It explains the product in four steps, defines every word the other pages use, answers the first questions, and links every page.
// FE-070: fewer words, more pictures. Each step is a drawing and one short line; the loop animation shows the idea.
// v4: an editorial page. The idea and its four steps, then the words as one hairline definition list (every word is on the page, a #term-<id> link scrolls to it and marks it), then the first questions as quiet disclosures.
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ExploreGrid } from '../components/ExploreGrid'
import { GuideActions } from '../components/GuideActions'
import { LIVE } from '../landing/facts'
import { LoopMotif } from '../components/LoopMotif'
import { StepGlyph, type Glyph } from '../components/StepGlyph'
import { GROUPS } from '../routes'

const HOW: { title: string; text: string; glyph: Glyph }[] = [
  { title: 'Join a circle', text: 'Stake a little, get a credit limit.', glyph: 'join' },
  { title: 'Trade in credit', text: 'Sign a voucher. No money moves yet.', glyph: 'trade' },
  { title: 'Loops cancel out', text: 'Debts that go round in a loop vanish.', glyph: 'loop' },
  { title: 'Pay only the net', text: 'One payment or one claim, in USDT.', glyph: 'net' },
]

const GLOSSARY: { id: string; term: string; text: string }[] = [
  { id: 'circle', term: 'Circle', text: 'A group of members that trade on credit with each other and settle together. Each circle has its own contract on NEAR.' },
  { id: 'member', term: 'Member', text: 'An account (a person or an AI agent) that has joined a circle and has a credit limit.' },
  { id: 'credit', term: 'Credit', text: 'The unit trades are counted in. One credit is settled as one USDT.' },
  { id: 'credit-limit', term: 'Credit limit', text: 'The most you can owe the circle at once. It is set when you join and stake.' },
  { id: 'remaining-limit', term: 'Remaining limit', text: 'How much more you can owe right now: your credit limit minus what you already owe.' },
  { id: 'stake', term: 'Stake', text: 'The deposit you put down to join. If you do not pay, your stake covers your debt first.' },
  { id: 'voucher', term: 'Voucher', text: 'A signed promise to pay another member later. It is checked by the contract, so it cannot be changed or reused.' },
  { id: 'voucher-key', term: 'Voucher key', text: 'The key your browser uses to sign vouchers. It stays in this browser and is never sent anywhere.' },
  { id: 'epoch', term: 'Epoch', text: 'One round of trading and settling. Vouchers signed during an epoch are cleared together at its end.' },
  { id: 'phases', term: 'Epoch phases', text: 'Open (trading), Cutoff (no new vouchers), Clearing (loops are found), Commit (the result is written on-chain), Payment window (pay or claim), Finalized (closed).' },
  { id: 'clearing', term: 'Clearing', text: 'The step that finds debts going round in loops and cancels them, so far fewer payments are needed.' },
  { id: 'net-position', term: 'Net position', text: 'What you owe or are owed after clearing, as one number. Negative means you pay; positive means you claim.' },
  { id: 'settlement', term: 'Settlement', text: 'Paying or claiming your net position in USDT during the payment window.' },
  { id: 'claim', term: 'Claim', text: 'Taking the USDT you are owed after the epoch is settled.' },
  { id: 'debtor', term: 'Debtor and creditor', text: 'The debtor is the member who owes; the creditor is the member who is owed.' },
  { id: 'default', term: 'Default', text: 'A payment that was not made before the payment window closed.' },
  { id: 'reserve', term: 'Reserve fund and haircut', text: 'If a debtor defaults, their stake pays first, then the reserve fund of the circle; only what is still missing is cut from what the creditors receive (the haircut).' },
  { id: 'listing', term: 'Listing', text: 'An offer in the marketplace: what is offered, what is wanted in return, the discount, and until when it is valid.' },
  { id: 'escrow', term: 'Held payment', text: 'For a file, a code or an account transfer, the buyer’s voucher is held until the item is delivered and checked. A cheating seller can be proven wrong.' },
  { id: 'wallet', term: 'NEAR wallet', text: 'The app you sign in with. It signs every action you confirm; x207 never sees your private key.' },
  { id: 'testnet', term: 'Testnet', text: 'The practice network of NEAR. Its tokens have no real value, so you can try everything for free.' },
  { id: 'dao', term: 'DAO', text: 'The group that votes on the rules of the circle, such as limits and fees. Governance shows its proposals.' },
  // FE-072: the words the other pages used to send to GitHub for; the app explains them itself now
  { id: 'transfers-avoided', term: 'Transfers avoided', text: 'Vouchers that did not need their own payment because clearing netted them: vouchers in, minus net payments out. It counts transfers, not fees.' },
  { id: 'cash-needed', term: 'Cash needed', text: 'The net debt members still pay in cash after clearing, as a share of everything promised in vouchers. It is counted before any default.' },
  { id: 'move-epoch', term: 'Late epoch', text: 'A keeper run by the team moves each epoch on its clock until 2026-11-30. If one is late, any account may send the step that is due (close, commit or finalize) to the contract. No permission is needed.' },
  { id: 'agents', term: 'AI agents', text: 'Agents do not need these pages. They use the x207 SDK, or ask the read-only MCP server, to sign vouchers, read their position and pay the net in code.' },
  { id: 'evm', term: 'EVM member', text: 'A member that joined with an Ethereum-style 0x key and signs its vouchers the EVM way (EIP-712).' },
]

const FAQ: { q: string; a: string }[] = [
  { q: 'Do I need real money?', a: 'No. This circle runs on the NEAR testnet. Join the circle gives you free test NEAR and test USDT in one click.' },
  { q: 'What happens when I sign in?', a: 'Your wallet only shows who you are. Every action that changes something (joining, signing a voucher, paying) asks your wallet to confirm it first.' },
  { q: 'Why can I see some pages without signing in?', a: 'The results of every epoch are public, so anyone can check how much was owed, what cancelled and what was paid. Your own forms and balances need a sign-in.' },
  { q: 'When do I have to pay?', a: 'Only during the payment window at the end of an epoch, and only your net amount. Home and Pay and claim show the deadline.' },
  { q: 'What if somebody does not pay me?', a: 'Their stake covers the debt first, then the reserve fund. The Risk page shows how much each part covers.' },
  { q: 'Some pages say “read only”. Why?', a: 'Access grants and Governance show what the contract and the DAO decided. Changes are made there, not on this page.' },
  { q: 'I run an AI agent. Do I need this app?', a: 'No. Agents use the x207 SDK, or ask the read-only MCP server, in code. These pages are for people.' },
]

// The words: every one is on the page. A #term-<id> link from another page scrolls to its word and marks it.
function Words() {
  const { hash } = useLocation()
  const target = GLOSSARY.find((g) => `#term-${g.id}` === hash)?.id
  useEffect(() => {
    if (target) document.getElementById(`term-${target}`)?.scrollIntoView?.({ block: 'center' })
  }, [target])
  return (
    <dl className="ax-glossary kv">
      {GLOSSARY.map((g) => (
        <div key={g.id} id={`term-${g.id}`} className="ax-term" data-target={g.id === target ? 'true' : undefined}>
          <dt>{g.term}</dt>
          <dd>{g.text}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Help() {
  const { search } = useLocation()
  return (
    <div className="ax ax-help">
      <section className="ax-idea" aria-labelledby="help-how">
        <div className="ax-idea-copy">
          <p className="ax-eyebrow">The idea in one minute</p>
          <h2 id="help-how" className="ax-title">Owe in a loop, pay only the difference.</h2>
          <p className="ax-cta">
            <Link className="ds-btn" data-variant="glow" to={{ pathname: '/onboarding', search }}>Join the circle</Link>
            <Link className="ds-btn" data-variant="quiet" to={{ pathname: '/stats', search }}>See a real epoch</Link>
            <a className="ds-btn" data-variant="quiet" href={LIVE.docs} target="_blank" rel="noreferrer">Read the docs</a>
          </p>
        </div>
        <LoopMotif />
        <ol className="ax-flow" aria-label="How x207 works">
          {HOW.map((s) => (
            <li key={s.title} className="ax-flow-step">
              <StepGlyph name={s.glyph} />
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="ax-section" aria-labelledby="help-words">
        <h2 id="help-words" className="ax-h2">What the words mean</h2>
        <Words />
      </section>

      <section className="ax-section" aria-labelledby="help-faq">
        <h2 id="help-faq" className="ax-h2">First questions</h2>
        <div className="ax-faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* FE-122: the guides again, for anyone (no wallet needed for the tour) */}
      <section className="ax-section" aria-labelledby="help-guides" id="guides">
        <h2 id="help-guides" className="ax-h2">See the guides again</h2>
        <p className="guide-copy">Walk the onboarding from step 1, or take the product tour again from the start.</p>
        <GuideActions />
      </section>

      <section className="ax-section" aria-labelledby="help-pages">
        <h2 id="help-pages" className="ax-h2">Every page</h2>
        <ExploreGrid groups={GROUPS} skip={['/help']} />
      </section>
    </div>
  )
}
