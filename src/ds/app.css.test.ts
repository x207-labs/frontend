import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// vitest does not pass these sheets through (vite.config.ts only lets styles.css in), so they are read from disk, as the landing sheet is in src/test/mobile.test.ts.
const read = (name: string) => readFileSync(resolve(process.cwd(), 'src', 'ds', name), 'utf8')
const app = read('app.css')
const tokens = read('tokens.css')
const bare = app.replace(/\/\*[\s\S]*?\*\//g, '')

const token = (name: string): string => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens)?.[1] ?? (() => { throw new Error(`token ${name} not found`) })()
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

/** Removes every `@media ... { ... }` block that opens with the given condition (brace matching, so nested rules go with it). */
function withoutMedia(css: string, condition: string): string {
  let out = css
  for (;;) {
    const start = out.indexOf(`@media ${condition} {`)
    if (start < 0) return out
    let depth = 0
    let end = start
    for (let i = out.indexOf('{', start); i < out.length; i++) {
      if (out[i] === '{') depth++
      if (out[i] === '}' && --depth === 0) {
        end = i + 1
        break
      }
    }
    out = out.slice(0, start) + out.slice(end)
  }
}

describe('v4 app.css', () => {
  it('every :hover rule sits under (hover: hover) and (pointer: fine), so a tap never leaves a stuck hover', () => {
    expect(bare).toContain(':hover')
    expect(withoutMedia(bare, '(hover: hover) and (pointer: fine)')).not.toContain(':hover')
  })

  it('the open page of the sidebar and of the sheet has the surface and the lime tick; the tab bar marks its tab the same way', () => {
    expect(bare).toMatch(/\.rail a\.active, \.sheet a\.active \{ background: var\(--ds-surface-2\);/)
    expect(bare).toMatch(/\.rail a\.active::before, \.sheet a\.active::before \{[^}]*background: var\(--ds-focus\);/)
    expect(bare).toMatch(/\.tab\[aria-current='page'\]::before \{[^}]*background: var\(--ds-focus\);/)
  })

  it('the sidebar is compact from 1200 px (a 30 px row) and a touch screen keeps 44 px targets', () => {
    expect(withoutMedia(bare, '(pointer: coarse)')).toMatch(/@media \(min-width: 1200px\) \{[\s\S]*?\.rail a \{[^}]*min-height: 1\.875rem;/)
    expect(bare).toMatch(/@media \(pointer: coarse\) \{[^}]*\.rail a, \.sheet a \{ min-height: 2\.75rem; \}[^}]*\.topbar \.wallet \.ds-btn \{ min-height: 2\.75rem; \}/)
  })

  it('colour is used for status only: no status colour token is used outside the two roles it names', () => {
    // settled green marks "done" steps; the other status colours are not used in this sheet at all (StatusBadge carries them)
    expect(bare).not.toMatch(/--ds-(due|claim|default)\b/)
    expect([...bare.matchAll(/var\(--ds-settled\)/g)].length).toBeLessThanOrEqual(3)
  })

  it('text colours that the sheet introduces pass AA on the surfaces they sit on', () => {
    for (const fg of ['ds-ink', 'ds-ink-2', 'ds-ink-3']) for (const bg of ['ds-paper', 'ds-surface', 'ds-surface-2']) expect(ratio(token(fg), token(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    // the lime phase segment and the tally blocks
    expect(ratio(token('ds-eye'), token('ds-focus'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio('#4a5175', '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('#3c4a10', token('ds-lime'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(token('ds-eye'), '#ffffff')).toBeGreaterThanOrEqual(4.5)
    // white on the lighter end of the moved block, and its note (white at 0.88) over the same blue
    expect(ratio('#ffffff', token('ds-floor-a'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio('#e3e6ff', token('ds-floor-a'))).toBeGreaterThanOrEqual(4.5)
  })

  it('the epoch picker and the page header are styled once here, for every page', () => {
    expect(bare).toMatch(/\.page-head h1 \{[^}]*var\(--ds-fs-h1\)/)
    expect(bare).toMatch(/\.page-intro \{[^}]*var\(--ds-ink-2\)/)
    expect(bare).toMatch(/\.picker label \{[^}]*var\(--ds-font-mono\)/)
  })
})
