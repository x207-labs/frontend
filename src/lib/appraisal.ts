import type { AppraisalView, ListingAppraisal, ThirdPartyResult } from '../api/types'

// FE-111: reading a NEAR AI Cloud appraisal (backend BE-120; its first commits say BE-119). The wording follows backend/README.md: the signature is checked by x207 itself, the TDX quote
// and the GPU evidence only by third-party verifiers.

const APPRAISAL_ID = /^apr_[0-9a-f]{24}$/
const isText = (v: unknown): v is string => typeof v === 'string'

/** An older backend sends no `appraisal`; an odd one must not break the listing table, so anything not shaped like BE-120 shows no badge. */
export function isListingAppraisal(a: unknown): a is ListingAppraisal {
  if (typeof a !== 'object' || a === null) return false
  const x = a as Partial<ListingAppraisal>
  return (
    isText(x.appraisal_id) && APPRAISAL_ID.test(x.appraisal_id) && isText(x.model) && isText(x.value_credits) &&
    typeof x.range === 'object' && x.range !== null && isText(x.range.low) && isText(x.range.high) &&
    typeof x.verified === 'object' && x.verified !== null && typeof x.verified.signature === 'boolean'
  )
}

export type AppraisalStep = { key: 'signature' | 'binding' | 'tdx' | 'gpu'; label: string; result: 'pass' | 'fail' | 'skipped'; note?: string }
const thirdParty = (r: ThirdPartyResult): AppraisalStep['result'] => (r === 'passed' ? 'pass' : r === 'failed' ? 'fail' : 'skipped')
const reasons = (list: string[] | undefined) => (list && list.length > 0 ? list.join('; ') : undefined)

const LABEL = {
  signature: 'Signature over model, request hash and response hash (checked locally by x207)',
  binding: 'Key binding: the TDX report names the signing key and a fresh nonce (checked locally by x207)',
  tdx: 'Intel TDX quote (checked by a third party)',
  gpu: 'NVIDIA GPU evidence (checked by a third party)',
} as const

/** The four checks of BE-120, each on its own line, as `scripts/verify-appraisal.ts` reports them. Without an attestation report the last three are skipped. */
export function appraisalSteps(v: AppraisalView): AppraisalStep[] {
  const a = v.attestation
  const signature: AppraisalStep = { key: 'signature', label: LABEL.signature, result: v.verified.signature ? 'pass' : 'fail', note: reasons(v.verified.signature_reasons) }
  if (!a) {
    return [
      signature,
      { key: 'binding', label: LABEL.binding, result: 'skipped', note: 'no attestation report was fetched' },
      { key: 'tdx', label: LABEL.tdx, result: 'skipped' },
      { key: 'gpu', label: LABEL.gpu, result: 'skipped' },
    ]
  }
  const gpuNote = [a.gpu_evidence_checked_by ? `verifier: ${a.gpu_evidence_checked_by}` : null, 'x207 reads the NRAS result but does not check the token signature']
  return [
    signature,
    { key: 'binding', label: LABEL.binding, result: a.report_binding ? 'pass' : 'fail', note: reasons(a.binding_reasons) },
    { key: 'tdx', label: LABEL.tdx, result: thirdParty(a.tdx_quote), note: a.tdx_quote_checked_by ? `verifier: ${a.tdx_quote_checked_by}` : undefined },
    { key: 'gpu', label: LABEL.gpu, result: thirdParty(a.gpu_evidence), note: gpuNote.filter(Boolean).join('; ') },
  ]
}
