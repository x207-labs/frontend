const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

// A string amount in the smallest unit (6 decimals) becomes whole credit, without going through a float.
/** Said wherever an epoch whose edges the contract pruned shows figures: they are the indexer's, the chain no longer lists the pairs. */
export const EDGES_PRUNED_NOTE = 'Edges pruned on-chain; figures from the indexer.'

export function formatCredit(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return 'not available'
  const sign = raw.startsWith('-') ? '-' : raw.startsWith('+') ? '+' : ''
  const digits = raw.replace(/^[-+]/, '').padStart(7, '0')
  const whole = grouped.format(BigInt(digits.slice(0, -6)))
  const fraction = digits.slice(-6).replace(/0+$/, '')
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`
}

/** v4 epoch pages: a string amount in the smallest unit (6 decimals) as credit with exactly 2 decimals and thousands separators ("2563380000" -> "2,563.38"), rounded half away from zero.
 * A leading "-" or "+" is kept; a result that rounds to 0.00 has no sign. `not available` for null. */
export function formatCredit2(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return 'not available'
  const sign = raw.startsWith('-') ? '-' : raw.startsWith('+') ? '+' : ''
  const cents = (BigInt(raw.replace(/^[-+]/, '') || '0') + 5000n) / 10000n
  const text = `${grouped.format(cents / 100n)}.${String(cents % 100n).padStart(2, '0')}`
  return cents === 0n ? text : `${sign}${text}`
}

const NS_PER_HOUR = 3_600_000_000_000n

/** Nanoseconds (string or number) to a duration in hours; `null` if unreadable (FE-045, `max_escrow_ttl`). */
export function formatTtl(ns: string | number): string | null {
  try {
    const value = BigInt(ns)
    if (value <= 0n) return null
    const hours = Number(value) / Number(NS_PER_HOUR)
    const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
    return `${text} ${hours === 1 ? 'hour' : 'hours'}`
  } catch {
    return null
  }
}

/** Nanoseconds (string) to a UTC date; `not available` if unreadable. */
export function formatExpiry(ns: string): string {
  try {
    const ms = Number(BigInt(ns) / 1_000_000n)
    return new Date(ms).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC'
  } catch {
    return 'not available'
  }
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return 'not available'
  return value.toLocaleString('en-US', { maximumFractionDigits: digits })
}

export function formatPercent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return 'not available'
  return `${(ratio * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
}

export function shortAccount(account: string): string {
  return account.replace(/\.x207-circle\.near$/, '')
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return 'not available'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC'
}
