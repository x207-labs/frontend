import { describe, expect, it, vi } from 'vitest'
import type { EpochItem, Paged } from './api/types'
import { SEARCH_PAGE, SEARCH_PAGES, hasClearing, listKnowsClearing, searchEpochs } from './epochSearch'

const item = (epoch: number, cleared: string | null = '0', phase: EpochItem['phase'] = 'finalized'): EpochItem => ({ epoch, phase, cleared }) as EpochItem
const page = (items: EpochItem[], nextCursor: string | null): Paged<EpochItem> => ({ items, nextCursor }) as Paged<EpochItem>

describe('FE-118 epoch search', () => {
  it('TC-FE-118-01 hasClearing: only a finalized epoch with a cleared total above zero', () => {
    expect(hasClearing(item(8, '21800000'))).toBe(true)
    expect(hasClearing(item(8, '0'))).toBe(false)
    expect(hasClearing(item(8, null))).toBe(false)
    expect(hasClearing(item(8, 'abc'))).toBe(false)
    // an epoch still moving through its phases is never the default, even with a cleared total
    expect(hasClearing(item(8, '21800000', 'payment_window'))).toBe(false)
  })

  it('TC-FE-118-02 listKnowsClearing: a read API without `cleared` in the list keeps the old metrics scan', () => {
    expect(listKnowsClearing([item(3, '0'), item(2, null)])).toBe(true)
    expect(listKnowsClearing([{ epoch: 3, phase: 'finalized' } as EpochItem])).toBe(false)
    expect(listKnowsClearing([])).toBe(false)
  })

  it('TC-FE-118-03 searchEpochs walks the pages by cursor and stops at the first match', async () => {
    const read = vi.fn(async (cursor: string) =>
      cursor === 'p2' ? page([item(149), item(148)], 'p3') : cursor === 'p3' ? page([item(147), item(146, '72000000'), item(145, '5')], 'p4') : page([], null),
    )
    expect(await searchEpochs('p2', hasClearing, undefined, read)).toMatchObject({ epoch: 146 })
    expect(read.mock.calls).toEqual([
      ['p2', SEARCH_PAGE],
      ['p3', SEARCH_PAGE],
    ])
  })

  it('TC-FE-118-04 searchEpochs stops once `past` says the rest is older, at the end of the list, and after SEARCH_PAGES pages', async () => {
    const past = vi.fn(async () => page([item(50), item(39), item(38)], 'more'))
    expect(await searchEpochs('c', (e) => e.epoch === 40, (e) => e.epoch < 40, past)).toBeNull()
    expect(past).toHaveBeenCalledTimes(1)

    const end = vi.fn(async () => page([item(2)], null))
    expect(await searchEpochs('c', hasClearing, undefined, end)).toBeNull()
    expect(end).toHaveBeenCalledTimes(1)

    const endless = vi.fn(async () => page([item(1)], 'again'))
    expect(await searchEpochs('c', hasClearing, undefined, endless)).toBeNull()
    expect(endless).toHaveBeenCalledTimes(SEARCH_PAGES)

    const none = vi.fn()
    expect(await searchEpochs(null, hasClearing, undefined, none)).toBeNull()
    expect(none).not.toHaveBeenCalled()
  })
})
