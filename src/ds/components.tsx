// x207 design system components (v4). Thin wrappers over the `ds-*` classes of components.css; they carry no data logic.
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import './components.css'

export type Tone = 'ink' | 'settled' | 'claim' | 'due' | 'default'
/** The x207 result codes: 200 settled, 202 accepted/claimable, 402 payment due, 409 conflict/default. */
export type StatusCode = 200 | 202 | 402 | 409

const STATUS_WORD: Record<StatusCode, string> = { 200: 'Settled', 202: 'Claimable', 402: 'Due', 409: 'Defaulted' }

export function Panel({ title, sub, aside, children, as: Tag = 'section' }: { title?: ReactNode; sub?: ReactNode; aside?: ReactNode; children: ReactNode; as?: 'section' | 'div' | 'article' }) {
  return (
    <Tag className="ds-panel">
      {(title || aside) && (
        <header>
          <div>
            {title && <h3>{title}</h3>}
            {sub && <p className="ds-sub">{sub}</p>}
          </div>
          {aside}
        </header>
      )}
      {children}
    </Tag>
  )
}

export function Kpi({ badge, icon, label, value, unit, note, tone = 'ink' }: { badge?: string; icon?: ReactNode; label: ReactNode; value: ReactNode; unit?: string; note?: ReactNode; tone?: Tone }) {
  return (
    <div className="ds-kpi" data-tone={tone}>
      <header>
        {badge && <b aria-hidden="true">{badge}</b>}
        {icon && <span className="ds-kpi-icon" aria-hidden="true">{icon}</span>}
        <span>{label}</span>
      </header>
      <div className="ds-value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {note && <p>{note}</p>}
    </div>
  )
}

export function StatusBadge({ code, label }: { code: StatusCode; label?: string }) {
  return (
    <span className="ds-status" data-code={code}>
      <b>{code}</b>
      {label ?? STATUS_WORD[code]}
    </span>
  )
}

export const Chip = ({ children }: { children: ReactNode }) => <span className="ds-chip">{children}</span>
export const Eyebrow = ({ children }: { children: ReactNode }) => (
  <span className="ds-eyebrow">
    <i aria-hidden="true" />
    {children}
  </span>
)
export const Num = ({ children }: { children: ReactNode }) => <span className="ds-num">{children}</span>
export const AgentText = ({ children }: { children: ReactNode }) => <span className="ds-agent">{children}</span>

type Variant = 'glow' | 'quiet' | 'white'
export function Button({ variant = 'quiet', arrow, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; arrow?: boolean }) {
  return (
    <button {...rest} className={['ds-btn', rest.className].filter(Boolean).join(' ')} data-variant={variant}>
      {children}
      {arrow && <span className="ds-arr" aria-hidden="true">↗</span>}
    </button>
  )
}
export function ButtonLink({ variant = 'quiet', arrow, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; arrow?: boolean }) {
  return (
    <a {...rest} className={['ds-btn', rest.className].filter(Boolean).join(' ')} data-variant={variant}>
      {children}
      {arrow && <span className="ds-arr" aria-hidden="true">↗</span>}
    </a>
  )
}

/** The three big figures of an epoch as colour blocks, as on the landing: owed (paper white), cancelled in loops (lime), moved (floor blue).
 *  The note sits inside the <dd>, so the definition list stays valid (axe `definition-list`). */
export function Tally({ items }: { items: { tone: 'paper' | 'lime' | 'floor'; label: ReactNode; value: ReactNode; note?: ReactNode }[] }) {
  return (
    <dl className="ds-tally">
      {items.map((it, i) => (
        <div key={i} data-tone={it.tone}>
          <dt>{it.label}</dt>
          <dd>{it.value}{it.note && <small>{it.note}</small>}</dd>
        </div>
      ))}
    </dl>
  )
}
