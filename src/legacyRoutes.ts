// FE-034: the old Indonesian paths of the pages and the English path that each one goes to. This is the only place that keeps the old words; the scan test skips this file.
export const LEGACY_ROUTES: Readonly<Record<string, string>> = {
  '/akses': '/access',
  '/grafik': '/charts',
  '/invoice': '/invoices',
  '/kode': '/codes',
  '/laporan': '/reports',
  '/lisensi': '/licenses',
  '/pesanan': '/orders',
  '/risiko': '/risk',
  '/sewa': '/rent',
  '/statistik': '/stats',
  '/tata-kelola': '/governance',
}
