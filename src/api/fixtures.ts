// Data contoh dari Spec API Backend (FX-08). Dipakai test dan mode tanpa backend.
const amounts = { unit: 'credit', decimals: 6 }
const circle = 'agents-main'
const near = (name: string) => `${name}.x207-circle.near`

const member = (name: string, stake: string, limit: string, debt: string, headroom: string, settled = '0') => ({
  account: near(name),
  status: 'active',
  stake,
  limit,
  outstandingDebt: debt,
  headroom,
  termsHash: '4f2c…9a1e',
  pubkeyVoucher: 'ed25519:8hYk…',
  settledHistory: settled,
  joinedAt: '2026-11-03T08:12:44Z',
  exitRequestedEpoch: null,
})

export const members = [
  member('cleaner', '50000000', '50000000', '10000000', '40000000'),
  member('gpu', '50000000', '50000000', '0', '50000000', '12000000'),
  member('image', '50000000', '50000000', '0', '50000000'),
  member('scraper', '50000000', '50000000', '12500000', '37500000', '35000000'),
  member('summarizer', '50000000', '50000000', '0', '50000000'),
  member('translator', '50000000', '50000000', '0', '50000000'),
]

export const limitHistory = {
  items: [
    { epoch: 42, oldLimit: '50000000', newLimit: '50000000', status: 'active', reason: 'epoch_update', blockHeight: 171234100 },
    { epoch: 41, oldLimit: '40000000', newLimit: '50000000', status: 'active', reason: 'cash_settlement', blockHeight: 171230010 },
    { epoch: null, oldLimit: '0', newLimit: '40000000', status: 'active', reason: 'stake', blockHeight: 171200001 },
  ],
  nextCursor: null,
}

const nsAt = (iso: string) => (BigInt(Date.parse(iso)) * 1_000_000n).toString()
export const grants = [
  { grantId: 1, assetType: 'near-rpc:access', grantor: near('scraper'), grantee: near('translator'), class: 'B', unit: 'day', unitPrice: '50000', expiresAt: nsAt('2026-12-01T00:00:00Z'), deliveryPubkey: 'ed25519:7iLjnTRLXo6xnVvb2wh5ckpNjYu8gxVv3TTzGd2K4q4d', status: 'revoked', revokeReason: 'defaulted', changedBlock: 171234500 },
  { grantId: 2, assetType: 'near-rpc:access', grantor: near('scraper'), grantee: near('gpu'), class: 'B', unit: 'day', unitPrice: '50000', expiresAt: nsAt('2026-12-15T00:00:00Z'), deliveryPubkey: 'ed25519:9hSR6S7WPtxmTojgo6GG3k4yDPecgJY292j7xrsUGWBu', status: 'active', revokeReason: null, changedBlock: 171234510 },
  { grantId: 3, assetType: 'x402:endpoint', grantor: near('summarizer'), grantee: near('translator'), class: 'D', unit: 'call', unitPrice: '20000', expiresAt: nsAt('2026-11-05T00:00:00Z'), deliveryPubkey: null, status: 'expired', revokeReason: 'expired', changedBlock: 171234520 },
  { grantId: 4, assetType: 'near-rpc:access', grantor: near('translator'), grantee: null, class: 'B', unit: 'day', unitPrice: '40000', expiresAt: nsAt('2026-12-20T00:00:00Z'), deliveryPubkey: null, status: 'offered', revokeReason: null, changedBlock: 171234530 },
]

export const daoProposals = {
  circle,
  dao: 'x207.sputnik-dao.near',
  items: [
    {
      id: 7, status: 'InProgress', proposer: 'council1.near', description: 'Raise payment_window to 45 minutes', method: 'set_params',
      params: { payment_window: 2700 }, submittedAt: '2026-11-09T10:00:00Z', votes: { council: [1, 0, 0] },
    },
    {
      id: 5, status: 'Approved', proposer: 'council2.near', description: 'Lift limit_cap', method: 'set_params',
      params: { limit_cap: '1000000000' }, submittedAt: '2026-11-08T09:00:00Z', votes: { council: [2, 0, 0] },
    },
  ],
  nextCursor: null,
}

export const epochs = [
  { epoch: 42, phase: 'payment_window', proposalDeadline: '2026-11-09T11:10:00Z' },
  { epoch: 41, phase: 'finalized', proposalDeadline: '2026-11-09T10:10:00Z' },
  { epoch: 40, phase: 'finalized', proposalDeadline: '2026-11-09T09:10:00Z' },
]

export const report42 = {
  circle,
  network: `x207:${circle}`,
  epoch: 42,
  phase: 'payment_window',
  committed: true,
  finalized: false,
  ...amounts,
  totalObligation: '2563380000',
  cleared: '1820000000',
  clearedRatio: 0.71,
  committedAt: '2026-11-09T11:30:00Z',
  paymentDeadline: '2026-11-09T12:00:00Z',
  members: [
    { account: near('translator'), status: 200, net: '0', cleared: '310000000', settlement: null, haircut: '0' },
    { account: near('summarizer'), status: 200, net: '0', cleared: '402740000', settlement: null, haircut: '0' },
    { account: near('image'), status: 200, net: '0', cleared: '288000000', settlement: null, haircut: '0' },
    { account: near('scraper'), status: 402, net: '-35000000', cleared: '296260000', settlement: 'due', amount: '35000000', due: '2026-11-09T12:00:00Z', haircut: '0' },
    { account: near('cleaner'), status: 402, net: '-10000000', cleared: '148000000', settlement: 'due', amount: '10000000', due: '2026-11-09T12:00:00Z', haircut: '0' },
    { account: near('gpu'), status: 202, net: '+45000000', cleared: '375000000', settlement: 'claimable', amount: '45000000', claimable: false, haircut: '0' },
  ],
}

export const metrics: Record<number, object> = {
  42: {
    circle, epoch: 42, phase: 'payment_window', ...amounts,
    totalVoucherValue: '2563380000', cleared: '1820000000', clearedRatio: 0.71,
    voucherCount: 512, residualTransfers: 3, transferSavings: 170.6667,
    debtBefore: '2563380000', debtAfter: '743380000', debtReduction: 0.71, netDebt: '45000000',
    defaultRate: null, clearingTimeSeconds: 604,
    graph: { participants: 6, edges: 14, density: 0.4667 },
  },
  41: {
    circle, epoch: 41, phase: 'finalized', ...amounts,
    totalVoucherValue: '1204000000', cleared: '602000000', clearedRatio: 0.5,
    voucherCount: 240, residualTransfers: 4, transferSavings: 60,
    debtBefore: '1204000000', debtAfter: '602000000', debtReduction: 0.5, netDebt: '38000000',
    defaultRate: 0, clearingTimeSeconds: 571,
    graph: { participants: 6, edges: 9, density: 0.3 },
  },
  40: {
    circle, epoch: 40, phase: 'finalized', ...amounts,
    totalVoucherValue: '640000000', cleared: '128000000', clearedRatio: 0.2,
    voucherCount: 96, residualTransfers: 5, transferSavings: 19.2,
    debtBefore: '640000000', debtAfter: '512000000', debtReduction: 0.2, netDebt: '51000000',
    defaultRate: 0.0784, clearingTimeSeconds: 588,
    graph: { participants: 6, edges: 5, density: 0.1667 },
  },
}

export const obligations = (epoch: number, stage: string) => ({
  circle, epoch, phase: 'payment_window', stage, ...amounts,
  edgeCount: 2,
  totalObligation: '412740000',
  edges: [
    { debtor: near('translator'), creditor: near('summarizer'), amount: '2740000', seq: 137, cleared: stage === 'live' ? null : '2740000', remaining: stage === 'live' ? null : '0' },
    { debtor: near('scraper'), creditor: near('gpu'), amount: '410000000', seq: 96, cleared: stage === 'live' ? null : '375000000', remaining: stage === 'live' ? null : '35000000' },
  ],
})

export const epochSettlements42 = {
  ...amounts,
  items: [
    { epoch: 42, phase: 'payment_window', account: near('cleaner'), role: 'debtor', net: '-10000000', amount: '10000000', status: 'due', due: '2026-11-09T12:00:00Z', paidAmount: '0', stakeSlashed: '0', haircut: '0' },
    { epoch: 42, phase: 'payment_window', account: near('gpu'), role: 'creditor', net: '+45000000', amount: '45000000', status: 'claimable', claimableNow: false, destination: null, txHash: null },
    { epoch: 42, phase: 'payment_window', account: near('scraper'), role: 'debtor', net: '-35000000', amount: '35000000', status: 'due', due: '2026-11-09T12:00:00Z', paidAmount: '0', stakeSlashed: '0', haircut: '0' },
  ],
  nextCursor: null,
}

export const params = {
  circle,
  currentEpoch: 42,
  active: {
    epoch_length: 3600, payment_window: 1800, proposal_window: 600,
    base_limit_ratio: 8000, limit_growth: 1000, limit_cap: '1000000000',
    limit_decay: 0, fees: { clearing_fee_bps: 0, solver_fee_bps: 0 }, admission: 'open',
  },
  nextEpoch: { payment_window: 2700 },
  nextEpochEffective: 43,
}

export const paramsHistory = {
  items: [
    { field: 'payment_window', oldValue: 1800, newValue: 2700, effectiveEpoch: 43, blockHeight: 171234001 },
    { field: 'limit_cap', oldValue: '500000000', newValue: '1000000000', effectiveEpoch: 12, blockHeight: 171100220 },
  ],
  nextCursor: null,
}

// Marketplace F9 (backend/src/marketplace). Hash dan tanda tangan berupa contoh, bukan hasil hitung.
export const listingHashA = '2f4f3bc3a4c63f350a33dc0e8bdbd90cdfe5a6b03767cad4fb214f006e6f6c5e'
export const listings = [
  {
    listingHash: listingHashA,
    account: near('translator'),
    offer: { assetType: 'translate-calls', assetClass: 'D', quantity: 5000, value: '100000000' },
    want: { assetType: 'summarize-calls', assetClass: 'D', quantity: 5000, value: '100000000' },
    terms: 'delivery within 7 days',
    detail: '5000 translation calls, any language pair',
    expiresAt: '2026-11-12T10:00:00Z',
    discountBps: 1000,
    acceptPayment: true,
    discoverable: true,
    nonce: 'l1',
    signature: 'ed25519:4pdj…',
    status: 'open',
  },
  {
    listingHash: 'b'.repeat(64),
    account: near('gpu'),
    offer: { assetType: 'gpu-hours', assetClass: 'A', quantity: 10, value: '250000000' },
    want: { assetType: 'dataset', assetClass: 'C', quantity: 1, value: '250000000' },
    terms: 'escrow on delivery',
    detail: 'A100 80GB',
    expiresAt: '2026-11-13T10:00:00Z',
    discountBps: 0,
    acceptPayment: false,
    discoverable: false,
    nonce: 'l2',
    signature: 'ed25519:5kRv…',
    status: 'open',
  },
]
export const marketStats = {
  listings: { open: 2, matched: 1, cancelled: 0, expired: 0, total: 3 },
  matches: { count: 1, payment: 0, bundle: 1, pay: 0, barter: 1, listingValue: '100000000', discountValue: '10000000' },
  timeToMatchSeconds: { samples: 1, min: 90, max: 90, average: 90, median: 90 },
  searcherRevenue: { total: '3000000', matchesWithSearcher: 1, bySearcher: [{ account: near('scraper'), total: '3000000' }] },
  offersPending: 0,
}

export type FixtureReply = { status: number; body: unknown; delayMs?: number }

const notFound = (code: string, message: string): FixtureReply => ({
  status: 404,
  body: { error: { code, message } },
})
const ok = (body: unknown): FixtureReply => ({ status: 200, body })

/** Jawaban RPC NEAR `call_function` untuk satu nilai JSON (bytes hasil view), untuk test dan mode tanpa jaringan. */
export const rpcResult = (value: unknown): FixtureReply => ({
  status: 200,
  body: { jsonrpc: '2.0', id: 'x207', result: { result: Array.from(new TextEncoder().encode(JSON.stringify(value))), logs: [], block_height: 1 } },
})

/** View kontrak bawaan: tidak ada saldo Intents, satu pasangan epoch masih tersimpan. */
export function chainFixture(methodName: string): FixtureReply {
  switch (methodName) {
    case 'intents_balance':
      return rpcResult('0')
    case 'list_obligations':
      return rpcResult([{ debtor: near('scraper'), creditor: near('gpu') }])
    default:
      return { status: 200, body: { jsonrpc: '2.0', id: 'x207', error: { cause: { name: 'UNKNOWN_METHOD' } } } }
  }
}
const emptyList = { ...amounts, items: [], nextCursor: null }

export function fixtureReply(path: string): FixtureReply {
  const url = new URL(path, 'http://fixture')
  const prefix = `/x207/circles/${circle}`
  if (!url.pathname.startsWith(prefix)) return notFound('circle_not_found', 'Lingkaran tidak ada')
  const rest = url.pathname.slice(prefix.length)

  if (rest === '/epochs') return ok({ ...amounts, items: epochs, nextCursor: null })
  if (rest === '/members') return ok({ circle, ...amounts, items: members, nextCursor: null })
  if (rest === '/params') return ok(params)
  if (rest === '/params/history') return ok(paramsHistory)
  if (rest === '/proposals') return ok(daoProposals)
  if (rest === '/grants') {
    const grantee = url.searchParams.get('grantee')
    const grantor = url.searchParams.get('grantor')
    const status = url.searchParams.get('status')
    const items = grants.filter((g) => (!grantee || g.grantee === grantee) && (!grantor || g.grantor === grantor) && (!status || g.status === status))
    return ok({ circle, ...amounts, items, nextCursor: null })
  }
  const limits = rest.match(/^\/members\/([^/]+)\/limits$/)
  if (limits) {
    return members.some((m) => m.account === decodeURIComponent(limits[1]))
      ? ok({ ...amounts, ...limitHistory })
      : notFound('member_not_found', 'Akun belum terdaftar di lingkaran')
  }

  if (rest === '/invoices') {
    const party = url.searchParams.get('party')
    const status = url.searchParams.get('status')
    const items = invoices.filter((i) => (!party || i.document.issuer === party || i.document.debtor === party) && (!status || i.status === status))
    return ok({ items, nextCursor: null })
  }
  const invoiceOne = rest.match(/^\/invoices\/([0-9a-f]{64})$/)
  if (invoiceOne) {
    const found = invoices.find((i) => i.invoice_hash === invoiceOne[1])
    return found ? ok(found) : notFound('invoice_not_found', 'Invoice tidak ada')
  }
  if (rest === '/orders') {
    const party = url.searchParams.get('party')
    const status = url.searchParams.get('status')
    const items = orders.filter((o) => (!party || o.order.buyer === party || o.order.seller === party) && (!status || o.status === status))
    return ok({ items, nextCursor: null })
  }
  const orderOne = rest.match(/^\/orders\/([0-9a-f]{64})$/)
  if (orderOne) {
    const found = orders.find((o) => o.order_hash === orderOne[1])
    return found ? ok(found) : notFound('order_not_found', 'Pesanan tidak ada')
  }
  const orderProofs = rest.match(/^\/orders\/([0-9a-f]{64})\/onchain-proofs$/)
  if (orderProofs) return ok({ items: [{ tx_hash: 'AbC1', method: 'close_epoch', signer: near('keeper') }, { tx_hash: 'AbC2', method: 'close_epoch', signer: near('keeper') }] })
  if (rest === '/intents') return ok({ items: [], nextCursor: null })
  if (rest === '/intents/hashes') return ok({ circle, items: [], nextCursor: null })
  if (rest === '/intents/withdrawals') return ok({ circle, ...amounts, totalWithdrawn: '0', withdrawals: 0, items: [], nextCursor: null })
  if (rest === '/marketplace/stats') return ok(marketStats)
  if (rest === '/listings') {
    const status = url.searchParams.get('status') ?? 'open'
    const offerType = url.searchParams.get('offerType')
    const items = listings.filter((l) => (status === 'all' || l.status === status) && (!offerType || l.offer.assetType === offerType))
    return ok({ items, nextCursor: null })
  }
  const listingOffers = rest.match(/^\/listings\/([0-9a-f]{64})\/offers$/)
  if (listingOffers) return ok({ items: [] })
  if (rest.startsWith('/bundle-proposals')) return ok({ items: [] })

  const account = rest.match(/^\/members\/([^/]+)(\/settlements)?$/)
  if (account) {
    const found = members.find((m) => m.account === decodeURIComponent(account[1]))
    if (!found) return notFound('member_not_found', 'Akun belum terdaftar di lingkaran')
    if (!account[2]) return ok({ circle, ...amounts, ...found })
    const items = epochSettlements42.items.filter((i) => i.account === found.account)
    return ok({ ...amounts, items, nextCursor: null })
  }

  const epoch = rest.match(/^\/epochs\/(\d+)(?:\/(\w+))?$/)
  if (epoch) {
    const n = Number(epoch[1])
    if (!epochs.some((e) => e.epoch === n)) {
      return notFound('epoch_not_found', `Epoch ${n} belum ada di D9`)
    }
    const status = url.searchParams.get('status')
    switch (epoch[2]) {
      case undefined:
        return { status: 207, body: { ...report42, epoch: n } }
      case 'metrics':
        return ok(metrics[n])
      case 'obligations':
        return ok(obligations(n, url.searchParams.get('stage') ?? 'cutoff'))
      case 'settlements':
        if (n !== 42) return ok(emptyList)
        return ok({
          ...epochSettlements42,
          items: epochSettlements42.items.filter((i) => !status || i.status === status),
        })
    }
  }
  return notFound('not_found', `Tidak ada data contoh untuk ${path}`)
}

function safeJson(text: string): { params?: unknown } | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function fixtureFetch(overrides: (path: string, init?: RequestInit) => FixtureReply | undefined = () => undefined) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input))
    const path = url.pathname + url.search
    // RPC NEAR (view kontrak): jalur '/' dengan body JSON-RPC; test menimpa lewat `overrides` dan membaca init.body
    const rpcParams = init?.method === 'POST' && init.body !== undefined ? (safeJson(String(init.body))?.params as { request_type?: string; method_name?: string } | undefined) : undefined
    const rpc = rpcParams?.request_type === 'call_function'
    const reply = overrides(path, init) ?? (rpc ? chainFixture(rpcParams!.method_name ?? '') : fixtureReply(path))
    if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs))
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// Invoice (FE-025): bentuk dari Spec API Backend 5e, snake_case seperti di spec. Hash dihitung dari dokumennya (sha256 JSON kanonik SD-065).
export const invoiceDocs = [
  { id: 'INV-2026-001', issuer: near('supplier'), debtor: near('maker'), amount: '100000000', memo: 'components, October batch' },
  { id: 'INV-2026-002', issuer: near('retailer'), debtor: near('supplier'), amount: '90000000', memo: 'storefront ads, three installments' },
]
export const invoiceHashes = [
  '79639b91e4fdc4abe16d4e378cf0b7b6022a299bf01d68b7382b1d72ccf50230',
  '45c165d8f55a5750f5f43ee2bda473ca13102479bc8d2e42a1628417b4f1ccc7',
]
export const invoices = [
  { invoice_hash: invoiceHashes[0], document: invoiceDocs[0], status: 'requested', needs_bond: false, installments: [{ index: 1, epoch: 44, amount: '100000000', status: 'scheduled', reason: null, voucherEpoch: 44, shifted: false }] },
  {
    invoice_hash: invoiceHashes[1], document: invoiceDocs[1], status: 'approved', needs_bond: true,
    installments: [
      { index: 1, epoch: 44, amount: '30000000', status: 'registered', reason: null, voucherEpoch: 44, shifted: false },
      { index: 2, epoch: 45, amount: '30000000', status: 'scheduled', reason: 'headroom', voucherEpoch: 45, shifted: false },
      { index: 3, epoch: 46, amount: '30000000', status: 'scheduled', reason: null, voucherEpoch: 46, shifted: false },
    ],
  },
]

// Pesanan jasa (FE-027): bentuk dari Spec API Backend 5f, snake_case seperti di spec. Hash dihitung dari dokumennya (sha256 JSON kanonik SD-069).
const H = (c: string) => c.repeat(64)
const orderBase = { circle: 'x207-circle.testnet', buyer: near('research'), nonce: 'o1' }
export const orderDocs = {
  research: { ...orderBase, kind: 'research', seller: near('audit'), spec_hash: H('a'), sample_hash: null, target: null, proof: null,
    milestones: [{ amount: '40000000', due_at: 1793100000 }, { amount: '60000000', due_at: 1793186400 }] },
  prompt: { ...orderBase, kind: 'prompt', seller: near('audit'), spec_hash: H('b'), sample_hash: H('c'), target: null, proof: null, nonce: 'o2', milestones: [{ amount: '20000000', due_at: 1793100000 }] },
  keeper: { ...orderBase, kind: 'keeper', seller: near('keeper'), spec_hash: H('d'), sample_hash: null, target: null, proof: { method: 'close_epoch', amount_per_tx: '250000' }, nonce: 'o3', milestones: [{ amount: '1000000', due_at: 1793100000 }] },
  loadtest: { ...orderBase, kind: 'loadtest', seller: near('audit'), spec_hash: H('e'), sample_hash: null, target: 'shop.example.com', proof: null, nonce: 'o4', milestones: [{ amount: '150000000', due_at: 1793100000 }] },
}
export const orderHashes = {
  research: 'e64978825412efbc22176af4b1e6b7f1f3f3f936814706b1ecb596be61c6c387',
  prompt: '204dd9cb3cf7bd5b0dabc428327d6baac417c971787a975bb5417df908312373',
  keeper: 'f7fa1558eb171491c01d277adac2f19019056d14759adfa200581893ca83ff69',
  loadtest: '225863819e31a47e24d72a1cc5de4ac91343ba15897418d541c29d35fc6bca27',
}
export const orders = [
  { order_hash: orderHashes.research, order: orderDocs.research, status: 'active', needs_bond: false, target_verified: null,
    milestones: [
      { index: 1, amount: '40000000', due_at: 1793100000, status: 'delivered', deliverable_hash: H('f'), at: 1793090000 },
      { index: 2, amount: '60000000', due_at: 1793186400, status: 'open', deliverable_hash: null, at: null },
    ] },
  { order_hash: orderHashes.prompt, order: orderDocs.prompt, status: 'active', needs_bond: false, target_verified: null, milestones: [{ index: 1, amount: '20000000', due_at: 1793100000, status: 'open', deliverable_hash: null, at: null }] },
  { order_hash: orderHashes.keeper, order: orderDocs.keeper, status: 'active', needs_bond: false, target_verified: null, milestones: [{ index: 1, amount: '1000000', due_at: 1793100000, status: 'open', deliverable_hash: null, at: null }] },
  { order_hash: orderHashes.loadtest, order: orderDocs.loadtest, status: 'pending', needs_bond: true, target_verified: false, milestones: [{ index: 1, amount: '150000000', due_at: 1793100000, status: 'open', deliverable_hash: null, at: null }] },
]
