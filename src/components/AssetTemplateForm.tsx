import { useMemo, useState } from 'react'
import { ASSET_KINDS, AssetTemplateError, buildAssetTemplate, type AssetKind, type AssetTemplate } from '@x207/core'
import { COMMON_FIELDS, KIND_FIELDS, toAssetInput, type Field } from '../lib/assetForm'

// FE-023 (SD-061): formulir listing per jenis aset on-chain (katalog 1 sampai 10, kelas A). Formulir tidak punya aturan sendiri: `buildAssetTemplate` memeriksa, menyusun scope,
// detail, dan peringatan risiko, dan menolak dengan kode galat yang stabil. Hasilnya mengisi sisi "Menawarkan" dari formulir listing; grant on-chain dan titipan aset
// ditandatangani pemilik terpisah (offer_grant, lalu titipan), jadi di sini hanya pratinjau panggilannya.
export type TemplateResult = { template: AssetTemplate } | { error: string; code?: string } | null

export function useTemplateResult(kind: AssetKind | '', values: Record<string, string>, now: number): TemplateResult {
  return useMemo(() => {
    if (kind === '') return null
    const input = toAssetInput(kind, values, now)
    if (typeof input === 'string') return { error: input }
    try {
      return { template: buildAssetTemplate(input, now) }
    } catch (e) {
      return e instanceof AssetTemplateError ? { error: e.message, code: e.code } : { error: String(e) }
    }
  }, [kind, values, now])
}

function FieldInput({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      <span>{field.label}{field.optional ? ' (optional)' : ''}</span>
      {field.kind === 'select' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {field.options!.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={field.kind === 'datetime' ? 'datetime-local' : 'text'}
          inputMode={field.kind === 'number' || field.kind === 'credit' || field.kind === 'token' ? 'decimal' : undefined}
        />
      )}
      {field.hint && <small>{field.hint}</small>}
    </label>
  )
}

export type TemplateCheck = { state: 'idle' } | { state: 'busy' } | { state: 'ok'; hash: string } | { state: 'error'; message: string }

type FormProps = { onApply: (template: AssetTemplate) => void; check?: TemplateCheck; onCheck?: () => void; canCheck?: boolean }

export function AssetTemplateForm({ onApply, check, onCheck, canCheck = false }: FormProps) {
  const [kind, setKind] = useState<AssetKind | ''>('')
  const [values, setValues] = useState<Record<string, string>>({ hours: '24' })
  const [now] = useState(() => Math.floor(Date.now() / 1000))
  const result = useTemplateResult(kind, values, now)
  const set = (key: string) => (v: string) => setValues((prev) => ({ ...prev, [key]: v }))
  const fields = kind === '' ? [] : [...KIND_FIELDS[kind].fields, ...COMMON_FIELDS]

  return (
    <section aria-label="On-chain asset template" className="form asset-template">
      <h3>On-chain asset template (class A)</h3>
      <label>
        <span>Asset type</span>
        <select value={kind} onChange={(e) => { setKind(e.target.value as AssetKind | ''); setValues({ hours: '24' }) }}>
          <option value="">Fill in manually (no template)</option>
          {ASSET_KINDS.map((k) => <option key={k} value={k}>{KIND_FIELDS[k].label}</option>)}
        </select>
      </label>
      {fields.map((f) => <FieldInput key={`${kind}-${f.key}`} field={f} value={values[f.key] ?? ''} onChange={set(f.key)} />)}
      {result && 'error' in result && (
        <p className="state state-error" role="alert" data-testid="template-error">
          {result.code && <code>{result.code}</code>} {result.error}
        </p>
      )}
      {result && 'template' in result && (
        <>
          <ul className="warnings" aria-label="Risks" data-testid="template-warnings">
            {result.template.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
          <details>
            <summary>Scope and on-chain call</summary>
            <p>Scope <code>limits.scope</code> for <code>offer_grant</code> ({result.template.assetType}, <code>{result.template.deliveryMethod}</code>):</p>
            <pre data-testid="template-scope">{result.template.scope}</pre>
            <p>Listing detail:</p>
            <pre data-testid="template-detail">{result.template.detail}</pre>
          </details>
          <div>
            <button type="button" onClick={() => onApply(result.template)}>Fill the “Offering” side from the template</button>
          </div>
          {onCheck && (
            <div className="listing-check" aria-label="Pre-escrow check">
              <p>
                Check this listing with the backend <strong>before</strong> calling <code>offer_grant</code> and escrowing the asset: an asset already escrowed for a rejected listing
                can only be reclaimed after the grant expires. Fill in the “Offering” side, the “Seeking” side, and the voucher key first.
              </p>
              <button type="button" disabled={!canCheck || check?.state === 'busy'} onClick={onCheck}>
                {check?.state === 'busy' ? 'Checking…' : 'Check listing before escrow'}
              </button>
              {check?.state === 'ok' && <p className="state" role="status" data-testid="listing-check-ok">Check passed (<code>{check.hash.slice(0, 12)}</code>): safe to call offer_grant and escrow the asset. Passing is no guarantee: the check is repeated when the listing is posted.</p>}
              {check?.state === 'error' && <p className="state state-error" role="alert" data-testid="listing-check-error">Listing rejected: {check.message}. Do not call offer_grant and do not escrow the asset.</p>}
              {(check === undefined || check.state === 'idle') && <p className="state" data-testid="listing-check-idle">Not checked yet: do not call offer_grant or escrow the asset yet.</p>}
            </div>
          )}
        </>
      )}
    </section>
  )
}
