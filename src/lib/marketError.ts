import { ApiError } from '../api/client'

// Pesan kesalahan marketplace yang bisa dipahami pengguna; kode lain ditampilkan apa adanya.
export function describeMarketError(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'asset_class_rejected':
        return `Kelas aset ditolak: ${e.message}`
      case 'invalid_signature':
        return 'Tanda tangan tidak cocok dengan kunci voucher yang terdaftar untuk akun ini. Periksa kunci voucher.'
      case 'member_not_active':
        return 'Akun belum aktif sebagai anggota lingkaran.'
      case 'epoch_not_open':
        return 'Tidak ada epoch open yang cocok. Bundle hanya bisa dibuat untuk epoch open saat ini.'
      case 'listing_not_open':
        return 'Listing sudah tidak terbuka (cocok, dibatalkan, atau kedaluwarsa).'
      case 'offer_not_open':
        return 'Penawaran ini sudah dibalas atau ditutup.'
      case 'negotiation_closed':
        return 'Batas ronde negosiasi tercapai.'
      case 'grant_failed':
        return /sudah membuka akses yang sama/.test(e.message)
          ? 'Grant lain untuk login dan sumber daya yang sama masih berjalan. Tunggu sampai akses itu berakhir atau dicabut; satu akses tidak boleh dibuka dua kali.'
          : `Penyedia gagal membuka akses: ${e.message}`
      default:
        return `${e.code}: ${e.message}`
    }
  }
  return e instanceof Error ? e.message : String(e)
}
