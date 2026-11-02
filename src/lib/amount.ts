const DECIMALS = 6

/** "12.5" -> "12500000" (6 desimal); null bila bukan angka > 0. */
export function toAtomic(input: string): string | null {
  const match = input.trim().match(/^(\d+)(?:[.,](\d{1,6}))?$/)
  if (!match) return null
  const atomic = BigInt(match[1] + (match[2] ?? '').padEnd(DECIMALS, '0'))
  return atomic > 0n ? atomic.toString() : null
}
