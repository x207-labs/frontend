# x207 frontend

The dashboard of [x207](https://github.com/x207-labs/x207): onboarding, obligation graph, clearing statistics, the 207 report, settlement, risk and governance, plus the marketplace pages. React + Vite + TypeScript.

## Its role in x207

The dashboard is where a human sees what the credit circle is doing. It reads the [read API](https://github.com/x207-labs/backend) (polled every 5 seconds) and the public testnet RPC, and it signs through a wallet port: before the page signs a voucher it checks recipient, circle, canonical form and legs itself, so a lying server cannot change what the key signs.

## Try it

**Live:** <https://x207-dashboard.vercel.app> is this app built for the circle `agents-main` on `x207-v013.testnet`. It is read-only static hosting on Vercel; data comes from the hosted read API (CORS allows this origin only) and the testnet RPC. Pages for features the hosted circle has not used (marketplace, licenses) show an empty state. A real wallet through NEAR Connect has not been tried on it.

**Locally:**

```bash
cp .env.example .env
npm ci
npm run dev        # http://localhost:5207
```

Without a backend, set `VITE_X207_USE_FIXTURES=true` in `.env` to use sample data.

## Test

| Command | What it does |
| --- | --- |
| `npm run build` | Type check and static build to `dist/` |
| `npm test` | Component tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright, uses the installed Chrome) |
| `npm run lint` | Lint (oxlint) |

The exit and stake withdrawal panel (`src/components/ExitPanel.tsx`) is tested with a mock wallet (`ExitPanel.test.tsx`) and against near-sandbox (`src/test/exit.sandbox.test.tsx`, runs in the umbrella with `X207_SANDBOX=1`): the page is rendered with the real read API over the real contract, "Request exit" sends `request_exit`, the keeper closes the epoch until `finalized`, "Withdraw stake" sends `withdraw_stake`, and the page shows `exited`. Only the `WalletPort` is replaced in that test.

## Build for the hosted circle

The build takes only public `VITE_*` values, no secret. The content security policy is built into `index.html` from `VITE_X207_API_URL`, so set it at build time:

```bash
VITE_X207_API_URL=<read API origin> VITE_X207_CIRCLE=agents-main VITE_X207_CONTRACT_ID=x207-v013.testnet VITE_NEAR_NETWORK=testnet npm run build
```

Deploy `dist/` with `vercel.json` (single page rewrite). All variables are in `.env.example`.

## Back to x207

Overview, live demo links and the claims map: [x207-labs/x207](https://github.com/x207-labs/x207).

## License

Apache-2.0
