import { describe, expect, it } from 'vitest'
import css from '../styles.css?raw'
import html from '../../index.html?raw'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// vitest only passes styles.css through as text (vite.config.ts), so the landing sheet is read from disk.
const landing = readFileSync(resolve(process.cwd(), 'src', 'landing', 'landing.css'), 'utf8')

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

  it('TC-FE-062-01 landing.css: every :hover rule is inside a one-line (hover: hover) and (pointer: fine) block, so a tap never leaves a stuck hover (the v4 landing is styled by landing.css alone, with no global button hover to cancel)', () => {
    const bare = landing.replace(/\/\*[\s\S]*?\*\//g, '')
    const hoverLines = bare.split('\n').filter((l) => l.includes(':hover'))
    expect(hoverLines.length).toBeGreaterThanOrEqual(3)
    const stray = hoverLines.filter((l) => !/^@media \(hover: hover\) and \(pointer: fine\) \{.*\}\s*$/.test(l)).map((l) => l.split('{')[0].trim())
    expect(stray).toEqual([])
  })

  it('TC-FE-062-02 landing.css: the page box has a dvh height; every pinned box has an svh twin after its vh; the 520vh story is scroll distance, not a visible box', () => {
    const bare = landing.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(bare).toMatch(/min-height: 100vh;\s*min-height: 100dvh;/)
    expect(bare).toContain('height: 100svh')
    expect(bare).toMatch(/\.lp \.story \{ height: 520vh;/)
    // Any other bare vh must be followed, in the same rule, by the same value in svh or dvh.
    const bareVh = bare.split('\n').flatMap((l) => [...l.matchAll(/([\w-]+):\s*(\d+)vh;/g)].map((m) => ({ line: l, prop: m[1], n: m[2] })))
    expect(bareVh.length).toBeGreaterThan(0)
    for (const { line, prop, n } of bareVh) {
      const pinned = prop === 'height' && n === '520' && line.includes('.story')
      if (!pinned) expect(line, `${prop}: ${n}vh has an svh or dvh twin`).toMatch(new RegExp(`${prop}:\\s*${n}(?:s|d)vh;`))
    }
  })

  it('TC-FE-063-03 on a touch screen (pointer: coarse) buttons, fields and navigation links are at least 44 px tall', () => {
    const block = css.match(/@media \(pointer: coarse\) \{[\s\S]*?\n\}/)
    expect(block, 'the coarse-pointer block exists').not.toBeNull()
    const body = block![0]
    for (const s of ['button,', 'select,', 'input,', '.rail a,', '.sheet a,', '.account-menu .item,', '.palette li,', '.palette-trigger,', '.account-trigger', 'button.th-sort']) expect(body).toContain(s)
    expect(body.match(/min-height: 2\.75rem/g)!.length).toBeGreaterThanOrEqual(2) // 2.75rem is 44 px
    // The block sits after every other rule that sets a min-height on these selectors, so it wins at equal weight.
    const after = css.slice(css.indexOf(block![0]) + block![0].length)
    expect(after).not.toMatch(/(?:\.rail a|\.sheet a|\.account-menu \.item|\.palette li|\.palette-trigger|\.account-trigger|button\.th-sort)[^{}\n]*\{[^}]*min-height/)
  })

  it('TC-FE-058-06 theme-color matches the page background and the page does not scale on rotation', () => {
    const paper = css.match(/--paper:\s*(#[0-9a-f]{6});/i)![1].toLowerCase()
    expect(html).toContain(`<meta name="theme-color" content="${paper}" />`)
    expect(css).toContain('-webkit-text-size-adjust: 100%')
  })
})
