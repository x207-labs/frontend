import type { ReactNode } from 'react'
import { shortAccount } from '../lib/format'
import { Avatar } from './ListBits'
import { NavIcon } from './icons'

// FE-084: a deal drawn as the path the buyer's voucher takes. The buyer sits at the left end of a rail, the seller at the right end, and every step the
// voucher must pass sits on the rail between them as a station with its own drawing. The rail fills up to the step the deal has reached; a deal that
// ends badly turns its last station red (cancelled, disputed) or amber (dispute rejected). Station names and party names are drawn from data
// attributes, so they never repeat a status or message text in the page; the whole rail is read aloud from its label.

export type DealGlyphName = 'coin' | 'lock' | 'key' | 'check' | 'globe' | 'gamepad' | 'ticket' | 'shield' | 'cross'

const GLYPH_PATHS: Record<DealGlyphName, string> = {
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 6.5v11M14.75 9.25c0-1-1.1-1.75-2.75-1.75s-2.75.75-2.75 1.8c0 2.6 5.5 1.5 5.5 4.1 0 1.1-1.2 1.85-2.75 1.85s-2.75-.75-2.75-1.75',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 14.5v2',
  key: 'M8 11a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM10.8 12.2L19 4M15.5 7.5l2.5 2.5M13.5 9.5l2 2',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.4 2.5 3.5 5.5 3.5 9s-1.1 6.5-3.5 9c-2.4-2.5-3.5-5.5-3.5-9s1.1-6.5 3.5-9z',
  gamepad: 'M7.5 8h9a4.5 4.5 0 0 1 4.4 5.4l-.6 3a2.4 2.4 0 0 1-4.2 1.1L14.5 15.5h-5l-1.6 2a2.4 2.4 0 0 1-4.2-1.1l-.6-3A4.5 4.5 0 0 1 7.5 8zM8 10.5v3.5M6.25 12.25h3.5M15.5 11.5h.01M17.5 13h.01',
  ticket: 'M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4zM14.5 7v1.5M14.5 11v2M14.5 15.5V17',
  shield: 'M12 3l7 2.8v5.4c0 4.6-3 8.3-7 9.8-4-1.5-7-5.2-7-9.8V5.8zM9 12l2.2 2.2L15.5 10',
  cross: 'M7 7l10 10M17 7L7 17',
}

/** A small drawing of one step or one platform, in the current colour. Decorative: the label next to it carries the meaning. */
export function DealGlyph({ name, size = 16 }: { name: DealGlyphName; size?: number }) {
  return (
    <svg className="deal-glyph" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={GLYPH_PATHS[name]} />
    </svg>
  )
}

export type DealStop = { label: string; glyph: DealGlyphName }
/** How a deal ended when it did not end well: the last station takes this tone and label. `paid` says the seller was still paid. */
export type DealEnd = { tone: 'bad' | 'warn'; label: string; paid?: boolean }

type Props = {
  /** The page icon in the head tile, or a platform drawing. */
  tile: { nav: string } | { glyph: DealGlyphName }
  hue: string
  title: ReactNode
  pill: { tone: 'ok' | 'warn' | 'bad' | 'info'; label: string }
  buyer: string
  seller: string
  account: string | null
  stops: DealStop[]
  /** How many stations are passed; the next one is the step the deal waits on. */
  done: number
  end?: DealEnd
  children?: ReactNode
}

const nameOf = (who: string, account: string | null) => (who && who === account ? 'You' : shortAccount(who) || '?')

export function DealTrack({ tile, hue, title, pill, buyer, seller, account, stops, done, end, children }: Props) {
  const last = stops.length - 1
  const stateOf = (i: number) => (end && i === last ? end.tone : i < done ? 'done' : !end && i === done ? 'active' : 'todo')
  const reached = (i: number) => i < done || (!end && i === done) || (Boolean(end) && i === last && done >= last)
  const labelOf = (i: number) => (end && i === last ? end.label : stops[i].label)
  const arrived = end ? Boolean(end.paid) : done >= stops.length
  const now = end ? end.label : done >= stops.length ? 'all steps passed' : `waiting on ${stops[done].label.toLowerCase()}`
  return (
    <section className="deal-track" style={{ ['--tone' as string]: hue }}>
      <div className="deal-head">
        <span className="tone-tile sm" aria-hidden="true">
          {'nav' in tile ? <NavIcon name={tile.nav} size={16} /> : <DealGlyph name={tile.glyph} size={18} />}
        </span>
        <p className="item-title">{title}</p>
        <span className="pill" data-tone={pill.tone}>{pill.label}</span>
      </div>
      <div
        className="deal-rail"
        role="img"
        aria-label={`From buyer ${buyer || 'unknown'} to seller ${seller || 'unknown'}: ${Math.min(done, stops.length)} of ${stops.length} steps passed, ${now}.`}
      >
        <span className="deal-end" data-label={nameOf(buyer, account)}><Avatar account={buyer || '?'} /></span>
        {stops.map((s, i) => {
          const state = stateOf(i)
          return (
            <span key={s.label} className="deal-stop" data-state={state} data-label={labelOf(i)}>
              <span className="deal-in" data-on={reached(i) ? 'true' : 'false'} />
              <span className="deal-out" data-on={(i < last ? reached(i + 1) : arrived) ? 'true' : 'false'} />
              <span className="deal-node"><DealGlyph name={state === 'bad' ? 'cross' : s.glyph} size={15} /></span>
            </span>
          )
        })}
        <span className="deal-end" data-label={nameOf(seller, account)} data-arrived={arrived ? 'true' : 'false'}><Avatar account={seller || '?'} /></span>
      </div>
      {children}
    </section>
  )
}
