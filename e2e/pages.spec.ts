import { expect, test } from '@playwright/test'
import { API_URL, mockApi } from './mockApi.ts'

const routes = [
  ['/onboarding', 'Onboarding'],
  ['/charts', 'Obligation graph'],
  ['/stats', 'Clearing stats'],
  ['/reports', '207 report'],
  ['/settlement', 'Settlement'],
  ['/risk', 'Risk'],
  ['/governance', 'Governance'],
] as const

// TC-FE-001-02
for (const [path, title] of routes) {
  test(`${path} opens without console.error`, async ({ page }) => {
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
test('all data comes from the read API, no view RPC to the contract', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (r) => {
    if (['fetch', 'xhr'].includes(r.resourceType())) requests.push(r.url())
  })
  await mockApi(page)
  await page.goto('/onboarding')
  for (const [, title] of routes) {
    await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: title }).click()
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await page.waitForLoadState('networkidle')
  }
  expect(requests.length).toBeGreaterThan(0)
  expect(requests.filter((u) => !u.startsWith(API_URL))).toEqual([])
})
