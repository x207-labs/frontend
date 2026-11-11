import { describe, expect, it } from 'vitest'
import { formatCredit, formatCredit2, formatNumber, formatPercent } from './format'

describe('format', () => {
  it.each([
    ['2563380000', '2,563.38'],
    ['1820000000', '1,820.00'],
    ['37500000', '37.50'],
    ['-35000000', '-35.00'],
    ['+45000000', '+45.00'],
    ['0', '0.00'],
    ['4999', '0.00'],
    ['5000', '0.01'],
    ['-4999', '0.00'],
    ['-5000', '-0.01'],
  ])('formatCredit2(%s) = %s', (raw, out) => {
    expect(formatCredit2(raw)).toBe(out)
  })
  it('formatCredit2 of a null reads not available', () => {
    expect(formatCredit2(null)).toBe('not available')
  })

  it.each([
    ['1820000000', '1,820'],
    ['37500000', '37.5'],
    ['-35000000', '-35'],
    ['+45000000', '+45'],
    ['0', '0'],
    ['2400', '0.0024'],
    ['340282366920938463463374607431768211455', '340,282,366,920,938,463,463,374,607,431,768.211455'],
  ])('formatCredit(%s) = %s', (raw, out) => {
    expect(formatCredit(raw)).toBe(out)
  })

  it('a null value reads not available, not 0', () => {
    expect(formatCredit(null)).toBe('not available')
    expect(formatNumber(null)).toBe('not available')
    expect(formatPercent(null)).toBe('not available')
  })

  it('ratio', () => {
    expect(formatPercent(0.71)).toBe('71%')
    expect(formatNumber(170.6667)).toBe('170.67')
  })
})
