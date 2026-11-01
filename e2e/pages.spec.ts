import { expect, test } from '@playwright/test'

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
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    expect(errors).toEqual([])
  })
}
