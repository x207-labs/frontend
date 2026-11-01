import { expect, test } from '@playwright/test'
import { API_URL, mockApi } from './mockApi.ts'

const routes = [
  ['/onboarding', 'Onboarding'],
  ['/grafik', 'Grafik kewajiban'],
  ['/statistik', 'Statistik kliring'],
  ['/laporan', 'Laporan 207'],
  ['/settlement', 'Settlement'],
  ['/risiko', 'Risiko'],
  ['/tata-kelola', 'Tata kelola'],
] as const

// TC-FE-001-02
for (const [path, title] of routes) {
  test(`${path} terbuka tanpa console.error`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(e.message))
    await mockApi(page)
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(errors).toEqual([])
  })
}

// TC-FE-002-06
test('semua data dari read API, tanpa RPC view ke kontrak', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (r) => {
    if (['fetch', 'xhr'].includes(r.resourceType())) requests.push(r.url())
  })
  await mockApi(page)
  await page.goto('/onboarding')
  for (const [, title] of routes) {
    await page.getByRole('navigation', { name: 'Halaman' }).getByRole('link', { name: title }).click()
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await page.waitForLoadState('networkidle')
  }
  expect(requests.length).toBeGreaterThan(0)
  expect(requests.filter((u) => !u.startsWith(API_URL))).toEqual([])
})
