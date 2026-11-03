import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const SCRAPER = 'scraper.x207-circle.near'
const NFT = { 'NFT contract': 'nft.near', 'NFT token ID': 't1' }
const FT = { 'Token contract': 'token.near', Symbol: 'TKN', 'Token decimals': '6', 'Token amount': '2.5' }
const MT = { 'Multi-token contract': 'intents.testnet', 'Token ID': 'nep141:usdt.tether-token.near', 'Amount (smallest unit)': '750000' }
const COMMON = { 'Price (credit)': '10', 'Offer valid for (hours)': '24' }

const KINDS = ['nft', 'ticket', 'game-item', 'coupon', 'license', 'ft', 'rwa', 'lst', 'intents-balance', 'pool-share']

// The risk warnings come from @x207/core (buildAssetTemplate); the test checks that each kind carries at least one, not the wording.
type Case = { kind: string; fields: Record<string, string>; scope: Record<string, string>; warning: RegExp }
const CASES: Case[] = [
  { kind: '1 · NFT NEP-171', fields: NFT, scope: { nft_contract: 'nft.near', token_id: 't1' }, warning: /\S/ },
  { kind: '2 · Event ticket (NFT)', fields: { ...NFT, 'Event name': 'NEAR Conf', 'Event starts (UTC)': '2099-12-01T10:00', 'Event ends (UTC)': '2099-12-02T18:00' }, scope: { nft_contract: 'nft.near', token_id: 't1' }, warning: /\S/ },
  { kind: '3 · Game item (NFT)', fields: { ...NFT, 'Game name': 'Dungeons' }, scope: { nft_contract: 'nft.near', token_id: 't1' }, warning: /\S/ },
  { kind: '4 · Store coupon or voucher (NFT)', fields: { ...NFT, 'Coupon content': '20 percent off', 'Valid until (UTC)': '2099-12-31T00:00' }, scope: { nft_contract: 'nft.near', token_id: 't1' }, warning: /\S/ },
  { kind: '5 · Software license (NFT)', fields: { ...NFT, Product: 'Editor Pro', 'License terms hash (64 hex)': 'ab'.repeat(32), 'Number of seats': '3' }, scope: { nft_contract: 'nft.near', token_id: 't1' }, warning: /\S/ },
  { kind: '6 · Fungible token NEP-141', fields: FT, scope: { ft_contract: 'token.near', amount: '2500000' }, warning: /\S/ },
  { kind: '7 · RWA token', fields: { ...FT, 'Circle contract is on the token whitelist': 'yes', 'Grantor is on the token whitelist': 'yes' }, scope: { ft_contract: 'token.near', amount: '2500000' }, warning: /\S/ },
  { kind: '8 · Liquid staking token', fields: FT, scope: { ft_contract: 'token.near', amount: '2500000' }, warning: /\S/ },
  { kind: '9 · NEAR Intents balance', fields: MT, scope: { mt_contract: 'intents.testnet', token_id: 'nep141:usdt.tether-token.near', amount: '750000' }, warning: /\S/ },
  { kind: '10 · Liquidity pool share', fields: { 'Pool name': 'NEAR-USDT', 'Multi-token contract (NEP-245)': 'intents.testnet', 'Share token ID (NEP-245)': 'nep141:usdt.tether-token.near', 'Share amount': '42' }, scope: { mt_contract: 'intents.testnet', token_id: 'nep141:usdt.tether-token.near', amount: '42' }, warning: /\S/ },
]

async function start() {
  renderApp('/marketplace', undefined, false, createMockWallet(SCRAPER, SCRAPER))
  return screen.findByRole('region', { name: 'On-chain asset template' })
}

/** Selects the kind, then writes the fields (the same section can be filled again for another kind). */
function fill(section: HTMLElement, kind: string, fields: Record<string, string>) {
  fireEvent.change(within(section).getByLabelText('Asset type'), { target: { value: KINDS[Number(kind.match(/^\d+/)![0]) - 1] } })
  for (const [label, value] of Object.entries({ ...fields, ...COMMON })) {
    fireEvent.change(within(section).getByLabelText(new RegExp(`^${label.replace(/[()]/g, '\\$&')}`)), { target: { value } })
  }
}

async function open(kind: string, fields: Record<string, string>) {
  const section = await start()
  fill(section, kind, fields)
  return section
}

describe('FE-023 listing form per kind of asset (batch 1)', () => {
  for (const c of CASES) {
    it(`TC-FE-023-${String(CASES.indexOf(c) + 1).padStart(2, '0')} ${c.kind}: valid fields give the scope of the contract and the risk warning`, async () => {
      const section = await open(c.kind, c.fields)
      expect(within(section).queryByTestId('template-error')).not.toBeInTheDocument()
      expect(JSON.parse(within(section).getByTestId('template-scope').textContent!)).toEqual(c.scope)
      expect(within(section).getByTestId('template-warnings')).toHaveTextContent(c.warning)
      expect(JSON.parse(within(section).getByTestId('template-detail').textContent!).kind).toBe(KINDS[CASES.indexOf(c)])
    })
  }

  it('TC-FE-023-11 one invalid listing per group is refused with the code of the SDK, and nothing can be applied', async () => {
    const ticket = CASES[1]!
    const section = await open(ticket.kind, { ...ticket.fields, 'Event starts (UTC)': '2000-01-01T10:00', 'Event ends (UTC)': '2000-01-02T10:00' })
    expect(within(section).getByTestId('template-error')).toHaveTextContent('ticket_event_over')
    expect(within(section).queryByRole('button', { name: /Fill the/ })).not.toBeInTheDocument()

    const ft = CASES[5]!
    fill(section, ft.kind, { ...ft.fields, 'Token amount': '1.1234567' })
    expect(within(section).getByTestId('template-error')).toHaveTextContent('bad_amount')

    const rwa = CASES[6]!
    fill(section, rwa.kind, { ...rwa.fields, 'Circle contract is on the token whitelist': 'no' })
    expect(within(section).getByTestId('template-error')).toHaveTextContent('rwa_not_whitelisted')

    const intents = CASES[8]!
    fill(section, intents.kind, { ...intents.fields, 'Token ID': 'usdt' })
    expect(within(section).getByTestId('template-error')).toHaveTextContent('intents_token_id')
  })

  it('TC-FE-023-12 a missing field is named, and an RWA token without a whitelist check shows the warning', async () => {
    const rwa = CASES[6]!
    const section = await open(rwa.kind, { ...rwa.fields, 'Circle contract is on the token whitelist': '', 'Grantor is on the token whitelist': '' })
    const unchecked = within(section).getByTestId('template-warnings').querySelectorAll('li').length
    fill(section, rwa.kind, { ...rwa.fields, 'Circle contract is on the token whitelist': 'yes', 'Grantor is on the token whitelist': 'yes' })
    expect(within(section).getByTestId('template-warnings').querySelectorAll('li').length).toBeLessThan(unchecked) // the whitelist warning goes away once both are checked
    fill(section, rwa.kind, { ...rwa.fields, 'Token contract': '' })
    expect(within(section).getByTestId('template-error')).toHaveTextContent('Fill in: Token contract')
  })

  it('TC-FE-023-13 apply fills the side "Offering" of the listing form: asset type, class A, one lot, the price, and the detail', async () => {
    const c = CASES[1]!
    const section = await open(c.kind, c.fields)
    fireEvent.click(within(section).getByRole('button', { name: /Fill the/ }))
    const form = screen.getByRole('form', { name: 'Create listing' })
    expect(within(form).getByLabelText('Asset type (Offering)')).toHaveValue('ticket:event-nft')
    expect(within(form).getByLabelText('Class (Offering)')).toHaveValue('A')
    expect(within(form).getByLabelText('Quantity (Offering)')).toHaveValue('1')
    expect(within(form).getByLabelText('Credit value (Offering)')).toHaveValue('10')
    expect(JSON.parse((within(form).getByLabelText('Detail') as HTMLTextAreaElement).value)).toMatchObject({ kind: 'ticket', event: { name: 'NEAR Conf' } })
  })
})
