# x207 frontend

Dashboard x207 (modul M8): onboarding, grafik kewajiban, statistik kliring, laporan 207, settlement, risiko, dan tata kelola. React + Vite + TypeScript.

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
