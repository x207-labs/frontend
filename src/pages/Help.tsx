// FE-069: the help page a first-time customer can reach from every page (sidebar, page search, sign-in cards, not-found page).
// It explains the product in four steps, defines every word the other pages use, answers the first questions, and links every page.
import { Link, useLocation } from 'react-router-dom'
import { ExploreGrid } from '../components/ExploreGrid'
import { GROUPS } from '../routes'

const HOW: { title: string; text: string }[] = [
  { title: 'Join a circle', text: 'A circle is a group of members (people or AI agents) who agree to trade on credit. You join with a NEAR wallet and put down a small stake, which gives you a credit limit.' },
  { title: 'Trade in credit', text: 'When you buy something from another member you sign a voucher: a promise to pay later. No money moves yet, so many small trades cost nothing to make.' },
  { title: 'Loops cancel out', text: 'At the end of each epoch x207 looks at every voucher together. When A owes B, B owes C and C owes A, those debts cancel each other and never need paying.' },
  { title: 'Pay only the net', text: 'What is left becomes one net amount per member. You either pay it once or claim it once, in USDT, during the payment window.' },
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
]

const FAQ: { q: string; a: string }[] = [
  { q: 'Do I need real money?', a: 'No. This circle runs on the NEAR testnet. Join the circle gives you free test NEAR and test USDT in one click.' },
  { q: 'What happens when I sign in?', a: 'Your wallet only shows who you are. Every action that changes something (joining, signing a voucher, paying) asks your wallet to confirm it first.' },
  { q: 'Why can I see some pages without signing in?', a: 'The results of every epoch are public, so anyone can check how much was owed, what cancelled and what was paid. Your own forms and balances need a sign-in.' },
  { q: 'When do I have to pay?', a: 'Only during the payment window at the end of an epoch, and only your net amount. Home and Pay and claim show the deadline.' },
  { q: 'What if somebody does not pay me?', a: 'Their stake covers the debt first, then the reserve fund. The Risk page shows how much each part covers.' },
  { q: 'Some pages say “read only”. Why?', a: 'Access grants and Governance show what the contract and the DAO decided. Changes are made there, not on this page.' },
]

export function Help() {
  const { search } = useLocation()
  return (
    <div className="home-grid bento">
      <section className="card span-all" aria-labelledby="help-how">
        <div className="card-head">
          <h2 id="help-how">How x207 works</h2>
          <p className="section-eyebrow">The idea in one minute</p>
        </div>
        <ol className="steps">
          {HOW.map((s) => (
            <li key={s.title} className="step">
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="cta-row">
          <Link className="btn" to={{ pathname: '/onboarding', search }}>Join the circle</Link>
          <Link className="btn quiet" to={{ pathname: '/stats', search }}>See a real epoch</Link>
        </p>
      </section>

      <section className="card span-all" aria-labelledby="help-words">
        <div className="card-head">
          <h2 id="help-words">What the words mean</h2>
        </div>
        <dl className="glossary">
          {GLOSSARY.map((g) => (
            <div key={g.id} id={`term-${g.id}`}>
              <dt>{g.term}</dt>
              <dd>{g.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="help-faq" className="card span-all faq">
        <div className="card-head">
          <h2 id="help-faq">First questions</h2>
        </div>
        {FAQ.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      <section className="card span-all" aria-labelledby="help-pages">
        <div className="card-head">
          <h2 id="help-pages">Every page</h2>
        </div>
        <ExploreGrid groups={GROUPS} skip={['/help']} />
      </section>
    </div>
  )
}
