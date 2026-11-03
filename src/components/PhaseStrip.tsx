import type { EpochPhase } from '../api/types'

const phases: { id: EpochPhase; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'cutoff', label: 'Cutoff' },
  { id: 'clearing', label: 'Clearing' },
  { id: 'commit', label: 'Commit' },
  { id: 'payment_window', label: 'Payment window' },
  { id: 'finalized', label: 'Finalized' },
]

export function PhaseStrip({ phase }: { phase: EpochPhase }) {
  const current = phases.findIndex((p) => p.id === phase)
  return (
    <ol className="phases" aria-label="Epoch phase">
      {phases.map((p, i) => (
        <li
          key={p.id}
          className={i < current ? 'past' : i === current ? 'now' : undefined}
          aria-current={i === current ? 'step' : undefined}
        >
          {p.label}
        </li>
      ))}
    </ol>
  )
}
