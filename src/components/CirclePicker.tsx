import { CIRCLE_OPTIONS, CIRCLE_PICKER, SELECTED_CIRCLE } from '../config'
import { Mascot } from './Mascot'

/** FE-041: switches between circles that have a read API. The API URL and contract are read once at load, so a change reloads the page with `?circle=`. */
export function CirclePicker() {
  if (!CIRCLE_PICKER) return null
  return (
    <div className="picker picker-circle">
      <label htmlFor="circle-picker">Circle</label>
      {/* v6: each circle has a logo, the mascot of its contract, beside its name here and in the open list */}
      <span className="picker-field">
      <span className="picker-logo" aria-hidden="true">
        <Mascot id={CIRCLE_OPTIONS.find((o) => o.key === SELECTED_CIRCLE)?.contract ?? ''} size={24} mood="smile" />
      </span>
      <select
        id="circle-picker"
        value={SELECTED_CIRCLE ?? ''}
        onChange={(e) => {
          const url = new URL(window.location.href)
          url.searchParams.set('circle', e.target.value)
          url.searchParams.delete('epoch')
          window.location.assign(url.toString())
        }}
      >
        {CIRCLE_OPTIONS.map((o) => (
          <option key={o.key} value={o.key} data-mascot={o.contract}>
            {o.label}
          </option>
        ))}
      </select>
      </span>
    </div>
  )
}
