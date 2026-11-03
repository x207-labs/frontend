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
    <section aria-label="Metered resource template" className="form resource-template">
      <h3>Metered resource (class D)</h3>
      <label>
        <span>Resource type</span>
        <select value={values.kind} onChange={(e) => setValues({ ...EMPTY_RESOURCE, kind: e.target.value as ResourceValues['kind'] })}>
          <option value="">Fill in manually (no template)</option>
          {METERED_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </label>
      {preset && (
        <>
          <label>
            <span>Unit</span>
            <select value={values.unit === '' ? preset.units[0] : values.unit} onChange={(e) => set('unit', e.target.value)}>
              {preset.units.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]} ({u})</option>)}
            </select>
          </label>
          <label>
            <span>Price per unit (credit)</span>
            <input value={values.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} inputMode="decimal" />
          </label>
          <label>
            <span>Endpoint address (https)</span>
            <input value={values.endpoint} onChange={(e) => set('endpoint', e.target.value)} placeholder="https://gpu.example.com/api/run" />
          </label>
          <label>
            <span>Estimated number of units</span>
            <input value={values.quantity} onChange={(e) => set('quantity', e.target.value)} inputMode="decimal" />
          </label>
        </>
      )}
      {typeof result === 'string' && <p className="state state-error" role="alert" data-testid="resource-error">{result}</p>}
      {result && typeof result !== 'string' && (
        <>
          <p data-testid="resource-estimate">
            {result.estimateAtomic === null
              ? 'Enter the estimated number of units (a number > 0, at most 6 decimals).'
              : `Estimated cost for ${values.quantity} ${result.unit}: ${fromAtomic(result.estimateAtomic)} credit. Limit per request: ${result.maxQuantity} ${result.unit}.`}
          </p>
          <ul className="warnings" aria-label="Resource risks" data-testid="resource-warnings">
            {result.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
          <details>
            <summary>Listing detail</summary>
            <pre data-testid="resource-detail">{result.detail}</pre>
          </details>
          <div>
            <button type="button" onClick={() => onApply(result)}>Fill the “Offering” side from the resource</button>
          </div>
        </>
      )}
    </section>
  )
}
