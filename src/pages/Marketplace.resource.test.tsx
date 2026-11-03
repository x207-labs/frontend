import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { createMockWallet } from '../test/walletMock'
import { endpointProblem } from '@x207/core'
import { METERED_KINDS, METERED_PRESETS, toResourceTemplate } from '../lib/resourceForm'

const ME = 'gpu-seller.x207-circle.near'

async function start() {
  renderApp('/marketplace', undefined, false, createMockWallet(ME, ME))
  return screen.findByRole('region', { name: 'Metered resource template' })
}
const pick = (section: HTMLElement, kind: string) => fireEvent.change(within(section).getByLabelText('Resource type'), { target: { value: kind } })
const fill = (section: HTMLElement, label: RegExp, value: string) => fireEvent.change(within(section).getByLabelText(label), { target: { value } })

describe('FE-024 listing form of a metered resource (pipeline P5)', () => {
  it('TC-FE-024-01 all twelve kinds can be listed: asset type of the registry, class D, the unit, the price of one unit and the endpoint in the detail', async () => {
    const section = await start()
    expect(within(within(section).getByLabelText('Resource type')).getAllByRole('option')).toHaveLength(13) // free entry + twelve
    for (const kind of METERED_KINDS) {
      pick(section, kind)
      fill(section, /^Price per unit/, '0.02')
      fill(section, /^Endpoint address/, 'https://provider.example.com/api')
      const detail = JSON.parse(within(section).getByTestId('resource-detail').textContent!)
      expect(detail, kind).toEqual({ kind, unit: METERED_PRESETS[kind].units[0], unit_price: '20000', endpoint: 'https://provider.example.com/api' })
      expect(within(section).queryByTestId('resource-error')).not.toBeInTheDocument()
      expect(within(section).getByTestId('resource-warnings')).toHaveTextContent(METERED_PRESETS[kind].warnings[0]!)
    }
  })

  it('TC-FE-024-02 the estimate follows the unit price and the quantity, rounded up, with the ceiling per request; another unit of the kind can be chosen', async () => {
    const section = await start()
    pick(section, 'storage')
    fill(section, /^Price per unit/, '0.02')
    fill(section, /^Endpoint address/, 'https://s.example.com/x')
    fill(section, /^Estimated number of units/, '2.5')
    expect(within(section).getByTestId('resource-estimate')).toHaveTextContent('Estimated cost for 2.5 GB: 0.05 credit. Limit per request: 1000 GB.')
    fireEvent.change(within(section).getByLabelText('Unit'), { target: { value: 'day' } })
    expect(within(section).getByTestId('resource-estimate')).toHaveTextContent('Estimated cost for 2.5 day: 0.05 credit. Limit per request: 31 day.')
    fill(section, /^Estimated number of units/, 'abc')
    expect(within(section).getByTestId('resource-estimate')).toHaveTextContent('Enter the estimated number of units')
  })

  it('TC-FE-024-03 proxy and home device carry their warning; a bad price or endpoint is refused with the reason and nothing can be applied', async () => {
    const section = await start()
    pick(section, 'proxy-bandwidth')
    fill(section, /^Price per unit/, '0.5')
    fill(section, /^Endpoint address/, 'https://p.example.com/x')
    expect(within(section).getByTestId('resource-warnings')).toHaveTextContent(METERED_PRESETS['proxy-bandwidth'].warnings[1]!)
    pick(section, 'home-device')
    fill(section, /^Price per unit/, '0.5')
    fill(section, /^Endpoint address/, 'https://h.example.com/x')
    expect(within(section).getByTestId('resource-warnings')).toHaveTextContent(METERED_PRESETS['home-device'].warnings[1]!)
    // the endpoint reasons are the wording of @x207/core, so the test reads them from it
    for (const [price, endpoint, reason] of [
      ['0', 'https://h.example.com/x', /Price per unit must be a credit number/],
      ['abc', 'https://h.example.com/x', /Price per unit must be a credit number/],
      ['0.5', 'http://h.example.com/x', endpointProblem('http://h.example.com/x')!],
      ['0.5', 'https://10.0.0.1/x', endpointProblem('https://10.0.0.1/x')!],
      ['0.5', 'https://h.example.com/x?api_key=1', endpointProblem('https://h.example.com/x?api_key=1')!],
      ['0.5', 'https://u:p@h.example.com/x', endpointProblem('https://u:p@h.example.com/x')!],
    ] as const) {
      fill(section, /^Price per unit/, price)
      fill(section, /^Endpoint address/, endpoint)
      expect(within(section).getByTestId('resource-error'), `${price} ${endpoint}`).toHaveTextContent(reason)
      expect(within(section).queryByRole('button', { name: /Fill the/ })).not.toBeInTheDocument()
    }
  })

  it('TC-FE-024-04 apply fills the side "Offering": registry type, class D, one unit at the price of one unit, and the detail', async () => {
    const section = await start()
    pick(section, 'gpu')
    fill(section, /^Price per unit/, '1.5')
    fill(section, /^Endpoint address/, 'https://gpu.example.com/run')
    fireEvent.click(within(section).getByRole('button', { name: /Fill the/ }))
    const form = screen.getByRole('form', { name: 'Create listing' })
    expect(within(form).getByLabelText('Asset type (Offering)')).toHaveValue('compute:gpu-hours')
    expect(within(form).getByLabelText('Class (Offering)')).toHaveValue('D')
    expect(within(form).getByLabelText('Quantity (Offering)')).toHaveValue('1')
    expect(within(form).getByLabelText('Credit value (Offering)')).toHaveValue('1.5')
    expect(JSON.parse((within(form).getByLabelText('Detail') as HTMLTextAreaElement).value)).toEqual({ kind: 'gpu', unit: 'minute', unit_price: '1500000', endpoint: 'https://gpu.example.com/run' })
  })

  it('TC-FE-024-05 a unit that does not fit the kind is refused by the conversion', () => {
    expect(toResourceTemplate({ kind: 'fine-tuning', unit: 'minute', unitPrice: '1', endpoint: 'https://f.example.com/x', quantity: '1' })).toMatch(/does not fit/)
    expect(toResourceTemplate({ kind: '', unit: '', unitPrice: '1', endpoint: 'https://f.example.com/x', quantity: '1' })).toMatch(/Choose a resource type/)
  })
})
