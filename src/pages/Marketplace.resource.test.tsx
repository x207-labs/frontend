import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'
import { METERED_KINDS, METERED_PRESETS, toResourceTemplate } from '../lib/resourceForm'

const ME = 'gpu-seller.x207-circle.near'

async function start() {
  renderApp('/marketplace', undefined, false, createMockWallet(ME, ME))
  return screen.findByRole('region', { name: 'Template sumber daya terukur' })
}
const pick = (section: HTMLElement, kind: string) => fireEvent.change(within(section).getByLabelText('Jenis sumber daya'), { target: { value: kind } })
const fill = (section: HTMLElement, label: RegExp, value: string) => fireEvent.change(within(section).getByLabelText(label), { target: { value } })

describe('FE-024 listing form of a metered resource (pipeline P5)', () => {
  it('TC-FE-024-01 all twelve kinds can be listed: asset type of the registry, class D, the unit, the price of one unit and the endpoint in the detail', async () => {
    const section = await start()
    expect(within(within(section).getByLabelText('Jenis sumber daya')).getAllByRole('option')).toHaveLength(13) // free entry + twelve
    for (const kind of METERED_KINDS) {
      pick(section, kind)
      fill(section, /^Harga per satuan/, '0.02')
      fill(section, /^Alamat endpoint/, 'https://provider.example.com/api')
      const detail = JSON.parse(within(section).getByTestId('resource-detail').textContent!)
      expect(detail, kind).toEqual({ kind, unit: METERED_PRESETS[kind].units[0], unit_price: '20000', endpoint: 'https://provider.example.com/api' })
      expect(within(section).queryByTestId('resource-error')).not.toBeInTheDocument()
      expect(within(section).getByTestId('resource-warnings')).toHaveTextContent(/paling banyak rugi satu satuan/)
    }
  })

  it('TC-FE-024-02 the estimate follows the unit price and the quantity, rounded up, with the ceiling per request; another unit of the kind can be chosen', async () => {
    const section = await start()
    pick(section, 'storage')
    fill(section, /^Harga per satuan/, '0.02')
    fill(section, /^Alamat endpoint/, 'https://s.example.com/x')
    fill(section, /^Perkiraan jumlah satuan/, '2.5')
    expect(within(section).getByTestId('resource-estimate')).toHaveTextContent('Perkiraan biaya 2.5 GB: 0.05 credit. Batas per request: 1000 GB.')
    fireEvent.change(within(section).getByLabelText('Satuan'), { target: { value: 'day' } })
    expect(within(section).getByTestId('resource-estimate')).toHaveTextContent('Perkiraan biaya 2.5 day: 0.05 credit. Batas per request: 31 day.')
    fill(section, /^Perkiraan jumlah satuan/, 'abc')
    expect(within(section).getByTestId('resource-estimate')).toHaveTextContent('Isi perkiraan jumlah satuan')
  })

  it('TC-FE-024-03 proxy and home device carry their warning; a bad price or endpoint is refused with the reason and nothing can be applied', async () => {
    const section = await start()
    pick(section, 'proxy-bandwidth')
    fill(section, /^Harga per satuan/, '0.5')
    fill(section, /^Alamat endpoint/, 'https://p.example.com/x')
    expect(within(section).getByTestId('resource-warnings')).toHaveTextContent('hukum setempat')
    pick(section, 'home-device')
    fill(section, /^Harga per satuan/, '0.5')
    fill(section, /^Alamat endpoint/, 'https://h.example.com/x')
    expect(within(section).getByTestId('resource-warnings')).toHaveTextContent('Listrik')
    for (const [price, endpoint, reason] of [
      ['0', 'https://h.example.com/x', /Harga per satuan harus angka/],
      ['abc', 'https://h.example.com/x', /Harga per satuan harus angka/],
      ['0.5', 'http://h.example.com/x', /harus https/],
      ['0.5', 'https://10.0.0.1/x', /bukan alamat IP/],
      ['0.5', 'https://h.example.com/x?api_key=1', /kredensial di query/],
      ['0.5', 'https://u:p@h.example.com/x', /nama pengguna/],
    ] as const) {
      fill(section, /^Harga per satuan/, price)
      fill(section, /^Alamat endpoint/, endpoint)
      expect(within(section).getByTestId('resource-error'), `${price} ${endpoint}`).toHaveTextContent(reason)
      expect(within(section).queryByRole('button', { name: /Isi sisi/ })).not.toBeInTheDocument()
    }
  })

  it('TC-FE-024-04 apply fills the side "Menawarkan": registry type, class D, one unit at the price of one unit, and the detail', async () => {
    const section = await start()
    pick(section, 'gpu')
    fill(section, /^Harga per satuan/, '1.5')
    fill(section, /^Alamat endpoint/, 'https://gpu.example.com/run')
    fireEvent.click(within(section).getByRole('button', { name: /Isi sisi/ }))
    const form = screen.getByRole('form', { name: 'Buat listing' })
    expect(within(form).getByLabelText('Jenis aset (Menawarkan)')).toHaveValue('compute:gpu-hours')
    expect(within(form).getByLabelText('Kelas (Menawarkan)')).toHaveValue('D')
    expect(within(form).getByLabelText('Jumlah (Menawarkan)')).toHaveValue('1')
    expect(within(form).getByLabelText('Nilai credit (Menawarkan)')).toHaveValue('1.5')
    expect(JSON.parse((within(form).getByLabelText('Detail') as HTMLTextAreaElement).value)).toEqual({ kind: 'gpu', unit: 'minute', unit_price: '1500000', endpoint: 'https://gpu.example.com/run' })
  })

  it('TC-FE-024-05 a unit that does not fit the kind is refused by the conversion', () => {
    expect(toResourceTemplate({ kind: 'fine-tuning', unit: 'minute', unitPrice: '1', endpoint: 'https://f.example.com/x', quantity: '1' })).toMatch(/tidak cocok/)
    expect(toResourceTemplate({ kind: '', unit: '', unitPrice: '1', endpoint: 'https://f.example.com/x', quantity: '1' })).toMatch(/Pilih jenis/)
  })
})
