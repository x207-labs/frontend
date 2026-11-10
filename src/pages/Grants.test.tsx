import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { grants } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'
import { formatExpiry } from '../lib/format'

const SCRAPER = 'scraper.x207-circle.near'
const TRANSLATOR = 'translator.x207-circle.near'
const rowOf = (id: number) => screen.getByText(`#${id}`, { selector: '.row-id' }).closest('tr') as HTMLElement

describe('FE-017 dashboard grant F8', () => {
  it('TC-FE-017-01 the grantor sees active and revoked grants with class, grantee, status, validity, and reason', async () => {
    renderApp('/access', undefined, false, createMockWallet(SCRAPER, SCRAPER))
    const table = await screen.findByRole('table', { name: 'Grant list' })
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(2)
    const revoked = rowOf(1)
    // FE-073: plain words: the grantor "lends to" the grantee, class B is a login of its own, a default reads "renter did not pay"
    expect(revoked).toHaveTextContent('Lends to translator')
    expect(revoked).toHaveTextContent('near-rpc:access')
    expect(revoked).toHaveTextContent('Own login for the renter')
    expect(revoked).toHaveTextContent('Revoked')
    expect(revoked).toHaveTextContent('renter did not pay')
    expect(revoked).toHaveTextContent('0.05 per day')
    expect(rowOf(2)).toHaveTextContent('Active')
    expect(rowOf(2)).toHaveTextContent('Dec 15, 2026')
  })

  it('TC-FE-017-02 the lessee sees grants as grantee, including expired ones, without grants that are not theirs', async () => {
    renderApp('/access', undefined, false, createMockWallet(TRANSLATOR, TRANSLATOR))
    await screen.findByRole('table', { name: 'Grant list' })
    expect(rowOf(1)).toHaveTextContent('Rents from scraper')
    expect(rowOf(3)).toHaveTextContent('Expired')
    expect(rowOf(3)).toHaveTextContent('time ran out')
    expect(rowOf(3)).toHaveTextContent('Paid endpoint (x402)')
    expect(rowOf(4)).toHaveTextContent(/Lends to|Open offer/)
    expect(rowOf(4)).toHaveTextContent('Offered')
    expect(screen.queryByText('#2', { selector: '.row-id' })).not.toBeInTheDocument()
  })

  it('TC-FE-017-03 the status filter calls the read API with the status and filters the table', async () => {
    const { calls } = renderApp('/access', undefined, false, createMockWallet(SCRAPER, SCRAPER))
    const user = userEvent.setup()
    await screen.findByRole('table', { name: 'Grant list' })
    await user.selectOptions(screen.getByLabelText('Status'), 'active')
    await waitFor(() => expect(calls().some((c) => c.includes('grantor=scraper.x207-circle.near') && c.includes('status=active'))).toBe(true))
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Grant list' })).getAllByRole('row').slice(1)).toHaveLength(1))
    expect(rowOf(2)).toHaveTextContent('Active')
  })

  it('TC-FE-017-04 choosing another member loads the grants of that member; without grants: a message', async () => {
    const { calls } = renderApp('/access', undefined, false, createMockWallet(SCRAPER, SCRAPER))
    const user = userEvent.setup()
    await screen.findByRole('table', { name: 'Grant list' })
    await user.selectOptions(screen.getByLabelText('Member'), 'image.x207-circle.near')
    await waitFor(() => expect(calls().some((c) => c.includes('grantee=image.x207-circle.near'))).toBe(true))
    expect(await screen.findByText('This member has no grants yet.')).toBeInTheDocument()
  })

  it('TC-FE-017-05 a read API error is shown as a message, loading shows first', async () => {
    renderApp('/access', (p) => (p.includes('/grants') ? { ...apiError(503, 'indexer_unavailable'), delayMs: 30 } : undefined), false, createMockWallet(SCRAPER, SCRAPER))
    expect(await screen.findByText(/Loading grants/)).toBeInTheDocument()
    expect((await screen.findAllByText(/indexer_unavailable/)).length).toBeGreaterThan(0)
  })

  it('TC-FE-017-06 formatExpiry reads nanoseconds; a broken value becomes not available; the fixture has four statuses', () => {
    expect(formatExpiry(grants[1]!.expiresAt)).toContain('Dec 15, 2026')
    expect(formatExpiry('not a number')).toBe('not available')
    expect(new Set(grants.map((g) => g.status))).toEqual(new Set(['offered', 'active', 'revoked', 'expired']))
  })
})
