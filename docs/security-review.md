# Security review of the frontend (read as an attacker)

Date: 2026-11-03. Scope: `frontend/src` and `index.html` at the commit that carries this file. Method: the same as the reviews of the facilitator and the contract. The attacker is **another circle member, the read API, or anyone who can put text into the chain or the book** (listings, offers, `asset_type`, `limits.scope`, account names, memos, DAO proposal descriptions). A test that fails first, then the fix; findings that are not fixed say why. Tests: `src/test/security.test.tsx` and the last `describe` of `src/components/Negotiation.test.tsx` (`TC-FE-SEC-xx`). Everything in this file was read or run in the repository; nothing was tried against a real wallet.

## What was checked

| Area | Check | Result |
| --- | --- | --- |
| HTML sinks | `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `javascript:` in all non-test sources | None (`TC-FE-SEC-10`) |
| Rendering of hostile data | A listing whose `account`, `asset_type`, `terms` and `detail` hold `<img onerror>`, `<script>`, `javascript:` and `<svg onload>` | Shown as text; no element, no handler, no script is created (`TC-FE-SEC-14`). React escapes every string |
| Links | Every `<a>`: `target="_blank"` has `rel="noreferrer"`; the `href` starts with a fixed prefix (`#`, `/`, an explorer constant) so that data cannot choose the scheme or the host | Pass (`TC-FE-SEC-11`). The data part (a hash, an account) is appended to an explorer URL; it can change the path on that explorer only |
| Paths to the read API | Account and hash segments go through `encodeURIComponent` (`src/api/client.ts`) | Pass |
| Environment | The names of every `VITE_*` variable in the sources; no name with KEY, SECRET, TOKEN, PRIVATE, PASSWORD, JWT, MNEMONIC or SEED; the built bundle holds no 64-byte key | Pass (`TC-FE-SEC-12`). The seven variables are API URL, circle id, contract id, network, explorer URL, poll interval and the fixtures flag. The fixtures in the bundle hold public keys only |
| Storage | `localStorage` is written only with the flag that remembers a wallet connection; the voucher key lives in component state, in a `type="password"` field, and is never written, sent or put in a URL; no cookie, no IndexedDB, no `console.log` of keys | Pass (`TC-FE-SEC-13`; `TC-FE-020-04` checks that the key is not in the request) |
| Transaction builders | `src/wallet/transactions.ts`: receiver, method, `circle_id` and contract id come from constants and configuration; only `epoch`, `amount` and the connected account are variable | Pass. See "Not fixed" for the amount of a settlement |
| What the voucher key signs | The message and the recipient of a barter bundle | **Finding FE-1, fixed** |
| Headers | `index.html` | Object, base and form limited, no referrer (`TC-FE-SEC-15`); see FE-2 |

## Found

### FE-1 (high, fixed): the server decided what the voucher key signs
`Negotiation.tsx` signed `preview.bundle.message` with the recipient `preview.bundle.recipient`, after checking `sha256(message) == preview.bundle.termsHash`. All three values came from the same server, so the check proved nothing: a server (or a man in the middle on a plain `http://` API) could have any message signed by the member's voucher key, for any recipient, as long as it sent the hash of that message. The recipient is the part of the NEP-413 signing hash that ties a signature to a contract, so a bundle message for **another circle** (an account the attacker runs, where the same voucher key is registered) would have been signed as if it were this circle's, and the user saw only a list of legs. The signing of a proposal (`ProposalSigner`) used `proposal.terms.circle` from the server as the recipient in the same way.

*Tests first* (`TC-FE-SEC-01..08`, all red before the change): a recipient that is not this circle's contract; terms for another circle with a matching hash; a message that is a voucher or any other JSON; a message that is not canonical; a leg that makes the signer pay more than the breakdown on screen; a signer who is in no leg; an epoch that differs from the preview; a proposal for another circle.

*Fix*: `checkBundleToSign` (`src/lib/barter.ts`) runs before every signature of a bundle. It requires the recipient to be the configured contract id; the message to be exactly the canonical bundle terms (keys `circle`, `epoch`, `legs`, optionally `search_leg`; 2 to 64 legs; amounts in the contract's form; byte-equal to the canonical serialization); the circle and the epoch inside to be this circle and the epoch of the preview; the signer to be the payer or the payee of at least one leg; and, when a breakdown is shown, the legs that the signer pays not to add up to more than the figures of the breakdown. The recipient that is signed is the configured contract id, not the one from the server. The legs on screen are taken from the checked terms. The canonical serialization of the frontend now includes `search_leg`, as in the SDK.

*Limit that remains*: the check bounds what is signed to a bundle of this circle in which the signer takes part, with the amounts of the breakdown as an upper bound. It cannot know whether the legs of the **other** members are fair, and the breakdown itself comes from the server. The contract limits the damage of a bundle (a leg is a cap, the headroom of the payer is reserved only for it).

### FE-2 (low, partly fixed): no Content-Security-Policy
`index.html` had none. Added: `object-src 'none'; base-uri 'none'; form-action 'self'` and `referrer no-referrer`. A policy that also limits scripts and connections (`script-src 'self'`, `connect-src` to the API, the RPC and the wallet's hosts) was **not** added: the wallet connector loads code and frames from hosts that were not checked here, the dev server needs inline scripts, and a wrong policy would stop the wallet in production without any test noticing. The owner should set it as an HTTP header on the host, after trying the real wallet.

## Not fixed, and why

| Item | Why it stays |
| --- | --- |
| The amount of `settleTx(epoch, amount)` comes from the read API (`item.amount`) | The wallet shows the transfer before it is signed, and the contract refunds an overpayment (`residual_paid.refunded`). A check against the chain would need an RPC read in the browser, which the frontend does not have |
| The explorer URL gets a hash or an account from the API appended | Only the path on the explorer can change; the origin is a constant. Left as is |
| `terms_hash` of `join` is typed by the user | It is not taken from the server, which is the right way round; the page cannot tell the user which hash is the real one of the circle |
| The mock wallet and fixtures are in the production bundle | They hold public keys only. They are reachable with `VITE_X207_USE_FIXTURES=true`; the production build should set it to `false` (the default) |

## Not checked

A real wallet through NEAR Connect (the transaction that the wallet shows against the one the page asks for); a browser run with a hostile read API (the tests replace `fetch`); the dependencies of the frontend (no audit of `package-lock.json`); the dashboard pages other than the marketplace for hostile data (they render strings the same way, and the source scan covers them, but only the listing page was rendered with hostile data); clickjacking (needs a response header); denial of service by very large API answers.
