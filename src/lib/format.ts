const grouped = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

// Jumlah string satuan terkecil (6 desimal) menjadi credit utuh, tanpa lewat float.
export function formatCredit(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return 'belum tersedia'
  const sign = raw.startsWith('-') ? '-' : raw.startsWith('+') ? '+' : ''
  const digits = raw.replace(/^[-+]/, '').padStart(7, '0')
  const whole = grouped.format(BigInt(digits.slice(0, -6)))
  const fraction = digits.slice(-6).replace(/0+$/, '')
  return `${sign}${whole}${fraction ? `,${fraction}` : ''}`
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return 'belum tersedia'
  return value.toLocaleString('id-ID', { maximumFractionDigits: digits })
}

export function formatPercent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return 'belum tersedia'
  return `${(ratio * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`
}

export function shortAccount(account: string): string {
  return account.replace(/\.x207-circle\.near$/, '')
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return 'belum tersedia'
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC'
}
