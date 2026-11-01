import type { Page } from '@playwright/test'
import { fixtureReply } from '../src/api/fixtures.ts'

export const API_URL = 'http://localhost:8787'

export async function mockApi(page: Page) {
  await page.route(`${API_URL}/**`, async (route) => {
    const url = new URL(route.request().url())
    const reply = fixtureReply(url.pathname + url.search)
    await route.fulfill({
      status: reply.status,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(reply.body),
    })
  })
}
