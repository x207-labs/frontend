import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { matchPages } from '../lib/palette'
import type { PageRoute } from '../routes'
import { NavIcon } from './icons'

// FE-057: Cmd-K (Ctrl-K on Windows and Linux) opens a search over every page. The button next to the account opens it too, which is the way in on a phone.
// The input is a combobox: the arrows move through the pages, Enter opens one (the epoch and circle in the address are kept), Escape closes and gives the focus back.
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])

  return (
    <>
      <button type="button" className="palette-trigger" ref={opener} aria-haspopup="dialog" aria-expanded={open} aria-keyshortcuts="Control+K Meta+K" onClick={() => setOpen(true)}>
        <NavIcon name="search" size={18} />
        <span className="palette-label">Search pages</span>
        <kbd aria-hidden="true">⌘K</kbd>
      </button>
      {open && <Palette onClose={() => { setOpen(false); opener.current?.focus() }} />}
    </>
  )
}

function Palette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [at, setAt] = useState(0)
  const navigate = useNavigate()
  const { search } = useLocation()
  const listId = useId()
  const hits = useMemo(() => matchPages(query), [query])
  const active = Math.min(at, Math.max(hits.length - 1, 0))
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  const go = (p: PageRoute) => {
    onClose()
    navigate({ pathname: p.path, search })
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (hits.length > 0) setAt((active + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length)
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault()
      go(hits[active])
    }
  }

  return (
    <div className="sheet-backdrop palette-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search pages" onKeyDown={onKeyDown}>
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={hits[active] ? `${listId}-${active}` : undefined}
          aria-label="Page name"
          placeholder="Go to a page"
          autoComplete="off"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setAt(0) }}
        />
        <ul id={listId} role="listbox" aria-label="Pages">
          {hits.map((p, i) => (
            <li key={p.path} id={`${listId}-${i}`} role="option" aria-selected={i === active} onClick={() => go(p)} onMouseMove={() => setAt(i)}>
              <NavIcon name={p.path} size={18} />
              <span>{p.title}</span>
              <small>{p.group}</small>
            </li>
          ))}
        </ul>
        {hits.length === 0 && (
          <p className="state" role="status">
            No page matches “{query}”. Try “pay”, “market” or “help”.
          </p>
        )}
      </div>
    </div>
  )
}
