import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import html from '../../index.html?raw'
import llms from '../../public/llms.txt?raw'
import vercel from '../../vercel.json?raw'

// FE-132: a reader that runs no script (a crawler, an agent, a text browser) gets the dashboard's `index.html`, `/llms.txt` and nothing else. jsdom runs none of these,
// so the tests read the sources. What they cannot show is how the production host answers; that is read from the deployed page after a push.

describe('FE-132 entry for readers that run no script', () => {
  const noscript = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? ''

  it('the page has a noscript paragraph with the figures of the ring of epoch 245, its limits, and the read API, README and docs links', () => {
    expect(html.indexOf('<noscript>')).toBeGreaterThan(html.indexOf('<div id="root">'))
    expect(noscript).toContain('epoch 245')
    expect(noscript).toContain('x207-v018.testnet')
    expect(noscript).toContain('81 credit of trade, 72 cancelled in the loop, 8 mock USDT moved')
    expect(noscript).toContain('mock tokens')
    expect(noscript).toContain('One operator ran all three agents and set the prices')
    const hrefs = [...noscript.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    expect(hrefs).toEqual([
      'https://v018.x207.boxd.sh/x207/circles/agents-main/epochs/245/metrics',
      'https://github.com/x207-labs/x207',
      'https://x207-docs.vercel.app',
    ])
  })

  it('/llms.txt is a file of public/: a title, a one-paragraph summary, absolute links, and the limits', () => {
    expect(llms.startsWith('# x207\n')).toBe(true)
    expect(llms).toMatch(/\n> .+testnet/i)
    expect(llms).toContain('## Limits')
    expect(llms).toContain('https://x207-docs.vercel.app/llms-full.txt')
    for (const [, target] of llms.matchAll(/\]\(([^)]+)\)/g)) expect(target, target).toMatch(/^https:\/\//)
  })

  // The same file lives in the umbrella repository root (live on GitHub); when the frontend is checked out inside it, the two copies must stay equal.
  it.skipIf(!existsSync(resolve(process.cwd(), '..', 'llms.txt')))('public/llms.txt equals the llms.txt of the umbrella repository', () => {
    expect(llms).toBe(readFileSync(resolve(process.cwd(), '..', 'llms.txt'), 'utf8'))
  })

  it('vercel.json serves /llms.txt as text, and its rewrite only catches paths that are not files (a file of public/ is served before a rewrite)', () => {
    const config = JSON.parse(vercel) as { rewrites: { source: string; destination: string }[]; headers: { source: string; headers: { key: string; value: string }[] }[] }
    expect(config.rewrites).toEqual([{ source: '/((?!assets/).*)', destination: '/index.html' }])
    expect(config.headers).toEqual([{ source: '/llms.txt', headers: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }] }])
  })
})
