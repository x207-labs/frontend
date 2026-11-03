import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const SCRAPER = 'scraper.x207-circle.near'
const NFT = { 'Kontrak NFT': 'nft.near', 'ID token NFT': 't1' }
const FT = { 'Kontrak token': 'token.near', Simbol: 'TKN', 'Desimal token': '6', 'Jumlah token': '2.5' }
const MT = { 'Kontrak multi-token': 'intents.testnet', 'ID token': 'nep141:usdt.tether-token.near', 'Jumlah (satuan terkecil)': '750000' }
const COMMON = { 'Harga (credit)': '10', 'Penawaran berlaku (jam)': '24' }

const KINDS = ['nft', 'ticket', 'game-item', 'coupon', 'license', 'ft', 'rwa', 'lst', 'intents-balance', 'pool-share']

type Case = { kind: string; fields: Record<string, string>; scope: Record<string, string>; warning: RegExp }
const CASES: Case[] = [
  { kind: '1 · NFT NEP-171', fields: NFT, scope: { nft_contract: 'nft.near', token_id: 't1' }, warning: /NFT yang dititipkan dipegang kontrak/ },
  { kind: '2 · Tiket acara (NFT)', fields: { ...NFT, 'Nama acara': 'NEAR Conf', 'Acara mulai (UTC)': '2099-12-01T10:00', 'Acara selesai (UTC)': '2099-12-02T18:00' }, scope: { nft_contract: 'nft.near', token_id: 't1' }, warning: /Tiket hanya berlaku sampai acara selesai/ },
  { kind: '3 · Item game (NFT)', fields: { ...NFT, 'Nama game': 'Dungeons' }, scope: { nft_contract: 'nft.near', token_id: 't1' }, warning: /Nilai item ditentukan oleh game/ },
  { kind: '4 · Kupon atau voucher toko (NFT)', fields: { ...NFT, 'Isi kupon': '20 percent off', 'Berlaku sampai (UTC)': '2099-12-31T00:00' }, scope: { nft_contract: 'nft.near', token_id: 't1' }, warning: /Kode kupon tidak boleh ada di listing/ },
  { kind: '5 · Lisensi software (NFT)', fields: { ...NFT, Produk: 'Editor Pro', 'Hash syarat lisensi (64 hex)': 'ab'.repeat(32), 'Jumlah kursi': '3' }, scope: { nft_contract: 'nft.near', token_id: 't1' }, warning: /Syarat lisensi di terms_hash mengikat pembeli/ },
  { kind: '6 · Token fungible NEP-141', fields: FT, scope: { ft_contract: 'token.near', amount: '2500000' }, warning: /biaya transfer tidak didukung/ },
  { kind: '7 · Token RWA', fields: { ...FT, 'Kontrak lingkaran ada di whitelist token': 'yes', 'Pemberi ada di whitelist token': 'yes' }, scope: { ft_contract: 'token.near', amount: '2500000' }, warning: /Token RWA tunduk pada aturan penerbitnya/ },
  { kind: '8 · Liquid staking token', fields: FT, scope: { ft_contract: 'token.near', amount: '2500000' }, warning: /risiko validator/ },
  { kind: '9 · Saldo NEAR Intents', fields: MT, scope: { mt_contract: 'intents.testnet', token_id: 'nep141:usdt.tether-token.near', amount: '750000' }, warning: /hanya kontrak mock yang diuji/ },
  { kind: '10 · Share pool likuiditas', fields: { 'Nama pool': 'NEAR-USDT', 'Kontrak multi-token (NEP-245)': 'intents.testnet', 'ID token share (NEP-245)': 'nep141:usdt.tether-token.near', 'Jumlah share': '42' }, scope: { mt_contract: 'intents.testnet', token_id: 'nep141:usdt.tether-token.near', amount: '42' }, warning: /Nilai share hanya informasi/ },
]

async function start() {
  renderApp('/marketplace', undefined, false, createMockWallet(SCRAPER, SCRAPER))
  return screen.findByRole('region', { name: 'Template aset on-chain' })
}

/** Selects the kind, then writes the fields (the same section can be filled again for another kind). */
function fill(section: HTMLElement, kind: string, fields: Record<string, string>) {
  fireEvent.change(within(section).getByLabelText('Jenis aset'), { target: { value: KINDS[Number(kind.match(/^\d+/)![0]) - 1] } })
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
    const section = await open(ticket.kind, { ...ticket.fields, 'Acara mulai (UTC)': '2000-01-01T10:00', 'Acara selesai (UTC)': '2000-01-02T10:00' })
    expect(within(section).getByTestId('template-error')).toHaveTextContent('ticket_event_over')
    expect(within(section).queryByRole('button', { name: /Isi sisi/ })).not.toBeInTheDocument()

    const ft = CASES[5]!
    fill(section, ft.kind, { ...ft.fields, 'Jumlah token': '1.1234567' })
    expect(within(section).getByTestId('template-error')).toHaveTextContent('bad_amount')

    const rwa = CASES[6]!
    fill(section, rwa.kind, { ...rwa.fields, 'Kontrak lingkaran ada di whitelist token': 'no' })
    expect(within(section).getByTestId('template-error')).toHaveTextContent('rwa_not_whitelisted')

    const intents = CASES[8]!
    fill(section, intents.kind, { ...intents.fields, 'ID token': 'usdt' })
    expect(within(section).getByTestId('template-error')).toHaveTextContent('intents_token_id')
  })

  it('TC-FE-023-12 a missing field is named, and an RWA token without a whitelist check shows the warning', async () => {
    const rwa = CASES[6]!
    const section = await open(rwa.kind, { ...rwa.fields, 'Kontrak lingkaran ada di whitelist token': '', 'Pemberi ada di whitelist token': '' })
    expect(within(section).getByTestId('template-warnings')).toHaveTextContent('Whitelist token belum diperiksa')
    fill(section, rwa.kind, { ...rwa.fields, 'Kontrak token': '' })
    expect(within(section).getByTestId('template-error')).toHaveTextContent('Isi: Kontrak token')
  })

  it('TC-FE-023-13 apply fills the side "Menawarkan" of the listing form: asset type, class A, one lot, the price, and the detail', async () => {
    const c = CASES[1]!
    const section = await open(c.kind, c.fields)
    fireEvent.click(within(section).getByRole('button', { name: /Isi sisi/ }))
    const form = screen.getByRole('form', { name: 'Buat listing' })
    expect(within(form).getByLabelText('Jenis aset (Menawarkan)')).toHaveValue('ticket:event-nft')
    expect(within(form).getByLabelText('Kelas (Menawarkan)')).toHaveValue('A')
    expect(within(form).getByLabelText('Jumlah (Menawarkan)')).toHaveValue('1')
    expect(within(form).getByLabelText('Nilai credit (Menawarkan)')).toHaveValue('10')
    expect(JSON.parse((within(form).getByLabelText('Detail') as HTMLTextAreaElement).value)).toMatchObject({ kind: 'ticket', event: { name: 'NEAR Conf' } })
  })
})
