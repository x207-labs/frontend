import type { IconName } from './icons'

// FE-051: kept apart from icons.tsx, so that file exports only components.

/** The icon of a barter kind, by the prefix of its code in docs/barter-evidence.md (`nft:nep171` → frame). */
const BY_PREFIX: Record<string, IconName> = {
  nft: 'frame', ticket: 'frame', game: 'frame', coupon: 'frame', creative: 'frame', design: 'frame', content: 'frame', plugin: 'frame',
  token: 'coin', rwa: 'coin', lst: 'coin', intents: 'coin', amm: 'coin', 'ai-credit': 'coin', loyalty: 'coin', giftcard: 'coin', payment: 'coin', promo: 'coin', securities: 'coin',
  near: 'account', 'chain-signatures': 'account', account: 'account', social: 'account', community: 'account', org: 'account', saas: 'account', plan: 'account', 'git': 'branch',
  vesting: 'lock', claim: 'lock', voucher: 'lock',
  api: 'key', oauth: 'key', ssh: 'key', license: 'key', domain: 'key', beta: 'key', credential: 'key',
  'near-rpc': 'server', cloud: 'server', hosting: 'server', database: 'server', cdn: 'server', site: 'server', network: 'server',
  compute: 'chip', gas: 'chip', queue: 'chip',
  data: 'dataset', storage: 'dataset', oracle: 'dataset', iot: 'dataset', pii: 'dataset',
  model: 'weights', agent: 'weights',
  research: 'doc', text: 'doc', newsletter: 'doc', course: 'doc', subscription: 'doc',
  x207: 'cog', ops: 'cog', qa: 'cog', code: 'code', dao: 'hub',
  ads: 'megaphone', sales: 'megaphone',
  service: 'clock',
  telco: 'phone', messaging: 'phone', maps: 'phone',
}

export function kindIcon(code: string): IconName {
  return BY_PREFIX[code.split(':')[0]] ?? 'coin'
}
