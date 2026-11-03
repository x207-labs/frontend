import { useMemo, useState } from 'react'
import { fromAtomic } from '../lib/amount'
import { EMPTY_RESOURCE, KIND_LABEL, METERED_KINDS, METERED_PRESETS, UNIT_LABEL, toResourceTemplate, type ResourceTemplate, type ResourceValues } from '../lib/resourceForm'

// FE-024: formulir listing sumber daya terukur (kelas D). Hasilnya mengisi sisi "Menawarkan" (jenis aset, kelas D, satu satuan, harga satuan) dan `detail` listing
// `{"kind","unit","unit_price","endpoint"}` yang dibaca backend (BE-050).
export function ResourceListingForm({ onApply }: { onApply: (template: ResourceTemplate) => void }) {
  const [values, setValues] = useState<ResourceValues>(EMPTY_RESOURCE)
  const result = useMemo(() => (values.kind === '' ? null : toResourceTemplate(values)), [values])
  const preset = values.kind === '' ? null : METERED_PRESETS[values.kind]
  const set = <K extends keyof ResourceValues>(key: K, value: ResourceValues[K]) => setValues((prev) => ({ ...prev, [key]: value }))

  return (
    <section aria-label="Template sumber daya terukur" className="form resource-template">
      <h3>Sumber daya terukur (kelas D)</h3>
      <label>
        <span>Jenis sumber daya</span>
        <select value={values.kind} onChange={(e) => setValues({ ...EMPTY_RESOURCE, kind: e.target.value as ResourceValues['kind'] })}>
          <option value="">Isi sendiri (tanpa template)</option>
          {METERED_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </label>
      {preset && (
        <>
          <label>
            <span>Satuan</span>
            <select value={values.unit === '' ? preset.units[0] : values.unit} onChange={(e) => set('unit', e.target.value)}>
              {preset.units.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]} ({u})</option>)}
            </select>
          </label>
          <label>
            <span>Harga per satuan (credit)</span>
            <input value={values.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} inputMode="decimal" />
          </label>
          <label>
            <span>Alamat endpoint (https)</span>
            <input value={values.endpoint} onChange={(e) => set('endpoint', e.target.value)} placeholder="https://gpu.example.com/api/run" />
          </label>
          <label>
            <span>Perkiraan jumlah satuan</span>
            <input value={values.quantity} onChange={(e) => set('quantity', e.target.value)} inputMode="decimal" />
          </label>
        </>
      )}
      {typeof result === 'string' && <p className="state state-error" role="alert" data-testid="resource-error">{result}</p>}
      {result && typeof result !== 'string' && (
        <>
          <p data-testid="resource-estimate">
            {result.estimateAtomic === null
              ? 'Isi perkiraan jumlah satuan (angka > 0, paling banyak 6 desimal).'
              : `Perkiraan biaya ${values.quantity} ${result.unit}: ${fromAtomic(result.estimateAtomic)} credit. Batas per request: ${result.maxQuantity} ${result.unit}.`}
          </p>
          <ul className="warnings" aria-label="Risiko sumber daya" data-testid="resource-warnings">
            {result.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
          <details>
            <summary>Detail listing</summary>
            <pre data-testid="resource-detail">{result.detail}</pre>
          </details>
          <div>
            <button type="button" onClick={() => onApply(result)}>Isi sisi “Menawarkan” dari sumber daya</button>
          </div>
        </>
      )}
    </section>
  )
}
