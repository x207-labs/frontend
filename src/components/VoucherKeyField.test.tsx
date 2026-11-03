import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VOUCHER_KEY_IDLE_MS, VoucherKeyField } from './VoucherKeyField'

function Host({ initial }: { initial: string }) {
  const [key, setKey] = useState(initial)
  return <VoucherKeyField value={key} onChange={setKey} />
}
const field = () => screen.getByPlaceholderText('ed25519:…') as HTMLInputElement

describe('batch 3 F5 lifetime of the voucher key on the page', () => {
  afterEach(() => vi.useRealTimers())

  it('TC-FE-SEC-22 the key is cleared after the idle time, and activity on the page restarts the time', () => {
    vi.useFakeTimers()
    render(<Host initial="ed25519:secret" />)
    act(() => { vi.advanceTimersByTime(VOUCHER_KEY_IDLE_MS - 1000) })
    expect(field().value).toBe('ed25519:secret')
    act(() => { fireEvent.keyDown(document.body, { key: 'a' }) })
    act(() => { vi.advanceTimersByTime(VOUCHER_KEY_IDLE_MS - 1000) })
    expect(field().value).toBe('ed25519:secret')
    act(() => { vi.advanceTimersByTime(1500) })
    expect(field().value).toBe('')
  })

  it('TC-FE-SEC-23 the user can clear the key at once, and an empty field offers no clear button', () => {
    render(<Host initial="ed25519:secret" />)
    fireEvent.click(screen.getByRole('button', { name: 'Hapus kunci sekarang' }))
    expect(field().value).toBe('')
    expect(screen.queryByRole('button', { name: 'Hapus kunci sekarang' })).toBeNull()
  })
})
