import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// FE-086: every <select> in the app opens this menu instead of the browser's own list, on a device with a fine pointer (mouse or trackpad). The native select
// stays in the page and keeps its value, its label and its change event, so forms, tests and screen readers see an ordinary select; the menu only
// replaces the list the browser would draw. On a touch screen the phone's own picker is better than any drawn list, so the menu stays off there.
// A select with `data-native` keeps the browser's list.

type Place = { left: number; top: number; width: number; maxHeight: number; up: boolean }
type Open = { select: HTMLSelectElement; active: number; place: Place }

/** The menu sits under the select, or above it when the space below is short; it is never narrower than the select. */
function placeOf(select: HTMLSelectElement): Place {
  const rect = select.getBoundingClientRect()
  const below = window.innerHeight - rect.bottom - 12
  const above = rect.top - 12
  const want = Math.min(select.options.length * 40 + 12, 320)
  const up = below < Math.min(want, 200) && above > below
  const width = Math.max(rect.width, 176)
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  return { left, top: up ? rect.top - 6 : rect.bottom + 6, width, maxHeight: Math.min(want, up ? above : below), up }
}

const MENU_ID = 'select-menu'
const valueSetter = () => Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set

function enabledIndex(select: HTMLSelectElement, from: number, step: 1 | -1) {
  const options = select.options
  for (let i = from; i >= 0 && i < options.length; i += step) if (!options[i].disabled) return i
  return -1
}

function choose(select: HTMLSelectElement, index: number) {
  const option = select.options[index]
  if (!option || option.disabled) return
  if (select.selectedIndex !== index) {
    valueSetter()?.call(select, option.value)
    select.dispatchEvent(new Event('input', { bubbles: true }))
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }
}

function labelOf(select: HTMLSelectElement) {
  const own = select.getAttribute('aria-label')
  if (own) return own
  const label = select.labels?.[0]
  const span = label?.querySelector('span')
  return (span ?? label)?.textContent?.trim() || 'Options'
}

function usable(select: HTMLSelectElement) {
  return !select.disabled && !select.multiple && select.size <= 1 && !select.hasAttribute('data-native') && select.options.length > 0
}

export function SelectMenu() {
  const [open, setOpen] = useState<Open | null>(null)
  const openRef = useRef<Open | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    openRef.current = open
  }, [open])

  const close = useCallback((focus = true) => {
    const current = openRef.current
    if (!current) return
    current.select.removeAttribute('aria-expanded')
    current.select.removeAttribute('aria-controls')
    current.select.removeAttribute('aria-activedescendant')
    if (focus) current.select.focus()
    openRef.current = null
    setOpen(null)
  }, [])

  const show = useCallback((select: HTMLSelectElement) => {
    if (!usable(select)) return
    const start = select.selectedIndex >= 0 ? select.selectedIndex : enabledIndex(select, 0, 1)
    select.setAttribute('aria-expanded', 'true')
    select.setAttribute('aria-controls', MENU_ID)
    select.focus()
    const next = { select, active: start, place: placeOf(select) }
    openRef.current = next
    setOpen(next)
  }, [])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (target?.closest?.(`#${MENU_ID}`)) return
      const select = target?.closest?.('select')
      if (select instanceof HTMLSelectElement && e.button === 0 && usable(select)) {
        e.preventDefault()
        if (openRef.current?.select === select) close()
        else show(select)
        return
      }
      if (openRef.current) close(false)
    }
    const onKey = (e: KeyboardEvent) => {
      const select = e.target
      if (!(select instanceof HTMLSelectElement)) return
      const current = openRef.current
      if (!current || current.select !== select) {
        if (!usable(select)) return
        if (e.key === ' ' || e.key === 'Enter' || ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.altKey)) {
          e.preventDefault()
          show(select)
        }
        return
      }
      const last = select.options.length - 1
      const move = (index: number) => {
        e.preventDefault()
        if (index >= 0) setOpen({ ...current, active: index })
      }
      switch (e.key) {
        case 'ArrowDown': return move(enabledIndex(select, Math.min(current.active + 1, last), 1))
        case 'ArrowUp': return move(enabledIndex(select, Math.max(current.active - 1, 0), -1))
        case 'Home': return move(enabledIndex(select, 0, 1))
        case 'End': return move(enabledIndex(select, last, -1))
        case 'Enter':
        case ' ':
          e.preventDefault()
          choose(select, current.active)
          return close()
        case 'Escape':
          e.preventDefault()
          e.stopPropagation()
          return close()
        case 'Tab':
          return close(false)
        default:
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
            const key = e.key.toLowerCase()
            const options = Array.from(select.options)
            const after = options.findIndex((o, i) => i > current.active && !o.disabled && o.text.toLowerCase().startsWith(key))
            const hit = after >= 0 ? after : options.findIndex((o) => !o.disabled && o.text.toLowerCase().startsWith(key))
            move(hit)
          }
      }
    }
    const onMove = (e: Event) => {
      if (!openRef.current) return
      if (e.type === 'scroll' && listRef.current?.contains(e.target as Node)) return
      close(false)
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [close, show])

  useEffect(() => {
    if (!open) return
    const id = `${MENU_ID}-${open.active}`
    open.select.setAttribute('aria-activedescendant', id)
    document.getElementById(id)?.scrollIntoView({ block: 'nearest' })
  }, [open])

  if (!open) return null
  const { select, active, place } = open
  return createPortal(
    <ul
      id={MENU_ID}
      ref={listRef}
      className="select-menu"
      role="listbox"
      aria-label={labelOf(select)}
      data-up={place.up ? 'true' : undefined}
      style={{ left: place.left, top: place.top, minWidth: place.width, maxHeight: place.maxHeight }}
    >
      {Array.from(select.options).map((o, i) => (
        <li
          key={`${i}-${o.value}`}
          id={`${MENU_ID}-${i}`}
          role="option"
          aria-selected={i === select.selectedIndex}
          aria-disabled={o.disabled || undefined}
          data-active={i === active ? 'true' : undefined}
          onMouseMove={() => !o.disabled && i !== active && setOpen({ ...open, active: i })}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (o.disabled) return
            choose(select, i)
            close()
          }}
        >
          <span>{o.text}</span>
          {i === select.selectedIndex && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </li>
      ))}
    </ul>,
    document.body,
  )
}
