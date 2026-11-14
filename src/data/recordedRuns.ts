// FE-128: what changed hands in an epoch, for the epochs that have a run record. The read API does not say which escrow delivered in which epoch,
// so these are static copies of recorded runs on NEAR testnet. Nothing here is fetched or computed: change a value only together with its source.
// Sources (x207-labs/agents, docs/): demo-barter-ring-assets.md and demo-barter-ring-assets.json (AG-055, epoch 245: the three legs, the owner of each
// token before and after, the complete_escrow hashes, the clearing), demo-barter-cycle.md (AG-052, epoch 184: credit only, no asset was delivered).

export const NEARBLOCKS_TX = 'https://testnet.nearblocks.io/txns/'

/** One class A purchase: the seller's NFT went into the circle's escrow and `complete_escrow` handed it to the buyer. */
export type Delivery = {
  key: 'license' | 'ticket' | 'game-item'
  /** token id on the mock NFT contract */
  token: string
  /** asset type of the barter catalog */
  kind: string
  /** what the mock NFT stands for */
  label: string
  seller: string
  buyer: string
  sellerAccount: string
  buyerAccount: string
  /** credit, set by the operator (the live appraiser valued the mock tokens at about 0) */
  price: number
  completeEscrow: string
}

type Recorded = { contract: string; circle: string; epoch: number; item: string; doc: string }
export type AssetEpoch = Recorded & { kind: 'assets'; nftContract: string; deliveries: readonly Delivery[]; owed: number; cleared: number; moved: number; stats: string }
export type CreditEpoch = Recorded & { kind: 'credit' }
export type RecordedEpoch = AssetEpoch | CreditEpoch

const member = (name: string) => `${name}.x207-v18-own.testnet`

/** AG-055: alice → bob → dan2 → alice, one NFT per leg, all three purchases in epoch 245 of x207-v018.testnet. */
export const RING_245: AssetEpoch = {
  kind: 'assets',
  contract: 'x207-v018.testnet',
  circle: 'agents-main',
  epoch: 245,
  item: 'AG-055',
  doc: 'https://github.com/x207-labs/agents/blob/main/docs/demo-barter-ring-assets.md',
  stats: '/stats?epoch=245&circle=v018',
  nftContract: 'nft.x207-b1-aux.testnet',
  deliveries: [
    { key: 'license', token: 'ag055-1794613317-license', kind: 'license:software-nft', label: 'Software licence NFT', seller: 'alice', buyer: 'bob', sellerAccount: member('alice'), buyerAccount: member('bob'), price: 24, completeEscrow: 'GWF3npguAhQALgfAjb7evpeDhGYHdWzD1yLwm3yGrp9K' },
    { key: 'ticket', token: 'ag055-1794613317-ticket', kind: 'ticket:event-nft', label: 'Event ticket NFT', seller: 'bob', buyer: 'dan2', sellerAccount: member('bob'), buyerAccount: member('dan2'), price: 32, completeEscrow: '4ajpqavyrhBqhd6uBTMzKVkEAN5XzEtY4RfLXVarA7tz' },
    { key: 'game-item', token: 'ag055-1794613317-game-item', kind: 'game:item-nft', label: 'Game item NFT', seller: 'dan2', buyer: 'alice', sellerAccount: member('dan2'), buyerAccount: member('alice'), price: 25, completeEscrow: 'GmhhMhPjbMoucGJbCU9Qm7FaHXfkRCC1d6KdfeoXkvPz' },
  ],
  // on chain: total_obligation 81000000, total_cleared 72000000; the 9 left netted to 8 mock USDT (alice paid 1, dan2 paid 7, bob claimed 8)
  owed: 81,
  cleared: 72,
  moved: 8,
}

/** AG-052: the same ring of three members in epoch 184, paid in credit only. */
export const CREDIT_184: CreditEpoch = {
  kind: 'credit',
  contract: 'x207-v018.testnet',
  circle: 'agents-main',
  epoch: 184,
  item: 'AG-052',
  doc: 'https://github.com/x207-labs/agents/blob/main/docs/demo-barter-cycle.md',
}

export const RECORDED: readonly RecordedEpoch[] = [RING_245, CREDIT_184]

/** The run record of an epoch of a circle, or `null` when there is none. */
export function recordedEpoch(contract: string, circle: string, epoch: number): RecordedEpoch | null {
  return RECORDED.find((r) => r.contract === contract && r.circle === circle && r.epoch === epoch) ?? null
}
