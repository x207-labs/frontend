// Security review of the frontend (UM-063 follow-up): data that other users or the chain supply is shown as text, never as markup or as a link
// target of our choosing; external links carry rel; no VITE_* variable holds a secret. Findings and what was not checked: ../../docs/security-review.md.
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { listings } from '../api/fixtures'
import { renderApp, type Override } from './render'

// Source files as text, read by Vite (no node types in this project). Tests and the test folder are left out.
const files = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!../test/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const indexHtml = (import.meta.glob('../../index.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['../../index.html']!

describe('keamanan frontend: sumber', () => {
  it('TC-FE-SEC-10 tidak ada sink HTML atau eksekusi dari string', () => {
    for (const [file, text] of Object.entries(files)) {
      expect(text, file).not.toMatch(/dangerouslySetInnerHTML|\binnerHTML\b|insertAdjacentHTML|\bouterHTML\b|document\.write|\beval\(|new Function\(|javascript:/)
    }
  })

  it('TC-FE-SEC-11 tiap target="_blank" membawa rel dengan noreferrer atau noopener, dan href tautan data berawalan tetap', () => {
    for (const [file, text] of Object.entries(files)) {
      for (const match of text.matchAll(/<a\b[^>]*>/g)) {
        const tag = match[0]
        if (/target=["']_blank["']/.test(tag)) expect(tag, `${file}: ${tag}`).toMatch(/rel=["'][^"']*(noreferrer|noopener)/)
        const href = /href=\{?[`"']([^`"']*)/.exec(tag)?.[1]
        if (href !== undefined) expect(href, `${file}: ${tag}`).toMatch(/^(#|\/|\$\{[A-Z_]+\}|https:\/\/)/)
      }
    }
  })

  it('TC-FE-SEC-12 variabel VITE_* hanya berisi alamat, id dan pilihan; tidak ada nama rahasia', () => {
    const names = new Set<string>()
    for (const text of Object.values(files)) for (const m of text.matchAll(/VITE_[A-Z0-9_]+/g)) names.add(m[0])
    expect([...names].sort()).toEqual(['VITE_NEAR_NETWORK', 'VITE_NEAR_RPC_URL', 'VITE_X207_API_URL', 'VITE_X207_BROKER_URL', 'VITE_X207_CIRCLE', 'VITE_X207_CONTRACT_ID', 'VITE_X207_INTENTS_EXPLORER_URL', 'VITE_X207_POLL_MS', 'VITE_X207_USE_FIXTURES'])
    for (const name of names) expect(name).not.toMatch(/KEY|SECRET|TOKEN|PRIVATE|PASSWORD|JWT|MNEMONIC|SEED/)
  })

  it('TC-FE-SEC-15 index.html membatasi object, base dan form, dan tidak membocorkan referrer', () => {
    const html = indexHtml
    expect(html).toMatch(/Content-Security-Policy"[^>]*object-src 'none'[^>]*base-uri 'none'[^>]*form-action 'self'/)
    expect(html).toMatch(/name="referrer" content="no-referrer"/)
  })

  it('TC-FE-SEC-13 kunci voucher tidak disimpan: localStorage hanya memegang penanda sambungan wallet', () => {
    for (const [file, text] of Object.entries(files)) {
      for (const m of text.matchAll(/(?:localStorage|sessionStorage)\.setItem\(([^,)]+)/g)) expect(m[1], file).toBe('CONNECTED_FLAG')
      expect(text, file).not.toMatch(/indexedDB|document\.cookie|console\.(log|debug|info)\(.*(key|Key)/)
    }
  })
})

describe('keamanan frontend: data dari pengguna lain', () => {
  const hostile = {
    ...listings[0],
    account: 'javascript:alert(1)',
    offer: { ...listings[0].offer, assetType: '<img src=x onerror=alert(1)>' },
    want: { ...listings[0].want, assetType: '"><script>window.__pwned=1</script>' },
    terms: '<a href="javascript:alert(2)">klik</a>',
    detail: '<svg onload=alert(3)>',
  }

  it('TC-FE-SEC-14 listing dengan markup dan javascript: tampil sebagai teks, tanpa elemen baru dan tanpa tautan berbahaya', async () => {
    const override: Override = (path) => (path.includes('/listings') && !/listings\/[0-9a-f]{64}/.test(path) ? { status: 200, body: { items: [hostile], total: 1, nextCursor: null } } : undefined)
    const before = document.querySelectorAll('script').length
    renderApp('/marketplace', override)
    expect(await screen.findByText(/<img src=x onerror=alert\(1\)> · kelas D/)).toBeInTheDocument()
    expect(document.querySelectorAll('img[src="x"], svg[onload], [onerror], [onload]')).toHaveLength(0)
    expect(document.querySelectorAll('script')).toHaveLength(before)
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
    for (const a of Array.from(document.querySelectorAll('a[href]'))) expect(a.getAttribute('href')).not.toMatch(/^\s*javascript:/i)
  })
})
