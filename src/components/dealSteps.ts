import type { DealEnd, DealGlyphName, DealStop } from './DealTrack'

// FE-084: where each deal status sits on the rail of DealTrack. Kept out of the component file so the component file only exports components.

/** P7 fair exchange (licenses, codes): pay, the seller posts the encrypted item, the seller releases the key, the buyer confirms (or stays silent). */
export const p7Stops = (posted: string): DealStop[] => [
  { label: 'Pay', glyph: 'coin' },
  { label: posted, glyph: 'lock' },
  { label: 'Key released', glyph: 'key' },
  { label: 'Confirmed', glyph: 'check' },
]

export function p7Position(status: string): { done: number; end?: DealEnd } {
  switch (status) {
    case 'paid_held': return { done: 1 }
    case 'cipher_posted': return { done: 2 }
    case 'key_released': return { done: 3 }
    case 'confirmed': return { done: 4 }
    case 'disputed': return { done: 3, end: { tone: 'bad', label: 'Disputed' } }
    case 'refuted': return { done: 3, end: { tone: 'warn', label: 'Dispute rejected', paid: true } }
    case 'cancelled': return { done: 1, end: { tone: 'bad', label: 'Cancelled' } }
    default: return { done: 0 }
  }
}

/** Transfer through a platform (P4): pay, the seller moves the item on the platform, the backend checks the proof, the voucher goes to the seller. */
export const transferStops = (platform: DealGlyphName): DealStop[] => [
  { label: 'Pay', glyph: 'coin' },
  { label: 'Transfer', glyph: platform },
  { label: 'Proof', glyph: 'shield' },
  { label: 'Seller paid', glyph: 'check' },
]

export function transferPosition(status: string): { done: number; end?: DealEnd } {
  switch (status) {
    case 'paid_held': return { done: 1 }
    case 'confirmed': return { done: 4 }
    case 'cancelled': return { done: 1, end: { tone: 'bad', label: 'Cancelled' } }
    default: return { done: 0 }
  }
}

export const PLATFORM_GLYPH: Record<string, DealGlyphName> = { domain: 'globe', game_item: 'gamepad', ticket: 'ticket' }
