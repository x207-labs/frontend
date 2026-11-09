# Privy executor review (FE-059)

Date: 2026-11-09. Scope: the code NEAR Connect downloads and runs for the "Email or Google" wallet.

## Why it needs a review

NEAR Connect (`@hot-labs/near-connect` 0.12.0) fetches the `executor` file named in a wallet manifest and runs it in a sandboxed iframe in the visitor's browser. It does not check an integrity hash. The URL decides what code runs, so it is pinned to one commit.

## What was read

- Repository `beneviolabs/privy-near-connect` (MIT, npm package `@peerfolio/privy-near-connect`). The built `executor.js` is published by a GitHub Actions workflow (`release-executor.yml`) to the `release` branch.
- `release` at commit **`9a149fcb319b9208557452a1ea1287a0e4877c6c`** (2026-09-07): `executor.js`, 4725 bytes, sha256 `16b05e82289d0d56bcada4df387cb63e4ccbe1390907c3cf6fe9e94f7e31c132`. Read in full, and compared with its TypeScript source (`src/executor.ts` at main `d77ca5ce…`). The README's older example commit `3d56b782…` differs only by older logging and a 5 s instead of 30 s ready timeout.

## What the executor does

It is 130 lines. It builds a `wallet` object and calls `window.selector.ready(wallet)`.

- `signIn`, `signInAndSignMessage`, `signMessage`, `signAndSendTransaction(s)`, `signDelegateActions`: each opens the **sign page** named in the manifest (`metadata.signPageURL`, here `https://<our origin>/sign`) with `window.selector.open(...)`, waits for a `READY` message from it, posts the request (`SIGN_REQUEST`) to it, and returns the `RESULT` or `ERROR` it sends back. It gives up if `READY` does not arrive in 30 s, and rejects if the popup is closed or blocked.
- `getAccounts`, `signIn`, `signOut`: read, write, and remove one value, the account id, with `window.selector.storage` under the key `privy-near-connect:account-id`.
- Debug logging is off unless `metadata.debug` is true. It is false in our manifest.

## What it does not do

A search of the file finds none of: `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `eval`, `new Function`, dynamic `import()`, `document`, `cookie`, `localStorage`, `atob`, or script/iframe creation. It makes no network request of its own. It never sees a key: signing happens on our `/sign` page through the Privy SDK, not in the executor.

## What it relies on, and the limits of this review

- It trusts the sandbox for message origin checks (a comment in the source says so). The sign page checks the origin of the request against `allowedOrigins`, set to this app's own origin.
- Whoever controls the manifest's `signPageURL` controls what the user is asked to sign. That page is ours (`/sign`).
- The review covers `executor.js` at the pinned commit only. The npm package `@peerfolio/privy-near-connect` (the sign page code that runs on our origin and talks to Privy and a NEAR RPC at `rpc.<network>.fastnear.com`) was read at the level of its source layout and the files `sign-page.ts`, `signing/*`; it was not audited line by line.
- Not tested against live Privy: no Privy app id exists yet (the owner creates it). Everything here is tested with a fake Privy client. The Google redirect inside the popup and the origin check through the sandbox proxy are the two points most likely to need a change once a real login is tried.

## CSP

With the two Privy ids set, the build allows `https://auth.privy.io` in `connect-src` and `frame-src` (Privy's key frame). Without them the policy is unchanged. The executor host `raw.githubusercontent.com` was already allowed for NEAR Connect's manifests. See `src/lib/csp.ts`.

## To move the pin

Read the new `executor.js` on the `release` branch in full, update this note (commit, size, hash, anything that changed), then change `PRIVY_EXECUTOR_COMMIT` in `src/wallet/privyManifest.ts` and `public/manifest.json` (a test keeps the two in step).
