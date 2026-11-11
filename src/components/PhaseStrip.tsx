import type { EpochPhase } from '../api/types'

const phases: { id: EpochPhase; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'cutoff', label: 'Cutoff' },
  { id: 'clearing', label: 'Clearing' },
  { id: 'commit', label: 'Commit' },
  { id: 'payment_window', label: 'Payment window' },
  { id: 'finalized', label: 'Finalized' },
]

// v4: a segmented timeline in one pill. Done phases are quiet with a small check, the phase the epoch is in is the lime segment with a dot, the ones to come are dim.
// The marks are drawn by CSS and the check here; the words stay in the page for everyone (on a phone only the current one is shown, the rest are read aloud).
export function PhaseStrip({ phase }: { phase: EpochPhase }) {
  const current = phases.findIndex((p) => p.id === phase)
  return (
    <ol className="phases" aria-label="Epoch phase">
      {phases.map((p, i) => (
        <li key={p.id} className={i < current ? 'past' : i === current ? 'now' : undefined} aria-current={i === current ? 'step' : undefined}>
          <span className="phase-mark" aria-hidden="true">
            {i < current && (
              <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 6.4l2.3 2.3 4.7-5" />
              </svg>
            )}
          </span>
          <span className="phase-label">{p.label}</span>
          {i < current && <span className="sr-only">, done</span>}
        </li>
      ))}
    </ol>
  )
}
