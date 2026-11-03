// Dev server only (FE-031 finding): `@x207/core` has top-level `Buffer.from(...)` in `voucher.js`. The production build drops that module because no page uses it, but the dev server does not
// tree-shake and showed a blank page. `vite.config.ts` adds this script to the page of the dev server only, before the app; the production bundle does not contain it.
import { Buffer } from 'buffer'

;(globalThis as { Buffer?: unknown }).Buffer ??= Buffer
