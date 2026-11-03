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
      <span>{field.label}{field.optional ? ' (opsional)' : ''}</span>
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
    <section aria-label="Template aset on-chain" className="form asset-template">
      <h3>Template aset on-chain (kelas A)</h3>
      <label>
        <span>Jenis aset</span>
        <select value={kind} onChange={(e) => { setKind(e.target.value as AssetKind | ''); setValues({ hours: '24' }) }}>
          <option value="">Isi sendiri (tanpa template)</option>
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
          <ul className="warnings" aria-label="Risiko" data-testid="template-warnings">
            {result.template.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
          <details>
            <summary>Scope dan panggilan on-chain</summary>
            <p>Scope <code>limits.scope</code> untuk <code>offer_grant</code> ({result.template.assetType}, <code>{result.template.deliveryMethod}</code>):</p>
            <pre data-testid="template-scope">{result.template.scope}</pre>
            <p>Detail listing:</p>
            <pre data-testid="template-detail">{result.template.detail}</pre>
          </details>
          <div>
            <button type="button" onClick={() => onApply(result.template)}>Isi sisi “Menawarkan” dari template</button>
          </div>
          {onCheck && (
            <div className="listing-check" aria-label="Pemeriksaan sebelum titipan">
              <p>
                Periksa listing ini ke backend <strong>sebelum</strong> memanggil <code>offer_grant</code> dan menitipkan aset: aset yang sudah dititipkan untuk listing yang ditolak
                baru bisa diambil kembali setelah grant kedaluwarsa. Isi sisi “Menawarkan”, sisi “Mencari”, dan kunci voucher dulu.
              </p>
              <button type="button" disabled={!canCheck || check?.state === 'busy'} onClick={onCheck}>
                {check?.state === 'busy' ? 'Memeriksa…' : 'Periksa listing sebelum titipan'}
              </button>
              {check?.state === 'ok' && <p className="state" role="status" data-testid="listing-check-ok">Lulus pemeriksaan (<code>{check.hash.slice(0, 12)}</code>): aman memanggil offer_grant dan menitipkan aset. Lulus belum menjamin: pemeriksaan diulang saat listing dipasang.</p>}
              {check?.state === 'error' && <p className="state state-error" role="alert" data-testid="listing-check-error">Listing ditolak: {check.message}. Jangan panggil offer_grant dan jangan titipkan aset.</p>}
              {(check === undefined || check.state === 'idle') && <p className="state" data-testid="listing-check-idle">Belum diperiksa: jangan panggil offer_grant atau titipkan aset dulu.</p>}
            </div>
          )}
        </>
      )}
    </section>
  )
}
