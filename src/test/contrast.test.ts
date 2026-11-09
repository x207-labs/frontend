// FE-031: WCAG 2.1 contrast of the colour tokens of `styles.css` (jsdom has no layout, so axe cannot check it). Text needs 4.5:1; the focus ring and the borders of controls need 3:1.
import { describe, expect, it } from 'vitest'
import css from '../styles.css?raw'

const token = (name: string): string => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1] ?? (() => { throw new Error(`token ${name} not found`) })()
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
// FE-067 (dark theme): a token such as --accent-soft is translucent, rgb(r g b / a); blend it over a solid token to get the colour the eye sees.
const blend = (name: string, over: string): string => {
  const m = new RegExp(`--${name}:\\s*rgb\\((\\d+) (\\d+) (\\d+) / ([0-9.]+)\\)`).exec(css)
  if (!m) throw new Error(`translucent token ${name} not found`)
  const a = Number(m[4])
  const hex = (n: number): string => Math.round(n).toString(16).padStart(2, '0')
  const o = [1, 3, 5].map((i) => parseInt(over.slice(i, i + 2), 16))
  return '#' + [1, 2, 3].map((k, i) => hex(Number(m[k]) * a + (o[i] as number) * (1 - a))).join('')
}
export const ratio = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

describe('FE-031 contrast of the colour tokens', () => {
  it('TC-FE-031-03 body and secondary text on the page and on the sheet are at least 4.5:1', () => {
    for (const fg of ['ink', 'ink-soft']) for (const bg of ['paper', 'sheet']) expect(ratio(token(fg), token(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
  })

  it('TC-FE-031-04 the colours of the status of an answer (200, 402, 202, 409) are at least 4.5:1 as text on the sheet and on the page', () => {
    for (const s of ['s200', 's402', 's202', 's409']) {
      for (const bg of ['paper', 'sheet']) expect(ratio(token(s), token(bg)), `${s} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('TC-FE-031-05 white text on the accent fill (buttons, the live phase) is at least 4.5:1, and the focus ring against the page is at least 3:1', () => {
    expect(ratio('#ffffff', token('accent-fill'))).toBeGreaterThanOrEqual(4.5)
    for (const bg of ['paper', 'sheet']) expect(ratio(token('focus'), token(bg)), `focus on ${bg}`).toBeGreaterThanOrEqual(3)
  })

  it('FE-054 the active item of the navigation (accent text on the accent tint) and the tab labels (soft ink on the sheet) are at least 4.5:1', () => {
    const tint = blend('accent-soft', token('sheet'))
    expect(ratio(token('accent-ink'), tint)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(token('accent-ink'), token('sheet'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(token('ink'), tint)).toBeGreaterThanOrEqual(4.5)
  })
})
