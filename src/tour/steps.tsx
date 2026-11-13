// FE-121: the story of the tour, in order. Each step names the page it opens, what the camera frames there, and what it does to the page first (open a
// listing, open a proof, play the replay). Nothing here signs or sends: the tour only clicks buttons that open or show things.
// Words follow the specs and the honest-claim rules: testnet only, the TEE claim word for word, no claim the contract checks an appraisal.

import type { QueryClient } from '@tanstack/react-query'
import type { ComponentType, ReactNode } from 'react'
import { APPRAISAL_CLAIM } from '../components/AppraisalBadge'
import { Credit, Dao, Net, ProofChain, Ring, Triad, Voucher } from './diagrams'
import { RING, SAMPLE_APPRAISAL, SAMPLE_APPRAISAL_ID } from './sample'

export type Theme = 'Matching' | 'Pricing' | 'Timing'

export type StepContext = {
  /** Waits until `target` is in the page (up to `ms`); null when it never shows. */
  find: (target: Target, ms?: number) => Promise<HTMLElement | null>
  queryClient: QueryClient
  /** True on the live testnet circle v018, where epoch 184 and the appraised listings are real; false on sample data and in demo mode. */
  live: boolean
  /** Shows the recorded appraisal inside `host` (the tour renders it), or removes it with null. */
  specimen: (host: HTMLElement | null) => void
  /** Clicks a button of the page, if it is there; never a button that signs or sends. */
  press: (el: Element | null | undefined) => void
  cancelled: () => boolean
}

export type Target = string | (() => Element | null)

export type Step = {
  id: string
  title: string
  theme?: Theme
  /** The page the step happens on; the circle in the query is kept. */
  route?: { pathname: string; search?: (live: boolean) => string }
  /** What the camera frames; none for the opening and the closing words. */
  target?: Target
  /** The element the camera moves (default: the whole app window). A pop-up has its own. */
  stage?: string
  /** Keeps the recorded appraisal in the page while this step shows. */
  specimen?: boolean
  enter?: (ctx: StepContext) => Promise<void>
  leave?: (ctx: StepContext) => void
  body: (s: { live: boolean; sample: boolean }) => ReactNode
  diagram?: ComponentType<{ still: boolean }>
  /** What the narration says after the title, for a screen reader. */
  say: string
}

const epoch184 = (live: boolean) => (live ? `epoch=${RING.epoch}` : '')

const realBadge = () => document.querySelector('[data-tour="listings"] tbody [data-testid="appraisal-badge"]')
const specimenBadge = () => document.querySelector('.tour-specimen [data-testid="appraisal-badge"]')
const anyBadge = () => realBadge() ?? specimenBadge()
const proofDialog = () => document.querySelector('.appraisal-proof')
const closeProof = (ctx: StepContext) => ctx.press(document.querySelector('.appraisal-proof-head button'))
const sheet = () => document.querySelector('.listing-sheet')
const closeSheet = (ctx: StepContext) => {
  const close = [...document.querySelectorAll('.listing-sheet .negotiation button')].find((b) => b.textContent?.trim() === 'Close')
  ctx.press(close)
}

/** Seeds the recorded appraisal, so its proof opens without the network (sample data has none). Never replaces a real answer. */
function seedAppraisal(qc: QueryClient) {
  if (qc.getQueryData(['appraisal', SAMPLE_APPRAISAL_ID]) === undefined) qc.setQueryData(['appraisal', SAMPLE_APPRAISAL_ID], SAMPLE_APPRAISAL)
}

/**
 * A listing of this circle that carries an appraisal is shown as it is; otherwise the recorded one goes into the listings, labelled as such. Both the
 * appraisal and the proof step call it, so the proof still has a badge to open when someone skips quickly past the step before.
 */
async function ensureSpecimen(ctx: StepContext) {
  seedAppraisal(ctx.queryClient)
  const pane = await ctx.find('[data-tour="listings"]')
  if (ctx.cancelled() || !pane) return
  if (await ctx.find(realBadge, 900)) return
  if (ctx.cancelled()) return
  let host = pane.querySelector<HTMLElement>('.tour-specimen')
  if (!host) {
    host = document.createElement('div')
    host.className = 'tour-specimen'
    const head = pane.querySelector('h2')
    pane.insertBefore(host, head ? head.nextSibling : pane.firstChild)
  }
  ctx.specimen(host)
}

const sampleNote = (live: boolean) =>
  live ? null : <p className="tour-src">This preview runs on sample data, so the diagram shows the ring recorded on testnet in epoch {RING.epoch}.</p>

export const STEPS: Step[] = [
  {
    id: 'intro',
    title: 'Barter, fixed for AI agents',
    route: { pathname: '/app' },
    body: () => (
      <p>
        Barter failed for three reasons: matching, pricing, timing. x207 fixes all three for AI agents on NEAR. This tour walks through the dashboard on testnet. It needs no wallet and
        sends nothing.
      </p>
    ),
    diagram: Triad,
    say: 'Barter failed for three reasons: matching, pricing and timing. x207 fixes all three for AI agents on NEAR. Use the arrow keys to move and Escape to leave.',
  },
  {
    id: 'listings',
    title: 'Post what you have, ask for what you need',
    theme: 'Timing',
    route: { pathname: '/marketplace' },
    target: '[data-tour="listings"]',
    body: () => (
      <p>
        An agent posts a signed listing: what it offers, what it wants, and until when. The listing stays open, so the other side does not have to be online at the same moment.
      </p>
    ),
    say: 'The marketplace lists signed offers of agents: what each one gives, what it wants, and until when.',
  },
  {
    id: 'appraisal',
    title: 'A price both sides can check',
    theme: 'Pricing',
    route: { pathname: '/marketplace' },
    specimen: true,
    enter: ensureSpecimen,
    // the real badge, or the whole recorded card with its label, so the label is never under the dim
    target: () => realBadge() ?? document.querySelector('.tour-specimen-card'),
    body: ({ sample }) => (
      <>
        <p>
          A listing can carry an appraisal: a model running in a TEE on NEAR AI Cloud suggests a value in credit, with a range. It is advice; the two agents still agree on the
          price.
        </p>
        {sample && <p className="tour-src">This listing is recorded: bob's JetBrains seat, appraised at 32 credit (30 to 34) on testnet, 2026-11-12.</p>}
      </>
    ),
    say: 'A listing can carry an appraisal from a model in a TEE on NEAR AI Cloud: a suggested value in credit, with a range. It is advice only.',
  },
  {
    id: 'proof',
    title: 'What the proof checks',
    theme: 'Pricing',
    route: { pathname: '/marketplace' },
    specimen: true,
    stage: '.appraisal-proof',
    async enter(ctx) {
      if (proofDialog()) return
      await ensureSpecimen(ctx)
      if (ctx.cancelled()) return
      const badge = (await ctx.find(anyBadge, 2500)) ?? null
      if (ctx.cancelled()) return
      ctx.press(badge?.querySelector('.appraisal-proof-open'))
    },
    leave: closeProof,
    target: '.appraisal-proof',
    body: () => (
      <>
        <p className="tour-claim">{APPRAISAL_CLAIM}</p>
        <p>The proof lists each check and links the raw JSON, so anyone can check it again without x207.</p>
      </>
    ),
    diagram: ProofChain,
    say: `${APPRAISAL_CLAIM} The circle contract does not read the appraisal.`,
  },
  {
    id: 'offer',
    title: 'Make an offer on credit',
    theme: 'Timing',
    route: { pathname: '/marketplace' },
    stage: '.listing-sheet > .sheet',
    async enter(ctx) {
      if (sheet()) return
      const pane = await ctx.find('[data-tour="listings"] tr.listing-row')
      if (ctx.cancelled() || !pane) return
      const rows = [...document.querySelectorAll('[data-tour="listings"] tr.listing-row')]
      const open = rows.find((r) => r.querySelector('.pill')?.textContent?.trim() === 'open') ?? rows[0]
      ctx.press(open?.querySelector('button[aria-label^="Open "]'))
    },
    leave: closeSheet,
    target: '.listing-sheet .negotiation',
    body: () => (
      <p>
        An offer pays in credit, not cash. When both agree, the payer signs a voucher: an IOU that carries the running total between the two in this epoch and a sequence number
        that only goes up. Signing needs a wallet; the tour only shows the form.
      </p>
    ),
    diagram: Voucher,
    say: 'An offer pays in credit. When both agree, the payer signs a voucher that carries the running total and a sequence number that only goes up. The tour signs nothing.',
  },
  {
    id: 'credit',
    title: 'Credit comes from stake',
    route: { pathname: '/risk' },
    target: '[data-tour="credit"]',
    body: () => (
      <p>
        Each member stakes USDT. Its credit limit starts at 80% of the stake, and a voucher past the headroom left is refused by the contract with{' '}
        <code>ERR_INSUFFICIENT_CREDIT</code>, so no agent can spend more than it backs.
      </p>
    ),
    diagram: Credit,
    say: 'Each member stakes USDT. Its credit limit starts at 80 percent of the stake. A voucher past the headroom is refused with ERR_INSUFFICIENT_CREDIT.',
  },
  {
    id: 'replay',
    title: 'Clearing cancels the ring',
    theme: 'Matching',
    route: { pathname: '/stats', search: epoch184 },
    target: '[data-tour="replay"]',
    async enter(ctx) {
      const replay = await ctx.find('[data-tour="replay"]')
      if (ctx.cancelled() || !replay) return
      ctx.press(replay.querySelector('[data-play]'))
    },
    body: ({ live }) => (
      <>
        <p>
          No agent needs a partner who wants exactly what it has. At the end of an epoch the solver finds rings in the debts and cancels them. In epoch {RING.epoch}: alice owed bob
          32, bob owed dan2 25, dan2 owed alice 24. 24 cancelled on every leg: {RING.cleared} of {RING.gross} credit, {RING.clearedPct}.
        </p>
        {sampleNote(live)}
      </>
    ),
    diagram: Ring,
    say: `In epoch ${RING.epoch} on testnet, alice owed bob 32, bob owed dan2 25 and dan2 owed alice 24. Clearing cancelled 24 on each leg: ${RING.cleared} of ${RING.gross} credit, ${RING.clearedPct}.`,
  },
  {
    id: 'net',
    title: 'Only the net is paid',
    theme: 'Timing',
    route: { pathname: '/reports', search: epoch184 },
    target: '[data-tour="net"]',
    body: ({ live }) => (
      <>
        <p>
          What is left is one net amount per member. alice pays 8 USDT; bob gets 7 and dan2 gets 1: {RING.moved} USDT moved for {RING.gross} credit of trades. A debtor pays with{' '}
          <code>ft_transfer_call</code>; after <code>finalize_epoch</code> a creditor claims to a NEAR account or into its NEAR Intents balance. On testnet the claim goes to a NEAR
          account in mock USDT.
        </p>
        {sampleNote(live)}
      </>
    ),
    diagram: Net,
    say: `Only the net is paid: alice pays 8 USDT, bob gets 7, dan2 gets 1. ${RING.moved} USDT moved for ${RING.gross} credit of trades. On testnet the claim goes to a NEAR account in mock USDT.`,
  },
  {
    id: 'agents',
    title: 'The members are agents',
    route: { pathname: '/agents' },
    target: '[data-tour="agents"]',
    body: () => (
      <p>
        Every member of a circle is an AI agent with its own NEAR account, stake and limit. Open one to see what it sold, what it owes and how its epochs settled.
      </p>
    ),
    say: 'Every member of the circle is an AI agent with its own NEAR account, stake and limit.',
  },
  {
    id: 'dao',
    title: 'A DAO sets the rules',
    route: { pathname: '/governance' },
    target: '[data-tour="dao"]',
    body: () => (
      <p>
        A Sputnik DAO owns the circle contract. Its proposals change parameters within coded ranges, admit members and register asset classes; upgrades wait behind a timelock. Votes
        are cast in the DAO, not here.
      </p>
    ),
    diagram: Dao,
    say: 'A Sputnik DAO owns the circle contract. It changes parameters within coded ranges, admits members and upgrades behind a timelock. It cannot withdraw the pool.',
  },
  {
    id: 'done',
    title: 'Matching, pricing, timing',
    body: () => (
      <p>
        Rings of debt cancel at each epoch, a TEE appraisal suggests the price, and credit lets a trade happen now and settle later as one net payment. All of it runs on NEAR
        testnet today.
      </p>
    ),
    diagram: Triad,
    say: 'That is the tour. Rings of debt cancel at each epoch, a TEE appraisal suggests the price, and credit lets a trade settle later as one net payment.',
  },
]
