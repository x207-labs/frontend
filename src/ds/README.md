# x207 design system (v4)

One visual language for the landing and the app, introduced with the v4 landing (owner approval 2026-11-11).

## Files

| File | What it holds |
|---|---|
| `fonts.css` + `fonts/` | "Agent Console" type: Hubot Sans (display), Mona Sans (text), Monaspace Neon (data), Monaspace Krypton (agent voice). Self-hosted, SIL OFL 1.1, licences in `fonts/`. |
| `tokens.css` | `--ds-*` custom properties: surfaces, ink, status codes, accent/focus, floor colours, type scale, radii, spacing, depth, motion. |
| `components.css` + `components.tsx` | `ds-*` classes and React wrappers: `Panel`, `Kpi`, `StatusBadge`, `Chip`, `Eyebrow`, `Num`, `AgentText`, `Button`, `ButtonLink`, `Tally`. |

`src/boot.tsx` (app) and `src/landing/mount.tsx` (landing) import `fonts.css` and `tokens.css`. `src/styles.css` keeps its own token names (`--paper`, `--ink`, `--accent-fill`, `--s200` ...) so existing pages follow automatically. Their values are the `--ds-*` values, written as hex because `src/test/contrast.test.ts` reads them.

## Rules for internal pages

1. **Colour has a role.** Use `--ds-settled` (200), `--ds-claim` (202), `--ds-due` (402) and `--ds-default` (409) only for those states. Pair each with the code and a word (`StatusBadge`), never colour alone. Blue (`--ds-accent`) is for action. Lime (`--ds-focus`) is for focus and "now".
2. **Type has a job.**
   - Titles and the one big figure use `--ds-font-display` at `--ds-display-weight`/`--ds-display-stretch`.
   - Prose uses `--ds-font-text`.
   - Every amount, id and hash uses `--ds-font-mono` with tabular figures (`Num`, `.num`).
   - Words an agent signed or said use `--ds-font-agent` (`AgentText`, `.page-intro`).
3. **One glowing primary per screen** (`Button variant="glow"`). The others are `quiet`.
4. **Panels are quiet.** Use `Panel` (surface + hairline) for blocks and `Kpi` for headline numbers (the glass edge). Use `Tally` colour blocks only for the three figures of an epoch: owed, cancelled in loops, moved.
5. **Shapes:** panel 14px, card 12px, control 10px, chip 8px, badge 6px. Pills (999px) only for the nav and segmented switches.
6. **Motion:** `--ds-ease`, about 220ms. Respect `prefers-reduced-motion`. Hover styles sit under `(hover: hover) and (pointer: fine)`.
7. **English only** in the product. Copy is plain and honest: testnet and mock USDT are always named.

## Internal pages v4: the blend (owner direction 2026-11-11)

Same recipe as the landing: **70% calm statement design** (drafts `01-epoch-statement`, `02-overview`, `10-epoch-replay`, `11-story` + the partner's layout ideas) and **30% clearing-floor energy** (draft `20-clearing-floor`). Drafts: `reports/audit-2026-11-10/fe-drafts/`.

**The 70% (calm, institutional):**
- Every page opens with a statement, not a widget: a one-line eyebrow in mono (`agents-main · epoch 41 · finalized`), the H1, then one sentence that carries the real numbers ("In epoch 41, 2,563.38 was owed and 1,820 moved.").
- Facts rows (contract, network id, epoch length, committed at) in `--ds-font-mono`, label above value, hairline under the row.
- Tables with hairlines, uppercase small headers, numbers right-aligned, 2 decimals, unit in the header.
- Headline numbers in `Kpi` cards on a 1120px column (4 across on desktop, 2 on tablet, 1 on phone). Real numbers only.
- One glowing primary button per screen; the rest are quiet.
- Status always as `StatusBadge` (code + word), never colour alone.

**The 30% (energy), used only where an epoch is shown moving:**
- `Tally` blocks for the three figures of an epoch: owed (white), cancelled in loops (lime), moved (navy/accent).
- The epoch replay stage: the ring of agent faces on the blue floor (`--ds-floor-*`), a lime pill play button, phase chapters.
- Lime marks "now": the current phase dot, the active nav tick, the focus ring.

**Not used:** background photos, glass on every panel, bouncy motion, decorative gradients behind data, copy that hides that the money is mock USDT on testnet.
