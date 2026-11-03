import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, type Override } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const GPU = 'gpu.x207-circle.near'
const grant = (grantId: number, escrow: object | null, assetType = 'rwa:tokenized') => ({
  grantId, assetType, grantor: GPU, grantee: null, class: 'A', unit: 'once', unitPrice: '10000000', expiresAt: '1793600000000000000', deliveryPubkey: null,
  status: 'offered', revokeReason: null, changedBlock: 5, escrow,
})
const withGrants = (items: object[]): Override => (p) =>
  p.includes('/grants') ? { status: 200, body: { circle: 'agents-main', unit: 'credit', decimals: 6, items, nextCursor: null } } : undefined
const rowOf = (id: number) => screen.getByText(String(id), { selector: 'td.num' }).closest('tr') as HTMLElement

describe('FE-022 escrow of tokens in the grant list', () => {
  it('TC-FE-022-01 a token escrow shows the contract, the exact amount in token units and its state, with the warning about fee tokens', async () => {
    const items = [
      grant(5, { kind: 'ft', ftContract: 'rwa.bond.near', amount: '2500000', state: 'held' }),
      grant(6, { kind: 'nft', nftContract: 'nft.ticket.near', tokenId: 't1', state: 'delivered' }, 'ticket:event-nft'),
      grant(7, null, 'compute:gpu-hours'),
    ]
    renderApp('/akses', withGrants(items), false, createMockWallet(GPU, GPU))
    await screen.findByRole('table', { name: 'Daftar grant' })
    expect(rowOf(5)).toHaveTextContent(/Token\s*rwa\.bond\.near: 2500000 satuan token \(dipegang kontrak\)/)
    expect(rowOf(5)).not.toHaveTextContent('2.500') // token units, not credits
    expect(rowOf(6)).toHaveTextContent(/NFT\s*nft\.ticket\.near #t1 \(sudah diserahkan\)/)
    expect(within(rowOf(7)).getAllByRole('cell').at(-1)).toHaveTextContent('-')
    const warning = screen.getByTestId('ft-escrow-warning')
    expect(warning).toHaveTextContent('Token dengan biaya transfer tidak didukung')
    expect(warning).toHaveTextContent('storage_deposit')
  })

  it('TC-FE-022-02 without a token escrow the warning is not shown, and a grant without the escrow field still renders', async () => {
    const plain = { ...grant(8, null, 'compute:gpu-hours') } as Record<string, unknown>
    delete plain.escrow
    renderApp('/akses', withGrants([plain, grant(6, { kind: 'nft', nftContract: 'nft.ticket.near', tokenId: 't1', state: 'held' }, 'ticket:event-nft')]), false, createMockWallet(GPU, GPU))
    await screen.findByRole('table', { name: 'Daftar grant' })
    expect(screen.queryByTestId('ft-escrow-warning')).not.toBeInTheDocument()
    expect(rowOf(8)).toHaveTextContent('compute:gpu-hours')
  })

  it('TC-FE-022-03 a multi-token escrow shows the contract, the token id, the exact amount in token units and the state, and also brings the token warning', async () => {
    const items = [
      grant(9, { kind: 'mt', mtContract: 'mt.near', tokenId: 'nep141:usdc.tether-token.near', amount: '123456789012345678901', state: 'held' }, 'intents:multi-token'),
      grant(10, { kind: 'mt', mtContract: 'mt.near', tokenId: 'pool:1', amount: '42', state: 'delivered' }, 'amm:lp-share'),
    ]
    renderApp('/akses', withGrants(items), false, createMockWallet(GPU, GPU))
    await screen.findByRole('table', { name: 'Daftar grant' })
    expect(rowOf(9)).toHaveTextContent(/Multi-token\s*mt\.near\s*nep141:usdc\.tether-token\.near: 123456789012345678901 satuan token \(dipegang kontrak\)/)
    expect(rowOf(10)).toHaveTextContent(/Multi-token\s*mt\.near\s*pool:1: 42 satuan token \(sudah diserahkan\)/)
    const warning = screen.getByTestId('ft-escrow-warning')
    expect(warning).toHaveTextContent('Token dengan biaya transfer tidak didukung')
    expect(warning).toHaveTextContent('multi-token')
  })
})
