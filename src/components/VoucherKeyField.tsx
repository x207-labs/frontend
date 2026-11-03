import { useEffect } from 'react'

// Kunci voucher (ADR-06) bukan access key wallet, jadi tanda tangan listing dan penawaran dibuat di browser.
// Nilainya hanya hidup di state komponen induk: tidak disimpan, tidak dikirim, tidak ikut URL.
// Batch 3 F5 (review BE-063): kunci dihapus dari halaman setelah tak ada aktivitas di halaman selama VOUCHER_KEY_IDLE_MS, dan pengguna bisa menghapusnya sendiri; aksi yang tidak diulang
// (takedown, pelepasan kunci berkas) menghapusnya sendiri setelah berhasil.
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
      <span>Kunci voucher (rahasia, hanya dipakai di browser ini)</span>
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
        Menandatangani listing, penawaran, dan bundle. Tidak dikirim ke server, hilang saat halaman ditutup, dan dihapus otomatis setelah {VOUCHER_KEY_IDLE_MS / 60000} menit tanpa aktivitas.
        {held && <> <button type="button" onClick={() => onChange('')}>Hapus kunci sekarang</button></>}
      </small>
    </label>
  )
}
