// A small line icon for each family of barter kinds, picked by the part of the kind code before the colon (nft:nep171 → nft). 12-unit box, drawn with a 1.2 stroke.
const P = {
  token: 'M6 1.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM6 3.6v4.8M4.4 4.8h2.4a1.2 1.2 0 0 1 0 2.4H4.6',
  nft: 'M2 2h8v8H2zM2 7.5l2.4-2.4 2.2 2.2L8 6l2 2',
  ticket: 'M1.5 3.5h9v1.6a1 1 0 0 0 0 1.8v1.6h-9V6.9a1 1 0 0 0 0-1.8zM7 3.5v5',
  key: 'M4.2 7.8a2.3 2.3 0 1 1 1.6-1.6L10 2M8.4 3.6l1.2 1.2',
  account: 'M6 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM2.2 10.5a3.8 3.8 0 0 1 7.6 0',
  cloud: 'M3.5 9.5h5a2 2 0 0 0 .3-4A2.8 2.8 0 0 0 3.4 5a2.2 2.2 0 0 0 .1 4.5Z',
  chip: 'M3 3h6v6H3zM5 1.5V3M7 1.5V3M5 9v1.5M7 9v1.5M1.5 5H3M1.5 7H3M9 5h1.5M9 7h1.5',
  data: 'M6 1.8c2.5 0 4 .7 4 1.5v5.4c0 .8-1.5 1.5-4 1.5s-4-.7-4-1.5V3.3c0-.8 1.5-1.5 4-1.5ZM2 3.3c0 .8 1.5 1.5 4 1.5s4-.7 4-1.5M2 6c0 .8 1.5 1.5 4 1.5S10 6.8 10 6',
  doc: 'M3 1.5h4l2 2v7H3zM7 1.5v2h2M4.5 6h3M4.5 8h3',
  link: 'M5.2 6.8 6.8 5.2M4.6 5.4 3.4 6.6a1.8 1.8 0 0 0 2.6 2.6l1.2-1.2M7.4 6.6l1.2-1.2a1.8 1.8 0 0 0-2.6-2.6L4.8 4',
  people: 'M4.2 5.6a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4ZM8.4 5.6a1.4 1.4 0 1 0 0-2.8M1.5 10a2.7 2.7 0 0 1 5.4 0M8 7.6a2.4 2.4 0 0 1 2.5 2.4',
  gift: 'M2 5h8v5.5H2zM1.5 3.5h9V5h-9zM6 3.5v7M6 3.5C5 1.5 3.4 1.8 3.8 3.5M6 3.5c1-2 2.6-1.7 2.2 0',
  bolt: 'M6.6 1.5 3 6.6h2.6l-.4 3.9L9 5.4H6.3z',
  shield: 'M6 1.5 9.5 3v3c0 2.2-1.5 3.7-3.5 4.5C4 9.7 2.5 8.2 2.5 6V3z',
  ban: 'M6 1.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM2.8 2.8l6.4 6.4',
}

const FAMILY: Record<string, keyof typeof P> = {
  token: 'token', rwa: 'token', lst: 'token', intents: 'token', amm: 'token', loyalty: 'token', payment: 'token', securities: 'token', vesting: 'token', claim: 'token', gas: 'token',
  nft: 'nft', game: 'nft', design: 'nft', creative: 'nft', plugin: 'nft', content: 'nft', model: 'nft',
  ticket: 'ticket', coupon: 'ticket', promo: 'ticket', voucher: 'ticket', giftcard: 'gift', course: 'ticket', beta: 'ticket',
  license: 'key', api: 'key', ssh: 'key', oauth: 'key', credential: 'key', 'chain-signatures': 'key',
  near: 'account', account: 'account', social: 'account', org: 'account', git: 'account', saas: 'account', plan: 'account', subscription: 'account', pii: 'account',
  cloud: 'cloud', hosting: 'cloud', storage: 'cloud', cdn: 'cloud', 'near-rpc': 'cloud', site: 'cloud', domain: 'link', network: 'link', messaging: 'link', maps: 'link', telco: 'link',
  compute: 'chip', iot: 'chip', queue: 'chip',
  data: 'data', database: 'data', oracle: 'data',
  research: 'doc', text: 'doc', newsletter: 'doc', ads: 'doc', sales: 'doc',
  community: 'people', dao: 'people', service: 'people',
  agent: 'bolt', x207: 'bolt', ops: 'bolt', qa: 'shield', code: 'shield',
}

/** The icon of a kind code; refused kinds always get the struck circle. */
export function KindIcon({ code, refused }: { code: string; refused?: boolean }) {
  const d = P[refused ? 'ban' : (FAMILY[code.split(':')[0]] ?? 'doc')]
  return (
    <svg className="kind-ic" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
