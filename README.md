# x207 frontend

The x207 dashboard (module M8), features F1, F3, F4, F6, F7: onboarding, obligation graph, clearing statistics, 207 report, settlement, risk, and governance. React + Vite + TypeScript. Part of [`x207-labs/x207`](https://github.com/x207-labs/x207).

## Running

```bash
cp .env.example .env
npm ci
npm run dev
```

The dashboard opens at `http://localhost:5207`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run build` | Type check and static build to `dist/` |
| `npm test` | Component tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright, uses the installed Chrome) |
| `npm run lint` | Lint (oxlint) |

## Configuration

All variables are in `.env.example`. The read API is polled every 5 seconds (`VITE_X207_POLL_MS`, K-49). Without a backend, set `VITE_X207_USE_FIXTURES=true` to use the sample data of the Backend API Spec.

## Integration status

The response types in `src/api/types.ts` are written by hand from the Backend API Spec and are replaced by imports of `@x207/core` once the umbrella npm workspaces are installed (UM-006). While the backend does not exist yet, the read pages are tested only against sample data.

The exit and stake withdrawal panel (`src/components/ExitPanel.tsx`) is tested two ways. With a mock wallet and sample data (`ExitPanel.test.tsx`, 7 tests). And against near-sandbox (`src/test/exit.sandbox.test.tsx`, runs only in the umbrella with `X207_SANDBOX=1`): the page is rendered with the real read API (the indexer over the real contract), the "Request exit" button sends `request_exit`, the keeper closes that epoch until `finalized`, the "Withdraw stake" button opens and sends `withdraw_stake`, then the stake comes back as USDT and the page shows the status `exited`. Limit (K-60): the only thing replaced in that test is the `WalletPort` (the sandbox account signer); NEAR Connect with a real wallet can only be tried on testnet by a human and has not been tried.
