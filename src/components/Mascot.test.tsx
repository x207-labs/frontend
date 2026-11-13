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

  it('is decorative, has a face (two eyes and a mouth), and the face follows the mood it is given', () => {
    const { container, rerender } = render(<Mascot id="bob.testnet" />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('data-mood', mascotOf('bob.testnet').mood)
    rerender(<Mascot id="bob.testnet" mood="smile" />)
    expect(svg.querySelectorAll('.mascot-face ellipse')).toHaveLength(2)
    expect(svg.querySelectorAll('.mascot-face path')).toHaveLength(1) // the mouth
    rerender(<Mascot id="bob.testnet" mood="surprised" />)
    expect(svg).toHaveAttribute('data-mood', 'surprised')
    expect(svg.querySelectorAll('.mascot-face ellipse')).toHaveLength(3) // the open mouth
    rerender(<Mascot id="bob.testnet" mood="wink" />)
    expect(svg.querySelectorAll('.mascot-face ellipse')).toHaveLength(1) // one eye shut
  })
})
