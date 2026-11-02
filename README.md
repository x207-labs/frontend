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

Panel keluar dan tarik stake (`src/components/ExitPanel.tsx`) teruji dua cara. Dengan wallet tiruan dan data contoh (`ExitPanel.test.tsx`, 7 test). Dan terhadap near-sandbox (`src/test/exit.sandbox.test.tsx`, hanya jalan di umbrella dengan `X207_SANDBOX=1`): halaman dirender dengan read API nyata (indexer atas kontrak nyata), tombol "Minta keluar" mengirim `request_exit`, keeper menutup epoch itu sampai `finalized`, tombol "Tarik stake" terbuka dan mengirim `withdraw_stake`, lalu stake kembali sebagai USDT dan halaman menampilkan status `exited`. Batas (K-60): yang diganti di test itu hanya `WalletPort` (penandatangan akun sandbox); NEAR Connect dengan wallet nyata hanya bisa dicoba di testnet oleh manusia dan belum dicoba.
