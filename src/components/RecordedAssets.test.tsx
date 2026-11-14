import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CREDIT_184, RING_245, recordedEpoch } from '../data/recordedRuns'
import { RecordedAssets } from './RecordedAssets'

const v018 = { contract: 'x207-v018.testnet', circle: 'agents-main' }

describe('FE-128 assets delivered in an epoch with a run record', () => {
  it('the record of epoch 245 is one ring: each buyer sells to the next, the prices add up to what was owed, and 72 cleared leaves 9 that netted to 8', () => {
    const legs = RING_245.deliveries
    expect(legs.map((d) => `${d.seller}>${d.buyer}`)).toEqual(['alice>bob', 'bob>dan2', 'dan2>alice'])
    legs.forEach((d, i) => expect(legs[(i + 1) % legs.length].seller).toBe(d.buyer))
    expect(legs.reduce((s, d) => s + d.price, 0)).toBe(RING_245.owed)
    expect(RING_245.owed - RING_245.cleared).toBe(9)
    expect(RING_245.moved).toBe(8)
    expect(legs.map((d) => d.completeEscrow)).toEqual([
      'GWF3npguAhQALgfAjb7evpeDhGYHdWzD1yLwm3yGrp9K',
      '4ajpqavyrhBqhd6uBTMzKVkEAN5XzEtY4RfLXVarA7tz',
      'GmhhMhPjbMoucGJbCU9Qm7FaHXfkRCC1d6KdfeoXkvPz',
    ])
  })

  it('epoch 245 of v018 lists the three NFTs: token, seller to buyer, price and the complete_escrow transaction', () => {
    render(<RecordedAssets {...v018} epoch={245} />)
    const panel = screen.getByRole('region', { name: 'Assets delivered in this epoch' })
    expect(panel).toHaveTextContent('Recorded run on NEAR testnet (AG-055): mock NFTs on nft.x207-b1-aux.testnet')
    expect(panel).toHaveTextContent('Prices were set by the operator, not by the appraiser. One operator played all three members.')
    const rows = within(panel).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.textContent)).toEqual([
      'Software licence NFTag055-1794613317-licensealice → bob24 creditGWF3npgu…',
      'Event ticket NFTag055-1794613317-ticketbob → dan232 credit4ajpqavy…',
      'Game item NFTag055-1794613317-game-itemdan2 → alice25 creditGmhhMhPj…',
    ])
    expect(within(panel).getByRole('link', { name: 'complete_escrow transaction GWF3npguAhQALgfAjb7evpeDhGYHdWzD1yLwm3yGrp9K on NearBlocks' })).toHaveAttribute(
      'href',
      'https://testnet.nearblocks.io/txns/GWF3npguAhQALgfAjb7evpeDhGYHdWzD1yLwm3yGrp9K',
    )
    expect(within(panel).getByRole('link', { name: 'The run record (AG-055)' })).toHaveAttribute('href', RING_245.doc)
  })

  it('epoch 184 of v018 says the ring moved credit only', () => {
    render(<RecordedAssets {...v018} epoch={184} />)
    expect(screen.getByRole('region', { name: 'Assets delivered in this epoch' })).toHaveTextContent('Credit only: no asset changed hands in this ring.')
    expect(recordedEpoch(v018.contract, v018.circle, 184)).toBe(CREDIT_184)
  })

  it('an epoch without a record, or the same epoch on another circle, shows nothing', () => {
    const { container } = render(
      <>
        <RecordedAssets {...v018} epoch={246} />
        <RecordedAssets contract="x207-v017.testnet" circle="agents-main" epoch={245} />
        <RecordedAssets contract="x207-circle.testnet" circle="agents-main" epoch={42} />
      </>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
