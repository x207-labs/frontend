import { describe, expect, it } from 'vitest'
import css from '../styles.css?raw'
import html from '../../index.html?raw'

// FE-058: the phone fixes live in CSS and in index.html, which jsdom does not run. These tests read the sources, so a later edit cannot quietly undo them.
// What they cannot show is how a real iPhone or Android phone behaves; that needs a device.

const HOVER_BLOCK = /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\n\}/
const withoutHoverBlock = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(HOVER_BLOCK, '')

describe('FE-058 mobile platform fixes', () => {
  it('TC-FE-058-01 every :hover rule sits under (hover: hover) and (pointer: fine), so a tap never leaves a stuck hover', () => {
    const block = css.match(HOVER_BLOCK)
    expect(block, 'the hover media block exists').not.toBeNull()
    expect(block![0]).toContain('button:hover:not(:disabled)')
    expect(block![0]).toContain('.palette-trigger:hover')
    // The one hover selector left outside only restates the tab's own resting look so the global button hover cannot repaint it.
    const stray = withoutHoverBlock.split('\n').filter((l) => l.includes(':hover'))
    expect(stray.map((l) => l.split('{')[0].trim())).toEqual(['.tab, .tabbar button.tab:hover:not(:disabled)'])
  })

  it('TC-FE-058-02 full-height boxes use dvh, with vh only as the fallback before it', () => {
    const rules = css.split('\n').filter((l) => /\d+vh/.test(l.replace(/\d+dvh/g, '')))
    expect(rules.length).toBeGreaterThan(0)
    for (const l of rules) for (const m of l.matchAll(/(\d+)vh;/g)) expect(l, `${m[0]} has a dvh twin`).toContain(`${m[1]}dvh`)
    expect(css).toContain('min-height: 100dvh')
  })

  it('TC-FE-058-03 text fields are at least 16px, so iOS Safari does not zoom the page on focus', () => {
    expect(css).toMatch(/select, input, textarea \{ font-size: max\(16px, 1rem\); \}/)
    for (const m of css.matchAll(/(?:^|\n)([^{}\n]*\b(?:input|select|textarea)\b[^{}\n]*)\{([^}]*)\}/g)) {
      const size = m[2].match(/font-size:\s*([\d.]+)(px|rem)/)
      if (size) expect(size[2] === 'px' ? Number(size[1]) : Number(size[1]) * 16, m[1]).toBeGreaterThanOrEqual(16)
    }
  })

  it('TC-FE-058-04 the tab bar, the page and the sheets keep off the notch and the home bar', () => {
    const tabbar = css.split('\n').find((l) => l.startsWith('.tabbar {'))!
    expect(tabbar).toContain('env(safe-area-inset-bottom)')
    expect(tabbar).toContain('env(safe-area-inset-left)')
    expect(tabbar).toContain('env(safe-area-inset-right)')
    expect(css.split('\n').find((l) => l.startsWith('main {'))).toContain('env(safe-area-inset-bottom)')
    expect(css.split('\n').find((l) => l.startsWith('.sheet {'))).toContain('env(safe-area-inset-bottom)')
    expect(css.split('\n').find((l) => l.startsWith('.palette-backdrop {'))).toContain('env(safe-area-inset-top)')
    expect(html).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover/)
  })

  it('TC-FE-058-05 controls use touch-action: manipulation and no tap flash', () => {
    const rule = css.split('\n').find((l) => l.includes('touch-action: manipulation'))!
    for (const s of ['a,', 'button,', 'select,', 'input,', 'textarea,', "[role='option']", "[role='menuitem']"]) expect(rule).toContain(s)
    expect(rule).toContain('-webkit-tap-highlight-color: transparent')
  })

  it('TC-FE-058-06 theme-color matches the page background and the page does not scale on rotation', () => {
    const paper = css.match(/--paper:\s*(#[0-9a-f]{6});/i)![1].toLowerCase()
    expect(html).toContain(`<meta name="theme-color" content="${paper}" />`)
    expect(css).toContain('-webkit-text-size-adjust: 100%')
  })
})
