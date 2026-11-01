import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { members } from '../api/fixtures'
import { apiError, renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const SCRAPER = 'scraper.x207-circle.near'
const NEW = 'newagent.x207-circle.near'

const status = (container: HTMLElement) => container.querySelector('dl[aria-label="Status onboarding"]') as HTMLElement

describe('panel status onboarding', () => {
  it('TC-FE-005-01 anggota active: status, stake 50, limit 50, headroom 37,5', async () => {
    const { container } = renderApp('/onboarding', undefined, false, createMockWallet(SCRAPER, SCRAPER))
    await waitFor(() => expect(status(container)).toHaveTextContent('active'))
    expect(status(container)).toHaveTextContent('Stake50')
    expect(status(container)).toHaveTextContent('Limit kredit50')
    expect(status(container)).toHaveTextContent('Headroom37,5')
  })

  it('TC-FE-005-02 pending berganti active tanpa reload dalam satu interval polling', async () => {
    let calls = 0
    const base = members.find((m) => m.account === SCRAPER)!
    const { container } = renderApp(
      '/onboarding',
      (p) =>
        p.endsWith(`/members/${SCRAPER}`)
          ? { status: 200, body: { circle: 'agents-main', unit: 'credit', decimals: 6, ...base, ...(calls++ < 1 ? { status: 'pending', stake: '0', limit: '0', headroom: '0' } : {}) } }
          : undefined,
      20,
      createMockWallet(SCRAPER, SCRAPER),
    )
    await waitFor(() => expect(status(container)).toHaveTextContent('pending'))
    await waitFor(() => expect(status(container)).toHaveTextContent('active'))
    expect(status(container)).toHaveTextContent('Stake50')
  })

  it('TC-FE-005-03 loading di status dan ketiga angka', async () => {
    const { container } = renderApp(
      '/onboarding',
      (p) => (p.endsWith(`/members/${SCRAPER}`) ? { ...apiError(503, 'x'), status: 200, body: members[0], delayMs: 80 } : undefined),
      false,
      createMockWallet(SCRAPER, SCRAPER),
    )
    await waitFor(() => expect(status(container).querySelectorAll('[role="status"]')).toHaveLength(4))
  })

  it('TC-FE-005-04 belum terdaftar: pesan dengan tautan ke form onboarding', async () => {
    renderApp('/onboarding', undefined, false, createMockWallet(NEW, NEW))
    expect(await screen.findByText(/belum terdaftar/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Isi form bergabung/ })).toHaveAttribute('href', '#bergabung')
  })

  it('TC-FE-005-05 error 503 indexer_unavailable dengan tombol coba lagi', async () => {
    renderApp(
      '/onboarding',
      (p) => (p.endsWith(`/members/${SCRAPER}`) ? apiError(503, 'indexer_unavailable') : undefined),
      false,
      createMockWallet(SCRAPER, SCRAPER),
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('indexer_unavailable')
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument()
  })

  it('TC-FE-005-07 anggota suspended: limit 0 dan headroom 0', async () => {
    const base = members.find((m) => m.account === SCRAPER)!
    const { container } = renderApp(
      '/onboarding',
      (p) =>
        p.endsWith(`/members/${SCRAPER}`)
          ? { status: 200, body: { circle: 'agents-main', unit: 'credit', decimals: 6, ...base, status: 'suspended', limit: '0', headroom: '0' } }
          : undefined,
      false,
      createMockWallet(SCRAPER, SCRAPER),
    )
    await waitFor(() => expect(status(container)).toHaveTextContent('suspended'))
    expect(status(container)).toHaveTextContent('Limit kredit0')
    expect(status(container)).toHaveTextContent('Headroom0')
  })
})
