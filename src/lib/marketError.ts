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
      case 'rate_limited': {
        const wait = typeof e.details?.retryAfter === 'number' ? e.details.retryAfter : null
        return wait === null ? 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' : `Terlalu banyak permintaan. Tunggu ${wait} detik, lalu coba lagi.`
      }
      case 'payload_too_large':
        return 'Isi yang dikirim terlalu besar untuk server. Kecilkan isinya (teks, daftar, atau berkas) lalu coba lagi.'
      case 'open_limit_reached':
        return 'Akun ini sudah punya terlalu banyak pesanan, invoice, atau pembelian yang masih terbuka. Selesaikan atau batalkan salah satunya dulu, lalu coba lagi.'
      case 'grant_failed':
        return /sudah membuka akses yang sama/.test(e.message)
          ? 'Grant lain untuk login dan sumber daya yang sama masih berjalan. Tunggu sampai akses itu berakhir atau dicabut; satu akses tidak boleh dibuka dua kali.'
          : `Penyedia gagal membuka akses: ${e.message}`
      case 'code_not_checked':
        return 'Kode ini harus dicek ke penerbit dulu (atau vonis terakhir sudah lewat 10 menit): kunci tidak dilepas.'
      case 'code_used':
        return 'Penerbit menyatakan kode ini sudah terpakai: pembelian dan listing dibatalkan, kunci tidak dilepas, dan voucher pembeli tidak berpindah.'
      case 'code_unknown':
        return 'Penerbit tidak mengenal kode ini: kunci tidak dilepas.'
      case 'code_issuer_unknown':
        return 'Penerbit kode ini tidak terdaftar di backend ini.'
      case 'code_issuer_unavailable':
        return 'Penerbit tidak menjawab. Belum ada keputusan: coba cek lagi sebentar lagi.'
      case 'code_not_verifiable':
        return 'Penerbit kode ini tidak punya API cek, jadi tidak ada yang dicek.'
      case 'code_bad_commitment':
        return 'Kode dan salt tidak cocok dengan code_commitment di listing.'
      case 'code_bound_to_identity':
        return 'Kode yang terikat pada identitas pemiliknya tidak bisa dijual.'
      case 'exclusive_taken':
        return 'Kode atau konten ini sudah terjual di lingkaran ini.'
      default:
        return `${e.code}: ${e.message}`
    }
  }
  return e instanceof Error ? e.message : String(e)
}
