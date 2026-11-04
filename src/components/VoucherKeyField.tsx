import { useEffect } from 'react'

// The voucher key (ADR-06) is not a wallet access key, so listing and offer signatures are made in the browser.
// Its value lives only in the parent component state: not stored, not sent, not in the URL.
// Batch 3 F5 (review BE-063): the key is cleared from the page after VOUCHER_KEY_IDLE_MS without activity on the page, and the user can clear it themselves; non-repeatable actions
// (takedown, file key release) clear it themselves after succeeding.
export const VOUCHER_KEY_IDLE_MS = 10 * 60 * 1000

export function VoucherKeyField({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const held = value !== ''
  useEffect(() => {
    if (!held) return
    let timer = setTimeout(() => onChange(''), VOUCHER_KEY_IDLE_MS)
    const touch = () => {
      clearTimeout(timer)
      timer = setTimeout(() => onChange(''), VOUCHER_KEY_IDLE_MS)
    }
    const events = ['pointerdown', 'keydown'] as const
    for (const name of events) document.addEventListener(name, touch)
    return () => {
      clearTimeout(timer)
      for (const name of events) document.removeEventListener(name, touch)
    }
  }, [held, onChange])
  return (
    <label>
      <span>Voucher key (secret, used only in this browser)</span>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ed25519:…"
        disabled={disabled}
      />
      <small>
        Signs listings, offers, and bundles. Not sent to the server, gone when the page closes, and cleared automatically after {VOUCHER_KEY_IDLE_MS / 60000} minutes without activity.
        {held && <> <button type="button" onClick={() => onChange('')}>Clear key now</button></>}
      </small>
    </label>
  )
}
