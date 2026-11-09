// FE-044: every number on the landing page, in one place, with its source. Nothing here is a projection or an estimate: change a value only together with its source.
// Sources (umbrella x207-labs/x207): README.md "What epoch 8 showed" and "The idea in one breath", CLAIMS.md, docs/barter-evidence.md "The counts",
// docs/testnet-0.0.13-realistic.json (the 24 register_cumulative steps of epoch 8 and the positions after commit).

export const LIVE = {
  contract: 'x207-v018.testnet',
  version: '0.0.18',
  contractUrl: 'https://testnet.nearblocks.io/address/x207-v018.testnet',
  api: 'https://v018.x207.boxd.sh',
  apiEpochs: 'https://v018.x207.boxd.sh/x207/circles/agents-main/epochs',
  // FE-045: every "open the dashboard" link opens the live circle v018 (the picker still offers v013 for the epoch 8 history).
  dashboard: '/stats?circle=v018',
  github: 'https://github.com/x207-labs',
  repo: 'https://github.com/x207-labs/x207',
  claims: 'https://github.com/x207-labs/x207/blob/main/CLAIMS.md',
  barterEvidence: 'https://github.com/x207-labs/x207/blob/main/docs/barter-evidence.md',
  epoch8Run: 'https://github.com/x207-labs/x207/blob/main/docs/testnet-0.0.13-realistic.json',
  finalizeTx: 'https://testnet.nearblocks.io/txns/BLsJyPoQykcQr2X5VaqxMH2dY2bon1B1U4d71FNc4bRi',
  x402Proposal: 'https://github.com/x402-foundation/x402/issues/4131',
  mcp: 'https://mcp.x207.boxd.sh/mcp',
} as const

/** Epoch 8 of `x207-v013.testnet`, mock USDT. */
// Epoch 8 ran on the older circle x207-v013.testnet (contract 0.0.13, docs/testnet-0.0.13-realistic.json "contract"), not on the live x207-v018:
// every place that shows these numbers names that circle. CLAIMS.md row "A realistic epoch clears on a real network": five debtors paid, one
// default was cut from the stake, three of the eight creditors claimed. The 14 movements are README's metric residualTransfers (one per member with a net position).
export const EPOCH8 = {
  contract: 'x207-v013.testnet',
  tag: 'testnet epoch 8, x207-v013',
  paid: 5,
  claimed: 3,
  vouchers: 24,
  members: 15,
  gross: 41.35,
  moved: 7.75,
  movedShare: 18.7,
  movements: 14,
  debtors: 6,
  creditors: 8,
  cleared: 21.8,
  clearedShare: 52.7,
  /** gross - cleared: the credit left after the loops cancel, netted per member down to `moved` (FE-051). */
  netted: 19.55,
  defaultDue: 0.55,
  staked: '1,499.10',
  gasEpoch: 109.7,
  gasTransfers: 54.9,
} as const

/** The 24 obligations of epoch 8 as registered (debtor, creditor, credit). Sum 41.35. */
export const EDGES: readonly (readonly [number, number, number])[] = [
  [12, 9, 0.9], [10, 11, 1.1], [1, 2, 2.5], [7, 8, 4.25], [2, 0, 3], [4, 3, 0.75], [9, 10, 2.4], [8, 5, 1.8], [14, 13, 0.45], [5, 6, 5], [6, 7, 3.5], [0, 1, 4],
  [3, 4, 1.2], [11, 3, 0.55], [13, 12, 1.7], [1, 5, 0.95], [14, 0, 0.35], [4, 12, 0.65], [10, 4, 0.4], [2, 10, 1.3], [8, 9, 1.15], [9, 11, 0.6], [7, 14, 0.8], [6, 13, 2.05],
]

/** Net position per member after the epoch: positive pays in (due), negative claims out. m14 nets to 0. */
export const NET: readonly number[] = [0.65, -0.55, 1.8, -0.1, -0.2, 2.25, 0.55, 1.55, -1.3, 0.95, -2.2, -1.15, -1.45, -0.8, 0]

/** m06 missed its due; it was covered from its stake by finalize_epoch. */
export const DEFAULTER = 6

/** Source: docs/barter-evidence.md of the umbrella repository, table "The counts" (read at umbrella main 37a464b, after CT-127 and CT-131 moved #11 and #14 to testnet).
 * Landing.test.tsx reads that table and fails when a count here differs, so a change there cannot slip past this copy. */
export const BARTER = [
  { key: 'testnet', count: 13, label: 'Ran on NEAR testnet', note: 'with transaction hashes in the repository' },
  { key: 'sandbox', count: 13, label: 'Run in near-sandbox', note: 'against the real contract and backend' },
  { key: 'mock', count: 31, label: 'End to end with a mock provider', note: 'the x207 side is tested, the provider is ours' },
  { key: 'unit', count: 12, label: 'Unit-tested only', note: 'no transaction of their own' },
  { key: 'generic', count: 13, label: 'Registered, no test of their own', note: 'covered by the generic path of their class' },
  { key: 'p1', count: 2, label: 'Design only', note: 'account kinds #12 and #13' },
  { key: 'roadmap', count: 1, label: 'Not built', note: 'registered so a listing can name it' },
  { key: 'refused', count: 9, label: 'Refused on purpose', note: 'offer_grant fails with ERR_ASSET_CLASS_FORBIDDEN' },
] as const

export const BARTER_TOTAL = BARTER.reduce((sum, row) => sum + row.count, 0)

type Status = (typeof BARTER)[number]['key']

/** FE-051: every kind of the catalog, by class, as docs/barter-evidence.md "Table" lists it: row number, kind code, status.
 * Landing.test.tsx reads that table and fails when a code or a status here differs. */
export const KIND_CLASSES: readonly { key: string; name: string; kinds: readonly (readonly [string, string, Status])[] }[] = [
  {
    key: 'A',
    name: 'On-chain assets, moved by escrow',
    kinds: [
      ['1', 'nft:nep171', 'testnet'], ['2', 'ticket:event-nft', 'testnet'], ['3', 'game:item-nft', 'testnet'], ['4', 'coupon:voucher-nft', 'testnet'],
      ['5', 'license:software-nft', 'testnet'], ['6', 'token:nep141', 'testnet'], ['7', 'rwa:tokenized', 'testnet'], ['8', 'lst:liquid-staking', 'testnet'],
      ['9', 'intents:multi-token', 'testnet'], ['10', 'amm:lp-share', 'testnet'], ['11', 'near:named-account', 'testnet'], ['12', 'chain-signatures:derived-address', 'p1'],
      ['13', 'vesting:transferable-lockup', 'p1'], ['14', 'claim:cross-circle-receivable', 'testnet'],
    ],
  },
  {
    key: 'B',
    name: 'Limited access that can be revoked',
    kinds: [
      ['15', 'near-rpc:access', 'testnet'], ['16', 'dao:vote-delegation', 'unit'], ['17', 'saas:team-seat', 'mock'], ['18', 'git:repo-collaborator', 'mock'],
      ['19', 'oauth:scoped-token', 'mock'], ['20', 'cloud:temporary-role', 'mock'], ['21', 'storage:signed-url', 'roadmap'], ['22', 'ssh:restricted-key', 'mock'],
      ['23', 'database:readonly-user', 'mock'], ['24', 'community:paid-role', 'mock'], ['25', 'org:spend-limited-member', 'mock'],
    ],
  },
  {
    key: 'C',
    name: 'A single secret through the broker',
    kinds: [['26', 'api:delegated-key', 'mock'], ['27', 'giftcard:code', 'mock'], ['28', 'license:key', 'mock'], ['29', 'domain:transfer-code', 'mock'], ['30', 'api:quota-proxy', 'mock']],
  },
  {
    key: 'D',
    name: 'Own resources and services',
    kinds: [
      ['31', 'compute:cpu-idle', 'unit'], ['32', 'compute:gpu-hours', 'unit'], ['33', 'storage:capacity', 'unit'], ['34', 'cdn:static-cache', 'unit'],
      ['35', 'model:inference', 'unit'], ['36', 'model:fine-tuning', 'unit'], ['37', 'data:dataset', 'sandbox'], ['38', 'model:weights', 'generic'],
      ['39', 'agent:prompt-workflow', 'generic'], ['40', 'research:report', 'generic'], ['41', 'text:translation-summary', 'generic'], ['42', 'data:annotation', 'generic'],
      ['43', 'data:web-crawl', 'generic'], ['44', 'oracle:data-feed', 'unit'], ['45', 'iot:sensor-data', 'unit'], ['46', 'x207:keeper-cron', 'generic'],
      ['47', 'gas:relayer', 'unit'], ['48', 'x207:solver-routing', 'generic'], ['49', 'queue:priority-slot', 'unit'], ['50', 'ads:promo-slot', 'generic'],
      ['51', 'sales:referral-lead', 'generic'], ['52', 'code:audit-review', 'generic'], ['53', 'qa:load-test', 'generic'], ['54', 'ops:monitoring-alert', 'generic'],
      ['55', 'network:proxy-bandwidth', 'unit'],
    ],
  },
  {
    key: 'E',
    name: 'Off-chain digital assets of ordinary people',
    kinds: [
      ['61', 'ai-credit:api', 'mock'], ['62', 'cloud:credit', 'mock'], ['63', 'messaging:subaccount', 'mock'], ['64', 'maps:geocoding-quota', 'mock'],
      ['65', 'hosting:reseller-account', 'mock'], ['66', 'domain:name', 'mock'], ['67', 'site:web-property', 'mock'], ['68', 'design:template', 'sandbox'],
      ['69', 'creative:licensed-asset', 'sandbox'], ['70', 'plugin:preset', 'sandbox'], ['71', 'course:own-class', 'sandbox'], ['72', 'course:gift-code', 'mock'],
      ['73', 'ticket:digital-event', 'mock'], ['74', 'game:key-code', 'mock'], ['75', 'game:tradable-item', 'mock'], ['76', 'promo:voucher-code', 'mock'],
      ['77', 'giftcard:digital-store', 'mock'], ['78', 'telco:airtime-data', 'sandbox'], ['79', 'loyalty:transferable-points', 'sandbox'], ['80', 'plan:family-or-team-seat', 'sandbox'],
      ['81', 'storage:shared-folder', 'mock'], ['82', 'content:own-work', 'sandbox'], ['83', 'service:freelance', 'sandbox'], ['84', 'service:consultation-slot', 'sandbox'],
      ['85', 'community:own-paid-group', 'mock'], ['86', 'newsletter:own-archive', 'mock'], ['87', 'beta:invite-code', 'mock'], ['88', 'service:product-testing', 'sandbox'],
      ['89', 'data:own-anonymized', 'sandbox'], ['90', 'compute:home-device', 'mock'],
    ],
  },
  {
    key: 'X',
    name: 'Refused on purpose',
    kinds: [
      ['X1', 'payment:digital-wallet-balance', 'refused'], ['X2', 'account:game-or-platform', 'refused'], ['X3', 'voucher:identity-bound', 'refused'],
      ['X4', 'securities:equity', 'refused'], ['X5', 'subscription:consumer-nonshareable', 'refused'], ['X6', 'social:account', 'refused'],
      ['X7', 'pii:third-party-data', 'refused'], ['X8', 'token:soulbound', 'refused'], ['X9', 'credential:stolen-access', 'refused'],
    ],
  },
]
