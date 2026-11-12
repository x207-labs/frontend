import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { listings } from '../api/fixtures'
import type { AppraisalView, ListingAppraisal } from '../api/types'
import { APPRAISAL_CLAIM } from '../components/AppraisalBadge'
import { appraisalSteps } from '../lib/appraisal'
import { apiError, renderApp, type Override } from '../test/render'

// FE-111: the appraisal badge of a listing (backend BE-120). The values are those of a real appraisal of 2026-11-12 (apr_6edab5eac2b78e65d41ea3b2).
const ID = 'apr_6edab5eac2b78e65d41ea3b2'
const brief: ListingAppraisal = {
  appraisal_id: ID,
  model: 'Qwen/Qwen3.6-35B-A3B-FP8',
  value_credits: '60',
  range: { low: '45', high: '70' },
  confidence: 0.7,
  flags: [],
  verified: { signature: true, attestation: 'checked' },
  rubric_hash: 'a'.repeat(64),
  url: `/x207/appraisals/${ID}`,
}
const detail: AppraisalView = {
  appraisal_id: ID,
  status: 'done',
  model: 'Qwen/Qwen3.6-35B-A3B-FP8',
  created_at: '2026-11-12T09:05:00.000Z',
  result: { value_credits: '60', range: { low: '45', high: '70' }, confidence: 0.7, rationale: 'quota of a summarize service', flags: [] },
  rubric: { version: 'x207-appraisal-v1', hash: 'a'.repeat(64) },
  evidence: { chat_id: '0b830c23184b4fe19b913348a0adb25b', signing_address: '0xfdbd7952498b333206f360d71d97a1e0961e8ddf', signing_algo: 'ecdsa', attestation_evidence: `/x207/appraisals/${ID}/attestation` },
  attestation: {
    fetched_at: '2026-11-12T09:05:04.000Z',
    report_binding: true,
    binding_reasons: [],
    tdx_quote: 'passed',
    tdx_quote_checked_by: 'cloud-api.phala.network',
    gpu_evidence: 'not_checked',
    gpu_evidence_checked_by: null,
    compose_hash: 'e8416a02d6f7ce47baaa52e3925b934fd30834b04fc9086b363db9b1d12c729d',
  },
  verified: { signature: true, signature_reasons: [], attestation: 'not_checked' },
  notes: [],
}

const ok = (body: unknown) => ({ status: 200, body })
/** The listings of the fixtures, the first one carrying `appraisal` as given. */
function withAppraisal(appraisal: unknown, extra: Override = () => undefined): Override {
  return (path, init) => {
    if (/\/listings\?/.test(path)) return ok({ items: [{ ...listings[0], appraisal }, listings[1]], nextCursor: null })
    if (path === `/x207/appraisals/${ID}`) return ok(detail)
    return extra(path, init)
  }
}
const rowOf = async (assetType: string) => (await screen.findByText(assetType)).closest('tr')!

describe('FE-111 appraisal badge on a listing', () => {
  it('TC-FE-111-01 a listing with an appraisal shows the badge, the value and the range; one without shows none', async () => {
    renderApp('/marketplace', withAppraisal(brief))
    const row = await rowOf('translate-calls')
    const badge = within(row).getByTestId('appraisal-badge')
    expect(badge).toHaveTextContent('Appraised on NEAR AI Cloud (TEE) · signature checked')
    expect(badge).toHaveTextContent('Appraised at 60 credit (range 45 to 70)')
    expect(within(await rowOf('gpu-hours')).queryByTestId('appraisal-badge')).toBeNull()
  })

  it('TC-FE-111-02 a backend without appraisals (no field) shows no badge, no error and asks for no appraisal', async () => {
    const { calls } = renderApp('/marketplace')
    await rowOf('translate-calls')
    expect(screen.queryByTestId('appraisal-badge')).toBeNull()
    expect(screen.queryByText(/Appraised on NEAR AI Cloud/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(calls().some((c) => c.includes('/x207/appraisals/'))).toBe(false)
  })

  it('TC-FE-111-03 proof shows model, chat id, signing address, each check apart, the exact claim and the two links', async () => {
    const user = userEvent.setup()
    renderApp('/marketplace', withAppraisal(brief))
    await user.click(within(await rowOf('translate-calls')).getByRole('button', { name: `Show the proof of appraisal ${ID}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Appraisal proof' })
    await within(dialog).findByText('0b830c23184b4fe19b913348a0adb25b')
    expect(dialog).toHaveTextContent('Qwen/Qwen3.6-35B-A3B-FP8')
    expect(dialog).toHaveTextContent('0xfdbd7952498b333206f360d71d97a1e0961e8ddf')
    expect(within(dialog).getByText(APPRAISAL_CLAIM)).toBeInTheDocument()
    expect(APPRAISAL_CLAIM).toBe('Signature checked locally; quote checked via third-party verifiers (Phala, NVIDIA NRAS).')
    const result = (key: string) => dialog.querySelector(`[data-check="${key}"]`)?.getAttribute('data-result')
    expect([result('signature'), result('binding'), result('tdx'), result('gpu')]).toEqual(['pass', 'pass', 'pass', 'skipped'])
    expect(dialog.querySelector('[data-check="tdx"]')).toHaveTextContent('verifier: cloud-api.phala.network')
    expect(dialog.querySelector('[data-check="gpu"]')).toHaveTextContent('does not check the token signature')
    const links = within(dialog).getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links).toHaveLength(2)
    expect(links[0]).toMatch(new RegExp(`/x207/appraisals/${ID}$`))
    expect(links[1]).toMatch(new RegExp(`/x207/appraisals/${ID}/attestation$`))
    expect(dialog.textContent).not.toMatch(/DCAP-verified|trustless/i)
    expect(dialog).toHaveTextContent('The x207 circle contract does not read this appraisal.')
  })

  it('TC-FE-111-04 an appraisal whose signature failed never says "signature checked"', async () => {
    renderApp('/marketplace', withAppraisal({ ...brief, verified: { signature: false, attestation: 'failed' } }))
    const badge = within(await rowOf('translate-calls')).getByTestId('appraisal-badge')
    expect(badge).toHaveTextContent('Appraised on NEAR AI Cloud (TEE) · signature not verified')
    expect(badge).not.toHaveTextContent('signature checked')
  })

  it('TC-FE-111-05 an appraisal of the wrong shape shows no badge and the table still renders', async () => {
    renderApp('/marketplace', withAppraisal({ appraisal_id: 'apr_x', model: 7 }))
    const row = await rowOf('translate-calls')
    expect(row).toHaveTextContent('summarize-calls')
    expect(screen.queryByTestId('appraisal-badge')).toBeNull()
  })

  it('TC-FE-111-06 a proof that cannot be loaded says so in the dialog; Escape closes it', async () => {
    const user = userEvent.setup()
    renderApp('/marketplace', (path) => {
      if (/\/listings\?/.test(path)) return ok({ items: [{ ...listings[0], appraisal: brief }], nextCursor: null })
      if (path.startsWith('/x207/appraisals/')) return apiError(503, 'appraiser_disabled', 'The appraiser is off')
      return undefined
    })
    await user.click(within(await rowOf('translate-calls')).getByRole('button', { name: /Show the proof/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Appraisal proof' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The proof could not be loaded: The appraiser is off')
    expect(within(dialog).getAllByRole('link')).toHaveLength(2)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Appraisal proof' })).toBeNull())
    expect(screen.getByTestId('appraisal-badge')).toBeInTheDocument()
  })

  it('TC-FE-111-07 each check is reported apart: failed, skipped without a report, never folded into one verdict', () => {
    const failed = appraisalSteps({
      ...detail,
      verified: { signature: false, signature_reasons: ['response hash differs'], attestation: 'failed' },
      attestation: { ...detail.attestation!, report_binding: false, binding_reasons: ['nonce differs'], tdx_quote: 'failed', gpu_evidence: 'passed' },
    })
    expect(failed.map((s) => [s.key, s.result])).toEqual([['signature', 'fail'], ['binding', 'fail'], ['tdx', 'fail'], ['gpu', 'pass']])
    expect(failed[0].note).toBe('response hash differs')
    expect(failed[1].note).toBe('nonce differs')
    const none = appraisalSteps({ ...detail, attestation: null })
    expect(none.map((s) => s.result)).toEqual(['pass', 'skipped', 'skipped', 'skipped'])
  })
})
