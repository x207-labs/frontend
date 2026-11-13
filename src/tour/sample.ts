// FE-121: recorded data the tour shows when the page it zooms on has nothing to show (sample data, no appraisal on any listing, no wallet). Every value
// is copied from testnet records, never made up: the appraisal `apr_d2e83a701cbcbed1309a46fa` as the read API of circle v018 served it on 2026-11-12,
// and epoch 184 of circle agents-main on `x207-v018.testnet` (agents repo, docs/demo-barter-cycle.md). The tour always says where a sample comes from.

import type { AppraisalView, ListingAppraisal } from '../api/types'

export const SAMPLE_SOURCE = 'Recorded on testnet: circle agents-main on x207-v018.testnet, epoch 184.'

export const SAMPLE_APPRAISAL_ID = 'apr_d2e83a701cbcbed1309a46fa'

/** The asset of the appraisal: bob's JetBrains seat, sold to alice on the first leg of the ring. */
export const SAMPLE_ASSET = { assetType: 'license:software-nft', provider: 'JetBrains', scope: 'One transferable 12-month seat of a developer tool license, held as an NFT' }

/** The short form a listing carries, as `AppraisalBadge` reads it. */
export const SAMPLE_LISTING_APPRAISAL: ListingAppraisal = {
  appraisal_id: SAMPLE_APPRAISAL_ID,
  model: 'Qwen/Qwen3.6-35B-A3B-FP8',
  value_credits: '32',
  range: { low: '30', high: '34' },
  confidence: 0.9,
  flags: ['market_price_used'],
  verified: { signature: true, attestation: 'checked' },
  rubric_hash: 'f6e0959d918bd52e36dd1709e5e4f636ccd114ea52dff3c6c933ca9e3d87941d',
  url: `/x207/appraisals/${SAMPLE_APPRAISAL_ID}`,
}

/** `GET /x207/appraisals/apr_d2e83a701cbcbed1309a46fa`, the fields the proof dialog shows; seeded into the query cache so the proof opens offline. */
export const SAMPLE_APPRAISAL: AppraisalView = {
  appraisal_id: SAMPLE_APPRAISAL_ID,
  status: 'done',
  model: 'Qwen/Qwen3.6-35B-A3B-FP8',
  created_at: '2026-11-12T17:07:04Z',
  result: {
    value_credits: '32',
    range: { low: '30', high: '34' },
    confidence: 0.9,
    rationale:
      'Market price provided for JetBrains 12-month seat. Scope is clear (1 seat, 1 year). Transferability risk is low as it is a standard seat license, though vendor terms apply. No significant scope adjustments needed.',
    flags: ['market_price_used'],
  },
  rubric: { version: 'x207-appraiser-rubric-v1', hash: 'f6e0959d918bd52e36dd1709e5e4f636ccd114ea52dff3c6c933ca9e3d87941d' },
  evidence: {
    chat_id: '7b152a141fd64f18894c6d4a44b7c05b',
    signing_address: '0xfdbd7952498b333206f360d71d97a1e0961e8ddf',
    signing_algo: 'ecdsa',
    attestation_evidence: `/x207/appraisals/${SAMPLE_APPRAISAL_ID}/attestation`,
  },
  attestation: {
    fetched_at: '2026-11-12T17:07:06.215Z',
    report_binding: true,
    binding_reasons: [],
    tdx_quote: 'passed',
    tdx_quote_checked_by: 'cloud-api.phala.network',
    gpu_evidence: 'passed',
    gpu_evidence_checked_by: 'nras.attestation.nvidia.com',
    compose_hash: 'e8416a02d6f7ce47baaa52e3925b934fd30834b04fc9086b363db9b1d12c729d',
  },
  verified: { signature: true, signature_reasons: [], attestation: 'checked' },
  notes: [
    'Signature checked locally; quote checked via third-party verifiers (Phala, NVIDIA NRAS).',
    'Advice only: the parties of the barter still agree on the price.',
    'The x207 circle contract does not read this appraisal.',
  ],
}

/** One leg of the ring: `from` owes `to` for the asset `to` delivered. */
export type Leg = { from: string; to: string; amount: number; asset: string }

/** Epoch 184: three agents, three trades, one ring. 1 credit settles as 1 (mock) USDT. */
export const RING = {
  epoch: 184,
  legs: [
    { from: 'alice', to: 'bob', amount: 32, asset: 'JetBrains seat (license:software-nft)' },
    { from: 'bob', to: 'dan2', amount: 25, asset: 'NEAR RPC access (near-rpc:access)' },
    { from: 'dan2', to: 'alice', amount: 24, asset: 'Geocoding quota (maps:geocoding-quota)' },
  ] satisfies Leg[],
  cancelledPerLeg: 24,
  gross: 81,
  cleared: 72,
  clearedPct: '88.9%',
  /** Positive: receives; negative: pays. */
  net: [
    { member: 'alice', amount: -8 },
    { member: 'bob', amount: 7 },
    { member: 'dan2', amount: 1 },
  ],
  moved: 8,
  movedPct: '9.9%',
}
