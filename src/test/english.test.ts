// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LEGACY_ROUTES } from '../legacyRoutes'
import { pages } from '../routes'

// FE-034: the whole frontend is English, routes included. The scan reads every file of src (tests too), drops the comments, and fails on a common Indonesian word. A word that is also
// English or that is a name is not in the list. Code, URLs and error codes are English already.
const src = fileURLToPath(new URL('..', import.meta.url))
const SKIP = new Set(['english.test.ts', 'legacyRoutes.ts'])
const WORDS = [
  'dengan', 'yang', 'tidak', 'untuk', 'dari', 'sudah', 'belum', 'atau', 'dan', 'beli', 'laporkan', 'pesanan', 'kode', 'pembeli', 'penjual', 'siapkan', 'periksa', 'sengketa', 'kunci',
  'jendela', 'anggota', 'kontrak', 'halaman', 'lewati', 'tampilkan', 'konfirmasi', 'dikirim', 'dibayar', 'ditolak', 'harus', 'bukan', 'karena', 'sebelum', 'setelah', 'lisensi', 'sewa',
  'akses', 'penerbit', 'jaminan', 'tonggak', 'penawaran', 'batas', 'nilai', 'masuk', 'keluar', 'gagal', 'berhasil', 'memuat', 'simpan', 'hapus', 'kirim', 'unduh', 'cari', 'pilih',
]
const PATTERN = new RegExp(`(?<![A-Za-z_])(${WORDS.join('|')})(?![A-Za-z_])`, 'i')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(tsx?|css|html)$/.test(name) && !SKIP.has(name) ? [path] : []
  })
}
const withoutComments = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`\\])\/\/.*$/, '$1'))
    .join('\n')

describe('FE-034 the frontend is in English', () => {
  it('TC-FE-034-01 no file of src has a common Indonesian word outside the comments', () => {
    const found: string[] = []
    for (const path of files(src)) {
      withoutComments(readFileSync(path, 'utf8')).split('\n').forEach((line, i) => {
        const m = PATTERN.exec(line)
        if (m) found.push(`${path.slice(src.length)}:${i + 1}: "${m[1]}" in ${line.trim().slice(0, 100)}`)
      })
    }
    expect(found.slice(0, 40)).toEqual([])
  })

  it('TC-FE-034-02 the routes and the titles are English', () => {
    expect(pages.map((p) => p.path)).toEqual([
      '/stats', '/reports', '/charts', '/risk', '/onboarding', '/settlement', '/marketplace', '/invoices', '/orders', '/licenses', '/codes', '/transfers', '/rent', '/access', '/governance',
    ])
    for (const p of pages) expect(PATTERN.test(`${p.path} ${p.title}`), p.path).toBe(false)
  })

  it('TC-FE-034-03 every old path has a new one that exists', () => {
    const paths = new Set(pages.map((p) => p.path))
    for (const [from, to] of Object.entries(LEGACY_ROUTES)) {
      expect(paths.has(to), `${from} -> ${to}`).toBe(true)
      expect(paths.has(from), `${from} is not a route any more`).toBe(false)
    }
  })
})
