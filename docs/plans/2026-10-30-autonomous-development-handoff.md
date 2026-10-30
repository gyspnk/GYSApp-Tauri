# Rencana induk pengembangan otonom — GYSApp-Tauri

**Tanggal rencana:** 30 Oktober 2026
**Status:** hidup; diperbarui pada setiap siklus eksekusi.
**Repo:** https://github.com/gyspnk/GYSApp-Tauri — branch `main`.
**HEAD saat rencana ini dimulai:** `37ffbd03869447d583771a0a045c0badeb14e2ca`
(identik dengan snapshot handoff 30 Oktober 2026).

Dokumen ini adalah **satu-satunya** catatan status, keputusan dan antrean kerja
otonom untuk pengembangan lanjutan. Rencana historis di `docs/plans/`,
`docs/superpowers/` dan audit bertanggal tetap menjadi bukti pada revisinya
masing-masing; jangan menambah rencana induk baru.

Semua angka di bawah berasal dari eksekusi nyata pada mesin ini. Bedakan selalu:
tes unit, tes browser lokal, preview produksi, hosted CI, perangkat fisik dan
installer bertanda tangan. Yang belum dijalankan ditulis **NOT RUN**.

## 1. Status eksekusi

| Bidang                     | Status pada 30 Oktober 2026 (sesi ini)                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git/worktree               | `main` pada `37ffbd0`, `git fetch origin --prune` tanpa perubahan remote, worktree bersih saat mulai. Satu branch lokal lama (`codex/compact-responsive-ui`) dan 12 branch remote lama ada; tidak disentuh. |
| Toolchain                  | Node `v24.18.0`, pnpm `11.21.0`, corepack `0.35.0`, `node_modules` sudah terpasang.                                                                                                                         |
| Dev server 5173            | **AKTIF dan terverifikasi** (`HTTP 200`, `data-boot="ready"`). Dev server sempat mati karena bug watcher Windows (B-02) dan sudah diperbaiki.                                                               |
| Preview produksi 4173      | NOT RUN pada siklus 1 (dijadwalkan setelah build berikutnya).                                                                                                                                               |
| `pnpm typecheck`           | **PASS** (5 paket).                                                                                                                                                                                         |
| `pnpm test`                | **FAIL → PASS**. Awal: 6 tes gagal pada checkout dengan `apps/web/.env.local` (lihat B-01, B-04). Sekarang: contracts 20, domain 45, testkit 2, bff 74, web 491, plus policy/script — semua lulus.          |
| `pnpm build`               | **PASS**.                                                                                                                                                                                                   |
| `pnpm verify:bundle`       | **PASS**. Initial JS gzip **172,0 KiB** dari 24 modul + `startup.js` (batas 180 KiB); chunk `index-*.js` **84,5 KiB** gzip (batas 250 KiB).                                                                 |
| `pnpm verify:generated`    | **PASS**.                                                                                                                                                                                                   |
| `pnpm verify:docs`         | **PASS**.                                                                                                                                                                                                   |
| `pnpm format:check`        | **FAIL → PASS**. Awal gagal pada 4 berkas di `.superpowers/sdd/` (workspace lokal yang meng-ignore dirinya sendiri; lihat B-03).                                                                            |
| `pnpm verify:prepush`      | NOT RUN (dijalankan menjelang commit slice berikutnya).                                                                                                                                                     |
| Audit UI browser lokal     | **PASS dasar**: 8 route × 4 viewport (320/390/768/1440) = 32 render, semua `200`, `boot=ready`, tanpa page error, tanpa gambar rusak, tanpa overflow horizontal.                                            |
| Baseline performa pengguna | SEBAGIAN: bundle terukur; hero Beranda cold-start terukur ~7 s (B-05). Belum ada median/p95 startup berulang seperti audit 2026-10-11.                                                                      |
| Perbaikan dalam sesi ini   | 1 commit slice: determinisme tes unit, watcher Windows, gate formatting, kunci i18n mati.                                                                                                                   |
| Blocker eksternal          | Deploy Worker, akun e-GYS nyata, signing, perangkat fisik — **BELUM diverifikasi** dan tidak disentuh di sesi ini.                                                                                          |

## 2. Baseline terukur (30 Oktober 2026)

**Lingkungan:** Windows 11, Node 24.18.0, pnpm 11.21.0, Chromium yang dibundel
Playwright 1.62.1, viewport 320×640 / 390×844 / 768×1024 / 1440×900, DPR 1,
locale `id-ID`, service worker diblokir pada probe UI, dev server Vite 8.2.1.
Jaringan: koneksi rumah Indonesia ke Cloudflare Worker `gysapp-tauri-bff` dan
`tjcorguploads.s3.amazonaws.com`. Ini **bukan** benchmark CI dan bukan bukti
performa hosted.

### 2.1 Gate yang benar-benar dijalankan

| Perintah                | Hasil awal sesi                    | Hasil setelah perbaikan | Catatan                                               |
| ----------------------- | ---------------------------------- | ----------------------- | ----------------------------------------------------- |
| `pnpm typecheck`        | PASS                               | PASS                    | 5 paket workspace                                     |
| `pnpm test`             | FAIL (6 tes)                       | PASS                    | lihat B-01 dan B-04                                   |
| `pnpm build`            | PASS                               | PASS                    | `dist` web dibangun ulang                             |
| `pnpm verify:bundle`    | PASS                               | PASS                    | 172,0 KiB / 180 KiB                                   |
| `pnpm verify:generated` | PASS                               | PASS                    |                                                       |
| `pnpm verify:docs`      | PASS                               | PASS                    |                                                       |
| `pnpm format:check`     | FAIL (4 berkas `.superpowers/sdd`) | PASS                    | lihat B-03                                            |
| `pnpm dev` + HTTP probe | HTTP 200                           | HTTP 200                | sempat crash `EBUSY`; lihat B-02                      |
| `pnpm preview` (4173)   | NOT RUN                            | NOT RUN                 | dijadwalkan siklus berikutnya                         |
| `pnpm test:e2e:*`       | NOT RUN                            | NOT RUN                 | akan dijalankan untuk slice UI (`GYS_E2E_PREBUILT=1`) |
| `pnpm test:performance` | NOT RUN                            | NOT RUN                 | butuh build stabil terpisah                           |
| `pnpm native:check`     | NOT RUN                            | NOT RUN                 | toolchain Rust/Android tidak diverifikasi             |

### 2.2 Bundle (gzip, `dist` lokal)

- Initial JS: **172,0 KiB** pada 24 modul + `startup.js` → 8,0 KiB di bawah batas.
- Chunk utama `index-BsTGKmxx.js`: **84,5 KiB** (271,9 KiB mentah) → jauh di bawah batas 250 KiB.
- Runtime besar tetap lazy: `pdf.worker.min` 365,3 KiB, `pdf-document-cache` 123,6 KiB, `bible-search-worker` 23,0 KiB.
- Kesimpulan: budget tidak dilanggar; tidak ada pekerjaan optimisasi yang mendesak dari angka ini.

### 2.3 Matriks route (render lokal, 4 viewport)

| Route        | Render | h1                | Overflow horizontal | Page error | Catatan                                                    |
| ------------ | ------ | ----------------- | ------------------- | ---------- | ---------------------------------------------------------- |
| `/`          | PASS   | Bacaan & nyanyian | tidak               | tidak      | hero Sauh butuh jaringan (B-05)                            |
| `/sauh`      | PASS   | Sauh Bagi Jiwa    | tidak               | tidak      | tautan kembali 18–20 px (B-06)                             |
| `/suara`     | PASS   | Suara Sejati      | tidak               | tidak      | 165 gambar, render 4,1–7,6 s (B-05 keluarga)               |
| `/bible`     | PASS   | Alkitab           | tidak               | tidak      | Kejadian 1 tampil; crossref 40×40 via pseudo-element (OK)  |
| `/kidung`    | PASS   | Kidung            | tidak               | tidak      | katalog + kontrol; belum diuji pemutaran nyata di siklus 1 |
| `/iman`      | PASS   | Dasar Kepercayaan | tidak               | tidak      | 10 pokok iman                                              |
| `/literatur` | PASS   | Literatur         | tidak               | tidak      | 307 gambar katalog                                         |
| `/lainnya`   | PASS   | Lainnya           | tidak               | tidak      | 401 profil akun = sesi anonim (wajar), 403 GIS = origin    |

Temuan konsol yang **bukan** bug produk: `401 /api/v1/account/profile` (belum
login), `403 accounts.google.com/gsi/button` (origin localhost tidak
diizinkan untuk client ID tersebut), `403` GIS logger. Tidak ada `pageerror`.

## 3. Backlog aktif

| ID   | Prioritas | Temuan / sasaran                                                                                  | Bukti                                                                                   | Status  | NEXT spesifik                                                                 |
| ---- | --------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| B-01 | P1        | `pnpm test` merah pada checkout dengan `apps/web/.env.local` (variabel BFF ikut masuk tes unit)   | 6 tes gagal: `online-article` 2, `lazy-image` 2, `music-assets` 1, `i18n` 1             | DONE    | —                                                                             |
| B-02 | P1        | `pnpm dev` mati `EBUSY` di Windows saat tes berjalan (watcher memantau tmpdir konfigurasi Vitest) | stack trace `FSWatcher … .vitest.config.ts.<pid>.<uuid>.tmpdir` di log job dev          | DONE    | —                                                                             |
| B-03 | P2        | `pnpm format:check` gagal karena Prettier memindai `.superpowers/sdd/**` (di-ignore Git)          | 4 berkas `[warn]` lalu `ELIFECYCLE`                                                     | DONE    | —                                                                             |
| B-04 | P2        | Kunci i18n mati `home.directSource` tertinggal setelah commit `6a85347`                           | tes penjaga i18n: `id has keys no component uses`                                       | DONE    | —                                                                             |
| B-05 | P1        | Beranda cold-start: konten Sauh 2,0 s + ilustrasi PNG 692 KB → hero kosong ~7 s                   | probe: konten BFF 1.994 ms/2.525 B, PNG 708.825 B (3,3 s langsung; 0,8 s lewat proxy)   | NEXT    | Ukur ulang dengan cache hangat + SW aktif, lalu perkecil muatan hero          |
| B-06 | P2        | Tautan kembali `a.text-button` di Sauh/Suara hanya 18–20 px tinggi (di bawah minimum 24 px)       | probe target-size: `a.text-button 55x18 "← Beranda"` di `/sauh`, `/suara`, detail Suara | NEXT    | Perluas area klik tanpa menggeser layout; verifikasi keyboard/touch           |
| B-07 | —         | `span.bible-crossref-inline` 8×25 px ternyata **bukan** cacat (area klik 40×40 via `::before`)    | `apps/web/src/ui-hardening.css` aturan `.bible-crossref-inline::before`                 | CLOSED  | —                                                                             |
| B-08 | P2        | Tombol Google Identity Services setinggi 18 px di `/lainnya` (1440)                               | probe: `div.nsm7Bb… 174x18 "Login dengan Google"`                                       | TODO    | Cek apakah tinggi dibatasi container kita; kalau SDK, catat sebagai eksternal |
| B-09 | P3        | Alias route bahasa Indonesia tidak ada: `/alkitab` → halaman 404, hanya `/bible`                  | probe pertama: `h1=Halaman tidak ditemukan` untuk `/alkitab`                            | TODO    | Pertimbangkan redirect `/alkitab` → `/bible`                                  |
| B-10 | P2        | Snapshot `offline/sauh.json` berhenti di 2026-09-28 (32 hari)                                     | `apps/web/public/offline/sauh.json`: item terbaru `sbj260928`                           | TODO    | Cek generator + apakah memang hanya 6 item yang dipanggang                    |
| B-11 | BLOCKED   | Deploy Worker/akun nyata/signing/perangkat fisik                                                  | butuh kredensial & perangkat pemilik                                                    | BLOCKED | Jangan diklaim; uji hanya yang lokal                                          |

## 4. Log siklus

```text
Cycle: 1 | 2026-10-30 09:32–10:05 WIB | main @ 37ffbd0
Issue & priority: gate tes lokal merah (P1), dev server mati saat tes (P1),
  format gate salah gagal (P2), kunci i18n mati (P2).
Reproduction / baseline:
  - `pnpm test` → 6 gagal; `apps/web/.env.local` berisi VITE_BFF_BASE_URL
    (milik pemilik, 2026-08-18), sehingga tes "Worker absen", jalur gambar
    proxy dan sumber MIDI raw-CDN tidak deterministik.
  - `pnpm dev` + `npx vitest run` → dev server exit 1 dengan EBUSY pada
    `.vitest.config.ts.15164.…tmpdir/vitest.config.ts.tmp`.
  - `pnpm format:check` → 4 berkas `.superpowers/sdd/**` (di-ignore Git oleh
    `.superpowers/sdd/.gitignore` berisi `*`).
  - tes i18n → `home.directSource` tidak dipakai komponen mana pun.
Root cause: (a) tes unit mewarisi env deployment lokal; (b) watcher dev
  memantau direktori sementara Vitest; (c) .prettierignore tidak memuat
  workspace lokal yang meng-ignore dirinya; (d) sisa kunci setelah commit
  "drop the Sauh eyebrow".
File dan perubahan:
  apps/web/vitest.config.ts       — pin env VITE_* ke kosong untuk tes unit.
  apps/web/vite.config.ts         — server.watch.ignored: ["**/*.tmpdir/**"].
  apps/web/src/i18n.ts            — hapus home.directSource (id/en/zh).
  .prettierignore                 — tambah .superpowers/.
Verifikasi: PASS — `pnpm typecheck`, `pnpm test` (web 491 + paket lain),
  `pnpm build`, `pnpm verify:bundle` (172,0/180 KiB), `pnpm verify:generated`,
  `pnpm verify:docs`, `pnpm format:check`. Dev server tetap HTTP 200 setelah
  tes penuh dijalankan bersamaan.
UX dan performa sebelum -> sesudah: tidak ada perubahan UI; initial JS tetap
  172,0 KiB; dev server tidak lagi mati saat pengujian.
Screenshot/log/commit/PR: log di `D:\GYSApp-audit\*.log` (di luar repo).
Risiko/regresi, blocker, rollback: perubahan konfigurasi saja; rollback =
  kembalikan 4 berkas. Tidak ada kontrak produk yang berubah.
Status: DONE
NEXT: B-05/B-06 — ukur ulang hero dengan cache hangat, lalu perbaiki target
  sentuh tautan kembali Sauh/Suara dan buktikan dengan tes browser.
```

## 5. Risiko dan batasan bukti

- Angka latensi pada dokumen ini berasal dari satu jaringan rumah, bukan CI.
  Jangan membandingkannya dengan audit 2026-10-11 tanpa metode identik.
- Service worker diblokir pada probe UI sehingga cache offline tidak diuji di
  siklus 1. Semua klaim offline perlu tes tersendiri (`runtime-health.spec.ts`,
  `service-worker-upgrade.spec.ts`).
- Worker hosted (`gysapp-tauri-bff`) adalah artefak terpisah: performanya di
  pengukuran ini adalah performa deployment saat ini, bukan kode repo ini.
- `apps/web/.env.local` adalah konfigurasi lokal pemilik (dibuat 2026-08-18).
  Perbaikan B-01 menyesuaikan tes, **bukan** menghapus konfigurasi tersebut.
- Perangkat fisik, installer bertanda tangan, akun e-GYS nyata dan deploy
  Worker tidak tersedia di sesi ini dan tidak diklaim.

## 6. NEXT yang dapat langsung dikerjakan

1. **B-05** — Ukur hero Beranda dengan service worker aktif dan cache hangat
   (kunjungan kedua), bandingkan dengan cold start; putuskan apakah muatan
   692 KB perlu diganti varian pratinjau atau prioritas fetch diturunkan.
2. **B-06** — Perluas area klik tautan kembali Sauh/Suara minimal 40 px tanpa
   mengubah geometri yang sudah diuji, lalu tambahkan/jalankan tes target.
3. **B-08/B-09/B-10** — Verifikasi tinggi tombol Google, alias `/alkitab`, dan
   kesegaran snapshot Sauh sebelum menyentuh kode.
4. Jalankan `pnpm preview` (4173) dan `pnpm test:e2e:smoke` pada build final
   sebelum mengubah baseline visual.
