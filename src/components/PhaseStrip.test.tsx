import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PhaseStrip } from './PhaseStrip'

// v4: a segmented timeline. Done phases are marked (a check, and "done" for a screen reader), the current phase is the one `aria-current="step"`, the rest are plain.
describe('PhaseStrip', () => {
  it('is one list of the six phases with the current one marked as the step', () => {
    render(<PhaseStrip phase="payment_window" />)
    const list = screen.getByRole('list', { name: 'Epoch phase' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.querySelector('.phase-label')?.textContent)).toEqual(['Open', 'Cutoff', 'Clearing', 'Commit', 'Payment window', 'Finalized'])
    expect(items.map((li) => li.getAttribute('aria-current'))).toEqual([null, null, null, null, 'step', null])
    expect(items.map((li) => li.className)).toEqual(['past', 'past', 'past', 'past', 'now', ''])
  })

  it('done phases carry a check and are read as done; the current and future ones do not', () => {
    render(<PhaseStrip phase="clearing" />)
    const items = within(screen.getByRole('list', { name: 'Epoch phase' })).getAllByRole('listitem')
    expect(items.map((li) => li.querySelector('svg') !== null)).toEqual([true, true, false, false, false, false])
    expect(items[0]).toHaveTextContent('Open, done')
    expect(items[2]).not.toHaveTextContent('done')
  })

  it('a finalized epoch has every earlier phase done and the last one current', () => {
    render(<PhaseStrip phase="finalized" />)
    const items = within(screen.getByRole('list', { name: 'Epoch phase' })).getAllByRole('listitem')
    expect(items.filter((li) => li.className === 'past')).toHaveLength(5)
    expect(items[5]).toHaveAttribute('aria-current', 'step')
  })
})
