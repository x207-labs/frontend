import { describe, expect, it } from 'vitest'
import { formatCredit, formatNumber, formatPercent } from './format'

describe('format', () => {
  it.each([
    ['1820000000', '1.820'],
    ['37500000', '37,5'],
    ['-35000000', '-35'],
    ['+45000000', '+45'],
    ['0', '0'],
    ['2400', '0,0024'],
    ['340282366920938463463374607431768211455', '340.282.366.920.938.463.463.374.607.431.768,211455'],
  ])('formatCredit(%s) = %s', (raw, out) => {
    expect(formatCredit(raw)).toBe(out)
  })

  it('nilai null ditulis belum tersedia, bukan 0', () => {
    expect(formatCredit(null)).toBe('belum tersedia')
    expect(formatNumber(null)).toBe('belum tersedia')
    expect(formatPercent(null)).toBe('belum tersedia')
  })

  it('rasio', () => {
    expect(formatPercent(0.71)).toBe('71%')
    expect(formatNumber(170.6667)).toBe('170,67')
  })
})
