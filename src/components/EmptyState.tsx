import type { ReactNode } from 'react'
import { Mascot, type Mood } from './Mascot'

/** v6.4: an empty page, as iOS apps draw one: a large mascot, a short bold title, one line, and at most one action. Spans only, so it can sit in a <p>. */
export function EmptyState({ id, mood = 'flat', title, line, action }: { id: string; mood?: Mood; title: string; line: string; action?: ReactNode }) {
  return (
    <span className="empty-state">
      <Mascot id={id} size={88} mood={mood} />
      <span className="empty-title">{title}</span>
      <span className="empty-line">{line}</span>
      {action}
    </span>
  )
}
