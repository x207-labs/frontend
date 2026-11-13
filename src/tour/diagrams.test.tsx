// FE-125: the ring of tour step 7 says what its numbers are: owed before clearing, what cancels, and what is left after clearing.
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Ring, RING_LEFT } from './diagrams'
import { RING } from './sample'
import { STEPS } from './steps'

afterEach(cleanup)

describe('Ring (tour step 7)', () => {
  it('derives the residual of each leg from the recorded epoch', () => {
    expect(RING_LEFT.map((l) => l.left)).toEqual([8, 1, 0])
    expect(RING.legs.reduce((s, l) => s + l.amount, 0)).toBe(RING.gross)
    expect(RING_LEFT.reduce((s, l) => s + l.left, 0)).toBe(RING.gross - RING.cleared)
  })

  it('labels each leg number and shows the before/after table', () => {
    const { container } = render(<Ring still />)
    // the last frame: every leg number carries the word "left"
    const units = [...container.querySelectorAll('.tour-leg-unit')].map((t) => t.textContent)
    expect(units).toEqual(['left', 'left', 'left'])
    const legNumbers = [...container.querySelectorAll('.tour-leg text')].map((t) => t.firstChild?.textContent)
    expect(legNumbers).toEqual(['8', '1', '0'])

    const table = screen.getByRole('table', { name: /before and after clearing/ })
    const cols = within(table).getAllByRole('columnheader').map((c) => c.textContent)
    expect(cols).toEqual(['Debt', 'Owed before', 'Cancelled', 'Left after clearing'])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent))).toEqual([
      ['32', '−24', '8'],
      ['25', '−24', '1'],
      ['24', '−24', '0'],
      ['81', '−72', '9'],
    ])
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent(/^alice\s*→\s*owes\s+bob$/)
  })

  it('describes the before and after for a screen reader', () => {
    render(<Ring still />)
    const img = screen.getByRole('img')
    expect(img).toHaveAccessibleName(/before clearing: alice owes bob 32, bob owes dan2 25, dan2 owes alice 24/)
    expect(img).toHaveAccessibleName(/Left after clearing: alice to bob 8, bob to dan2 1, dan2 to alice 0; 9 in all\./)
    const step = STEPS.find((s) => s.id === 'replay')
    expect(STEPS.indexOf(step!)).toBe(6)
    expect(step!.say).toContain('Left after clearing: alice owes bob 8, bob owes dan2 1, dan2 owes alice 0.')
  })

  it('starts on what is owed when it animates', () => {
    const { container } = render(<Ring still={false} />)
    expect([...container.querySelectorAll('.tour-leg-unit')].map((t) => t.textContent)).toEqual(['owed', 'owed', 'owed'])
    expect([...container.querySelectorAll('.tour-leg text')].map((t) => t.firstChild?.textContent)).toEqual(['32', '25', '24'])
  })
})
