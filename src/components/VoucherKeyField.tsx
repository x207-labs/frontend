// Kunci voucher (ADR-06) bukan access key wallet, jadi tanda tangan listing dan penawaran dibuat di browser.
// Nilainya hanya hidup di state komponen induk: tidak disimpan, tidak dikirim, tidak ikut URL.
export function VoucherKeyField({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
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
      <small>Menandatangani listing, penawaran, dan bundle. Tidak dikirim ke server dan hilang saat halaman ditutup.</small>
    </label>
  )
}
