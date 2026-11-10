import type { ReactNode } from 'react'
import { shortAccount } from '../lib/format'
import { AgentIcon, NavIcon } from './icons'

// FE-081: the pieces of a list row. A row reads left to right: what it is (a tinted icon tile, a bold title, a muted line), who is on it (avatars),
// how far it got (a bar with one segment per step) and where it stands (the status pill). Colour encodes the member or the step state, never decoration.

/** Eight hues for member avatars; a member keeps the same hue on every page because the hue comes from the account name. */
const AVATAR_HUES = ['#3d8bff', '#2f9e8f', '#e2801f', '#c75bd6', '#3fb56a', '#e25a4f', '#8b6cf0', '#d4a72c']

function hueOf(account: string): string {
  let h = 0
  for (const c of account) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_HUES[h % AVATAR_HUES.length]
}

/** A member's avatar alone: on its own hue, showing its work (a chip for a GPU seller) or, when the name says nothing, its initials. */
export function Avatar({ account }: { account: string }) {
  const initials = shortAccount(account).replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?'
  return <span className="avatar" aria-hidden="true" title={account} style={{ ['--hue' as string]: hueOf(account) }}>{AgentIcon({ account }) ?? initials}</span>
}

/** A member: the avatar, then the short name. The full account is in the title for hover and copy. */
export function Party({ account, you }: { account: string; you?: boolean }) {
  const name = shortAccount(account)
  return (
    <span className="party" title={account}>
      <Avatar account={account} />
      <span className="party-name">{name}</span>
      {you && <span className="you-tag">you</span>}
    </span>
  )
}

/** Two members of one deal stacked, joined by a short line: the one who starts it on top (issuer, buyer), the other under it. `joint` is read aloud between them. */
export function PartyPair({ from, to, account, joint }: { from: string; to: string; account: string | null; joint: string }) {
  return (
    <span className="party-pair">
      <Party account={from} you={from === account} />
      <span className="sr-only"> {joint} </span>
      <Party account={to} you={to === account} />
    </span>
  )
}

/** The first cell of a row: a tile in the page's hue with the page icon, the item's name, and one muted line under it. */
export function ItemTitle({ icon, hue, title, sub }: { icon: string; hue: string; title: ReactNode; sub?: ReactNode }) {
  return (
    <span className="row-title">
      <span className="tone-tile sm" aria-hidden="true" style={{ ['--tone' as string]: hue }}><NavIcon name={icon} size={16} /></span>
      <span className="row-text">
        <strong>{title}</strong>
        {sub && <span className="row-sub">{sub}</span>}
      </span>
    </span>
  )
}

export type StepTone = 'done' | 'active' | 'todo' | 'bad'

/** One segment per step (installments, milestones), coloured by its state, with the count of finished steps in words beside it. */
export function StepBar({ steps, doneLabel }: { steps: StepTone[]; doneLabel: string }) {
  const done = steps.filter((s) => s === 'done').length
  return (
    <span className="step-bar" role="img" aria-label={`${done} of ${steps.length} ${doneLabel}`}>
      <span className="step-track" aria-hidden="true">
        {steps.map((s, i) => <span key={i} data-step={s} />)}
      </span>
      <span className="step-count" aria-hidden="true">{done}/{steps.length}</span>
    </span>
  )
}
