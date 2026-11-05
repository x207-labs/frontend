import { CIRCLE_OPTIONS, CIRCLE_PICKER, SELECTED_CIRCLE } from '../config'

/** FE-041: switches between circles that have a read API. The API URL and contract are read once at load, so a change reloads the page with `?circle=`. */
export function CirclePicker() {
  if (!CIRCLE_PICKER) return null
  return (
    <div className="picker">
      <label htmlFor="circle-picker">Circle</label>
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
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
