# x207 frontend

Dashboard x207 (modul M8), fitur F1, F3, F4, F6, F7: onboarding, grafik kewajiban, statistik kliring, laporan 207, settlement, risiko, dan tata kelola. React + Vite + TypeScript. Bagian dari [`x207-labs/x207`](https://github.com/x207-labs/x207).

## Menjalankan

```bash
cp .env.example .env
npm ci
npm run dev
```

Dashboard terbuka di `http://localhost:5207`.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run build` | Cek tipe dan build statis ke `dist/` |
| `npm test` | Test komponen (Vitest) |
| `npm run test:e2e` | Test browser (Playwright, memakai Chrome terpasang) |
| `npm run lint` | Lint (oxlint) |

## Konfigurasi

Semua variabel ada di `.env.example`. Read API dipoll tiap 5 detik (`VITE_X207_POLL_MS`, K-49). Tanpa backend, setel `VITE_X207_USE_FIXTURES=true` untuk memakai data contoh Spec API Backend.

## Status integrasi

Tipe respons di `src/api/types.ts` ditulis tangan dari Spec API Backend dan diganti impor `@x207/core` setelah npm workspaces payung terpasang (UM-006). Selama backend belum ada, halaman baca hanya teruji terhadap data contoh.

Panel keluar dan tarik stake (`src/components/ExitPanel.tsx`) teruji dengan wallet tiruan dan data contoh. Transaksinya (`request_exit`, `withdraw_stake`, deposit 1 yoctoNEAR) sama dengan `buildRequestExitCall` dan `buildWithdrawStakeCall` di `@x207/core`, yang diuji terhadap kontrak di near-sandbox. Alur dari UI ke near-sandbox belum dijalankan.
