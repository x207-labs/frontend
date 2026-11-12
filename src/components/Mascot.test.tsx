import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MASCOT_COLORS, Mascot, mascotOf } from './Mascot'

describe('Mascot', () => {
  it('gives one account the same shape and colour every time, and spreads accounts over the shapes', () => {
    expect(mascotOf('alice.testnet')).toEqual(mascotOf('alice.testnet'))
    const ids = Array.from({ length: 64 }, (_, i) => `agent-${i}.testnet`)
    const shapes = new Set(ids.map((id) => mascotOf(id).shape))
    const colors = new Set(ids.map((id) => mascotOf(id).color))
    expect(shapes.size).toBe(8)
    expect(colors.size).toBeGreaterThan(6)
    for (const id of ids) expect(MASCOT_COLORS).toContain(mascotOf(id).color)
  })

  it('is decorative', () => {
    const { container } = render(<Mascot id="bob.testnet" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
