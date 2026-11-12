import { useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { appraisalPath } from '../api/client'
import { useAppraisal } from '../api/queries'
import { API_URL } from '../config'
import { appraisalSteps, isListingAppraisal } from '../lib/appraisal'

// FE-111: a listing whose `detail` names a NEAR AI Cloud appraisal (backend BE-120) shows a badge with the appraised value, and a "proof" button that
// opens what was checked, step by step, with links to the raw JSON. The wording follows backend/README.md word for word: the signature is checked by
// x207 itself, the TDX quote and the GPU evidence only by third-party verifiers. Nothing here says more than that.

/** The claim, the same words as the backend README and the first note of every appraisal. */
export const APPRAISAL_CLAIM = 'Signature checked locally; quote checked via third-party verifiers (Phala, NVIDIA NRAS).'
export const APPRAISAL_LIMITS = 'Advice only: the parties of the barter still agree on the price. The x207 circle contract does not read this appraisal.'

export function AppraisalBadge({ appraisal }: { appraisal?: unknown }) {
  const [open, setOpen] = useState(false)
  if (!isListingAppraisal(appraisal)) return null
  const signed = appraisal.verified.signature
  return (
    <div className="appraisal" data-testid="appraisal-badge">
      <span className="badge appraisal-badge" data-tone={signed ? 'ok' : 'warn'}>
        Appraised on NEAR AI Cloud (TEE) · {signed ? 'signature checked' : 'signature not verified'}
      </span>
      <span className="asset-meta">
        Appraised at {appraisal.value_credits} credit (range {appraisal.range.low} to {appraisal.range.high})
      </span>
      <button type="button" className="appraisal-proof-open" aria-haspopup="dialog" aria-label={`Show the proof of appraisal ${appraisal.appraisal_id}`} onClick={() => setOpen(true)}>
        proof
      </button>
      {open && <AppraisalProof id={appraisal.appraisal_id} onClose={() => setOpen(false)} />}
    </div>
  )
}

function AppraisalProof({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useAppraisal(id)
  const v = query.data
  const appraisalUrl = `${API_URL}${appraisalPath(id)}`
  const evidenceUrl = `${API_URL}${appraisalPath(id, '/attestation')}`
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }
  // On <body>: inside the listing table the dialog would sit under the sticky top bar (the table is its own stacking context).
  return createPortal(
    <div className="appraisal-proof-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="appraisal-proof" role="dialog" aria-modal="true" aria-label="Appraisal proof" onKeyDown={onKeyDown}>
        <div className="appraisal-proof-head">
          <h3>Appraisal proof</h3>
          <button type="button" onClick={onClose} autoFocus>Close</button>
        </div>
        <p>{APPRAISAL_CLAIM}</p>
        {query.isPending && <p role="status">Loading the proof</p>}
        {query.isError && <p role="alert">The proof could not be loaded: {query.error.message}</p>}
        {v && (
          <>
            <dl className="appraisal-facts">
              <dt>Appraisal</dt><dd><code>{v.appraisal_id}</code></dd>
              <dt>Model</dt><dd><code>{v.model}</code></dd>
              <dt>Chat id</dt><dd><code>{v.evidence.chat_id ?? 'none'}</code></dd>
              <dt>Signing address</dt><dd><code>{v.evidence.signing_address ?? 'none'}</code></dd>
              {v.result && (
                <>
                  <dt>Value</dt>
                  <dd>{v.result.value_credits} credit (range {v.result.range.low} to {v.result.range.high}), confidence {v.result.confidence}</dd>
                </>
              )}
            </dl>
            <ol className="appraisal-checks" aria-label="Checks">
              {appraisalSteps(v).map((s) => (
                <li key={s.key} data-check={s.key} data-result={s.result}>
                  <span className="appraisal-result">{s.result}</span> <span>{s.label}</span>
                  {s.note && <span className="appraisal-note">{s.note}</span>}
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="appraisal-note">{APPRAISAL_LIMITS}</p>
        <ul className="appraisal-links">
          <li><a href={appraisalUrl} target="_blank" rel="noreferrer">Appraisal JSON (request and response bytes, signature)</a></li>
          <li><a href={evidenceUrl} target="_blank" rel="noreferrer">Raw attestation evidence (Intel TDX quote, NVIDIA GPU evidence)</a></li>
        </ul>
        <p className="appraisal-note">Re-check without x207: <code>node scripts/verify-appraisal.ts {appraisalUrl} --quote-check</code> (backend repository).</p>
      </div>
    </div>,
    document.body,
  )
}
