# Rencana induk pengembangan otonom — GYSApp-Tauri

**Tanggal rencana:** 30 Oktober 2026
**Status:** hidup; diperbarui pada setiap siklus eksekusi.
**Repo:** https://github.com/gyspnk/GYSApp-Tauri — branch `main`.
**HEAD saat rencana ini dimulai:** `37ffbd03869447d583771a0a045c0badeb14e2ca`
(identik dengan snapshot handoff 30 Oktober 2026).
**Branch kerja sesi ini:** `codex/autonomous-hardening-20261030` (lokal, belum
di-push; `main` tidak disentuh).

Dokumen ini adalah **satu-satunya** catatan status, keputusan dan antrean kerja
otonom untuk pengembangan lanjutan. Rencana historis di `docs/plans/`,
`docs/superpowers/` dan audit bertanggal tetap menjadi bukti pada revisinya
masing-masing; jangan menambah rencana induk baru.

Semua angka di bawah berasal dari eksekusi nyata pada mesin ini. Bedakan selalu:
tes unit, tes browser lokal, preview produksi, hosted CI, perangkat fisik dan
installer bertanda tangan. Yang belum dijalankan ditulis **NOT RUN**.

## 1. Status eksekusi

| Bidang                     | Status pada 30 Oktober 2026 (sesi ini)                                                                                                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git/worktree               | `main` pada `37ffbd0`; sesi lanjutan ini bekerja dari clone bersih `codex/autonomous-hardening-20261030` (HEAD awal `20de439`, 17 commit di atas `main`). `main` tidak disentuh; setiap siklus di-commit dan di-push.                                                                                                                 |
| Toolchain                  | Host sesi lanjutan: **Linux aarch64**, Node `v26.12.1`, pnpm `11.21.0` (dipasang via npm; corepack tidak tersedia), Playwright `1.62.1` + Chromium `151.0.7922.34` (unduhan + lib sistem Arch ARM). `apps/web/.env.local` **tidak ada** di clone ini, jadi tes unit deterministik.                                                    |
| Dev server 5173            | **AKTIF** di `http://127.0.0.1:5173/` dengan `VITE_BFF_BASE_URL` Worker hosted (env proses, bukan `.env.local`). Probe 4 route: `boot=ready`, 0 gambar rusak, 0 overflow; satu-satunya 403 adalah tombol GIS (origin tak terdaftar). Dipakai pemilik untuk preview tiap perubahan.                                                    |
| Preview produksi 4173      | **AKTIF** di `http://127.0.0.1:4173/GYSApp-Tauri/` (dist tanpa env BFF); dipakai seluruh e2e.                                                                                                                                                                                                                                         |
| `pnpm typecheck`           | **PASS** (5 paket).                                                                                                                                                                                                                                                                                                                   |
| `pnpm test`                | **PASS** (dijalankan ulang di host ini): contracts 20, domain 45, testkit 2, bff 74, web 511, plus 62 tes skrip root.                                                                                                                                                                                                                 |
| `pnpm build`               | **PASS** (dijalankan 7×; build terakhir `index-BJ_eAuG7.js`).                                                                                                                                                                                                                                                                         |
| `pnpm verify:bundle`       | **PASS**. Initial JS gzip **179,0 KiB** dari 24 modul + `startup.js`; batas 180 KiB → sisa **1,0 KiB**. Chunk `index-*.js` **84,4 KiB** (batas 250 KiB).                                                                                                                                                                              |
| `pnpm verify:generated`    | **PASS** (1229 music items, 533 hymns, 10 offline assets, 299/300 literature covers).                                                                                                                                                                                                                                                 |
| `pnpm verify:docs`         | **PASS** (sebelum dan sesudah pembaruan dokumen ini).                                                                                                                                                                                                                                                                                 |
| `pnpm format:check`        | **PASS** (Prettier memeriksa seluruh repo, termasuk berkas yang diubah siklus 11).                                                                                                                                                                                                                                                    |
| e2e terarah (Chromium 151) | **PASS**: `more-section-deeplink` 5/5, `universal-usability` 10/10, `menu-motion` 12/12, `account-menu` 4/4, `kidung-section-navigation` 6/6, `accessibility`+`editorial-ui` 35/35, `mobile-scroll-kidung` 10/10 (termasuk coarse pointer), `midi-scrub` 3/3, `kidung-loading` 2/2, `kidung-usability` dock 2/2. Semua `--retries=0`. |
| `pnpm verify:prepush`      | **PASS** pada siklus 8; siklus 11 menjalankan gate yang sama secara terpisah (format, docs, provenance, tipe, unit, policy, skrip root).                                                                                                                                                                                              |
| Audit UI browser lokal     | **PASS dasar**: 8 route × 4 viewport (320/390/768/1440) = 32 render, semua `200`, `boot=ready`, tanpa page error, tanpa gambar rusak, tanpa overflow horizontal.                                                                                                                                                                      |
| Baseline performa pengguna | SEBAGIAN: bundle terukur; hero Beranda cold 5,3 s / warm 0,49 s (B-05, MEASURED). Belum ada median/p95 startup berulang seperti audit 2026-10-11.                                                                                                                                                                                     |
| Perbaikan siklus 11        | Grup More dikembalikan ke **collapsed** + reveal deep link dari React (bug 768/1440); grid kontrol Kidung `max-content` (12 px sel mati); kontras label akun `--navy`; landmark Diagnostik unik; live region pencarian persisten; delapan kontrak e2e basi (dock, tempo, split view, chord, literatur, nav) diperbarui.               |
| Blocker eksternal          | Konfirmasi pesan WhatsApp nyata, langkah kredensial Apple, akun e-GYS nyata, deploy Worker (termasuk endpoint `suara-sejati` yang menggantung), signing, perangkat fisik — **BELUM diverifikasi**; rincian bukti di 2.5.                                                                                                              |
| CI (GitHub Actions)        | Bukan gate lagi (kebijakan pemilik: uji penuh lokal). PR **#11** tetap terbuka untuk review; **jangan merge sendiri**.                                                                                                                                                                                                                |

## 2. Baseline terukur (30 Oktober 2026)

**Lingkungan:** Windows 11, Node 24.18.0, pnpm 11.21.0, Chromium yang dibundel
Playwright 1.62.1, viewport 320×640 / 390×844 / 768×1024 / 1440×900, DPR 1,
locale `id-ID`, service worker diblokir pada probe UI, dev server Vite 8.2.1.
Jaringan: koneksi rumah Indonesia ke Cloudflare Worker `gysapp-tauri-bff` dan
`tjcorguploads.s3.amazonaws.com`. Ini **bukan** benchmark CI dan bukan bukti
performa hosted.

### 2.1 Gate yang benar-benar dijalankan

| Perintah                  | Hasil awal sesi                    | Hasil setelah perbaikan | Catatan                                          |
| ------------------------- | ---------------------------------- | ----------------------- | ------------------------------------------------ |
| `pnpm typecheck`          | PASS                               | PASS                    | 5 paket workspace                                |
| `pnpm test`               | FAIL (6 tes)                       | PASS                    | lihat B-01 dan B-04                              |
| `pnpm build`              | PASS                               | PASS                    | `dist` web dibangun ulang                        |
| `pnpm verify:bundle`      | PASS                               | PASS                    | 172,0 KiB / 180 KiB                              |
| `pnpm verify:generated`   | PASS                               | PASS                    |                                                  |
| `pnpm verify:docs`        | PASS                               | PASS                    |                                                  |
| `pnpm format:check`       | FAIL (4 berkas `.superpowers/sdd`) | PASS                    | lihat B-03                                       |
| `pnpm dev` + HTTP probe   | HTTP 200                           | HTTP 200                | sempat crash `EBUSY`; lihat B-02                 |
| `pnpm preview` (4173)     | NOT RUN                            | HTTP 200                | dipakai seluruh e2e                              |
| `pnpm test:e2e egys-v1`   | FAIL 8 / 20                        | PASS 20 / 20            | lihat B-12, B-13                                 |
| `pnpm test:e2e` (lainnya) | NOT RUN                            | NOT RUN                 | belum dijalankan; jangan klaim suite penuh hijau |
| `pnpm test:performance`   | NOT RUN                            | NOT RUN                 | butuh build stabil terpisah                      |
| `pnpm native:check`       | NOT RUN                            | NOT RUN                 | toolchain Rust/Android tidak diverifikasi        |

### 2.2 Bundle (gzip, `dist` lokal)

- Initial JS: **172,0 KiB** pada 24 modul + `startup.js` → 8,0 KiB di bawah batas.
- Chunk utama `index-*.js`: **84,5 KiB** (271,9 KiB mentah) → jauh di bawah batas 250 KiB.
- Runtime besar tetap lazy: `pdf.worker.min` 365,3 KiB, `pdf-document-cache` 123,6 KiB, `bible-search-worker` 23,0 KiB.
- Kesimpulan: budget tidak dilanggar; tidak ada pekerjaan optimisasi mendesak dari angka ini.

### 2.3 Matriks route (render lokal, 4 viewport)

| Route        | Render | h1                | Overflow horizontal | Page error | Catatan                                                   |
| ------------ | ------ | ----------------- | ------------------- | ---------- | --------------------------------------------------------- |
| `/`          | PASS   | Bacaan & nyanyian | tidak               | tidak      | hero Sauh butuh jaringan (B-05)                           |
| `/sauh`      | PASS   | Sauh Bagi Jiwa    | tidak               | tidak      | tautan kembali diperbaiki pada B-06                       |
| `/suara`     | PASS   | Suara Sejati      | tidak               | tidak      | 164 kartu dari snapshot dalam 924 ms walau Worker macet   |
| `/bible`     | PASS   | Alkitab           | tidak               | tidak      | Kejadian 1 tampil; crossref 40×40 via pseudo-element (OK) |
| `/kidung`    | PASS   | Kidung            | tidak               | tidak      | 533 tombol lagu; klik mengubah URL ke `/kidung/hymn-001`  |
| `/iman`      | PASS   | Dasar Kepercayaan | tidak               | tidak      | 10 pokok iman                                             |
| `/literatur` | PASS   | Literatur         | tidak               | tidak      | 306 tautan katalog, detail terbuka dengan h1              |
| `/lainnya`   | PASS   | Lainnya           | tidak               | tidak      | 401 profil akun = sesi anonim (wajar), 403 GIS = origin   |

Temuan konsol yang **bukan** bug produk: `401 /api/v1/account/profile` (belum
login), `403 accounts.google.com/gsi/button` (origin localhost tidak diizinkan
untuk client ID tersebut). Tidak ada `pageerror` di seluruh 32 render.

### 2.4 Audit lintas-sumbu (tema, ukuran teks, keyboard, offline, media)

Diukur pada preview produksi (`http://127.0.0.1:4173/GYSApp-Tauri/`) dan dev
`5173`, Chromium Playwright 1.62.1, viewport 390×844 dan 1280×900.

| Sumbu                                  | Metode                                                                                                                  | Hasil                                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Tema gelap & AMOLED                    | 8 route × 2 tema × 2 skala = 32 render; cek overflow, teks terpotong, rasio kontras WCAG AA dihitung dari warna efektif | **PASS** — 0 overflow, 0 teks terpotong, 0 pelanggaran kontras (4,5:1 teks normal, 3:1 teks besar)                                |
| Skala teks 200%                        | `html` 16px → 32px (mekanisme `rem` yang sama dengan e2e `system-text-scale`)                                           | **PASS** — tidak ada overflow horizontal di 7 route; judul display tetap 56px sesuai token                                        |
| Keyboard                               | 22 Tab per route; fokus hilang/tertutup, indikator fokus, posisi elemen                                                 | **PASS** — 21–22 stop unik, fokus tidak pernah jatuh ke `body`, indikator ada (via `:focus-within` pembungkus)                    |
| Offline (service worker)               | Kunjungi sekali, tunggu SW mengontrol, `setOffline(true)`, reload + 4 route                                             | **PASS** — 4 cache shell; reload offline **91 ms**; `/bible`, `/kidung`, `/literatur`, `/iman` penuh                              |
| Disiplin gambar katalog                | `/suara` (165 `<img>`) dan `/literatur` (307 `<img>`) selama 4 s + satu kali scroll                                     | **PASS** — hanya 14–17 permintaan gambar; 302/307 bertanda `lazy`; bertambah 3–9 setelah scroll                                   |
| PDF Literatur (range, halaman pertama) | Buka item `?read=1`, tunggu canvas pertama                                                                              | **PASS** — halaman pertama tergambar **5,0 s** (discovery `pdf-source` 4,3 s di Worker; eksternal)                                |
| MIDI Kidung (FluidSynth + timGM6mb)    | Buka hymn-001, chip MIDI, tunggu transport, klik "Putar"                                                                | **PASS** — seek 0 → 1 → 5 dtk, tampilan `0:05 / 2:44`, tombol berubah "Jeda", tanpa error; aset `.mid`/`.sf2`/`libfluidsynth` 200 |
| Suara saat endpoint Worker menggantung | `/suara` dengan `suara-sejati` menggantung                                                                              | **PASS** — 164 kartu dari snapshot dalam 924 ms (baseline offline-first bekerja)                                                  |
| Pencarian Alkitab di ponsel            | 390 px, klik ikon "Buka pencarian ayat di Alkitab", ketik "kasih", Enter, worker + hasil                                | **PASS** — panel `is-open` 126 px, input benar-benar dapat diklik, worker `bible-search-worker` jalan, hasil "Kejadian 6:8 …"     |
| Asersi fokus per-elemen (metode awal)  | Heuristik `outline`/`box-shadow` pada elemen fokus                                                                      | **FALSE POSITIVE** — indikator sebenarnya ada di pembungkus `:focus-within`; diverifikasi ulang per elemen                        |

### 2.5 Bukti login e-GYS (permintaan pemilik, 30 Oktober 2026)

Diuji terhadap **Worker hosted** yang dikonfigurasi `apps/web/.env.local`
(`gysapp-tauri-bff.pas-presensi.workers.dev`), bukan mock, dan bukan akun nyata.

| Langkah                                  | Bukti                                                                                                                                                                                    | Status  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `POST /api/v1/auth/egys/whatsapp/start`  | `200` dalam 1,1 s; `referenceid`, `mobilephone` bot `6285176756451`, `content` berisi "No. Ref"; cookie `egys_wa_reference` HttpOnly/Partitioned                                         | PASS    |
| Tab WhatsApp direservasi & dibuka        | popup `about:blank` → `https://api.whatsapp.com/send?phone=…&text=…Ref…`; `window.opener === null`                                                                                       | PASS    |
| `WS /api/v1/auth/egys/whatsapp/track`    | upgrade sukses; frame `{"type":"connected"}` dan `{"type":"info","message":"Success open socket in server"}`; badge "Menunggu pesan WhatsApp"                                            | PASS    |
| `POST …/whatsapp/confirm` (kode salah)   | `400 VALIDATION_ERROR` — rute sehat, menolak kode tidak valid                                                                                                                            | PASS    |
| Konfirmasi pesan nyata (kirim WhatsApp)  | butuh ponsel pemilik; tidak dapat dijalankan agent                                                                                                                                       | BLOCKED |
| `POST /api/v1/auth/egys/google` (kosong) | `400 VALIDATION_ERROR` — rute sehat                                                                                                                                                      | PASS    |
| Apple: SDK + authorize popup             | SDK `appleid.auth.js` `200`; popup resmi terbuka dengan `client_id=id.or.gys.e.client`, `redirect_uri=https://e.gys.or.id/login`, `state` acak; halaman Apple berbahasa Indonesia tampil | PASS    |
| Apple: langkah kredensial                | butuh Apple ID nyata; tidak dapat dijalankan agent                                                                                                                                       | BLOCKED |

Kesimpulan jujur: **plumbing WhatsApp dan inisialisasi Apple terbukti bekerja
terhadap layanan nyata**, tetapi konfirmasi pesan WhatsApp yang dilaporkan gagal
belum dapat direproduksi tanpa ponsel/akun pemilik. Yang diperbaiki di sesi ini
adalah bagian yang bisa salah secara diam-diam: pembacaan frame tracking dan
diagnostiknya (B-14), bukan klaim bahwa penyebabnya sudah ditemukan.

### 2.6 Sesi lanjutan di host Linux (30 Oktober 2026, 21:28–22:40 WIB)

Sesi ini berjalan pada **mesin yang berbeda** dari sesi Windows di atas: container
Linux aarch64 (Node 26.12.1, pnpm 11.21.0, Chromium 151 hasil unduhan Playwright).
Repo di-clone bersih dari remote; `main` tidak disentuh. Angka di bawah adalah
pengukuran baru dan **tidak boleh dibandingkan** dengan tabel 2.1 tanpa metode
identik.

| Perintah / bukti          | Hasil host ini | Catatan                                                                |
| ------------------------- | -------------- | ---------------------------------------------------------------------- |
| `pnpm typecheck`          | PASS (5 paket) | `tsc -b` bersih setelah seluruh perubahan siklus 11                    |
| `pnpm test`               | PASS           | 20 + 45 + 2 + 74 + 511 tes + 62 tes skrip root                         |
| `pnpm build`              | PASS           | `index-BJ_eAuG7.js`; dist dipakai semua e2e                            |
| `pnpm verify:bundle`      | PASS           | **179,0 KiB / 180**; `index-*.js` **84,4 KiB**                         |
| `pnpm verify:generated`   | PASS           | provenance aset dan font editorial                                     |
| `pnpm verify:docs`        | PASS           | sebelum dan sesudah dokumen ini diperbarui                             |
| `pnpm format:check`       | PASS           | seluruh repo, termasuk 11 berkas yang diubah                           |
| `pnpm audit --prod`       | NOT RUN        | tidak dijalankan ulang; hasil `zod` 4.6.6 dari siklus 10 tetap berlaku |
| `pnpm native:check`       | NOT RUN        | Rust/Android tidak terpasang di host ini                               |
| Suite penuh e2e (823 tes) | lihat §4       | `--workers=3 --retries=0` tanpa proses browser lain yang berjalan      |

Catatan lingkungan yang memengaruhi pembacaan hasil:

- **Playwright belum ter-bootstrap** di host ini. Chromium 151 harus diunduh dan
  lib sistem Arch ARM (nss, atk, libx11, mesa, alsa-lib, at-spi2-core, dll.)
  dipasang sebelum satu tes browser pun bisa jalan. Repo tidak menyediakan
  langkah itu; catat sebagai biaya setup host baru, bukan cacat produk.
- `apps/web/.env.local` milik pemilik **tidak ada**. Semua e2e berjalan pada
  origin lokal tanpa Worker, sehingga asersi "Worker absen" deterministik.
  Untuk preview pemilik, dev server dijalankan dengan `VITE_BFF_BASE_URL` sebagai
  env proses saja (tidak ditulis ke `.env.local`, tidak masuk ke `dist`).
- Spesifikasi axe yang berat (`editorial-ui`, `accessibility`) gagal karena
  timeout 40 dtk bila empat worker berebut CPU ARM; pada `--workers=2` keduanya
  lulus 35/35. Itu batas host, bukan regresi produk.
- Chromium di sini **151**, sedangkan CI memakai versi yang sama dari Playwright
  1.62.1; tidak ada perbedaan versi browser yang perlu dicatat.
- **Koreksi bukti Worker:** dari host ini `/api/v1/content/sauh` menjawab `200`
  dalam 2,0 s dan `/api/v1/content/suara-sejati` `200` dalam 2,8 s (30 Okt
  21:40 WIB), sedangkan sesi Windows mencatat `suara-sejati` menggantung >25 s
  (B-17). Proxy gambar Worker juga menjawab 708.825 B dalam 0,47 s. Jangan
  menyimpulkan Worker "sudah diperbaiki permanen": ukur ulang dari perangkat
  pemilik sebelum menutup keluhan itu.

## 3. Backlog aktif

| ID   | Prioritas | Temuan / sasaran                                                                                                                                                                     | Bukti                                                                                                                                                                                                                                                   | Status   | NEXT spesifik                                                                                                                                                                   |
| ---- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-01 | P1        | `pnpm test` merah pada checkout dengan `apps/web/.env.local` (variabel BFF ikut masuk tes unit)                                                                                      | 6 tes gagal: `online-article` 2, `lazy-image` 2, `music-assets` 1, `i18n` 1                                                                                                                                                                             | DONE     | —                                                                                                                                                                               |
| B-02 | P1        | `pnpm dev` mati `EBUSY` di Windows saat tes berjalan (watcher memantau tmpdir konfigurasi Vitest)                                                                                    | stack trace `FSWatcher … .vitest.config.ts.<pid>.<uuid>.tmpdir` di log job dev                                                                                                                                                                          | DONE     | —                                                                                                                                                                               |
| B-03 | P2        | `pnpm format:check` gagal karena Prettier memindai `.superpowers/sdd/**` (di-ignore Git)                                                                                             | 4 berkas `[warn]` lalu `ELIFECYCLE`                                                                                                                                                                                                                     | DONE     | —                                                                                                                                                                               |
| B-04 | P2        | Kunci i18n mati `home.directSource` tertinggal setelah commit `6a85347`                                                                                                              | tes penjaga i18n: `id has keys no component uses`                                                                                                                                                                                                       | DONE     | —                                                                                                                                                                               |
| B-05 | P1        | Beranda cold-start: konten Sauh 2,0 s + ilustrasi PNG 692 KB → hero kosong ~5,3 s di kunjungan pertama                                                                               | cold: boot 581 ms, hero 5.318 ms; warm: boot 260 ms, hero 485 ms; warmer: 510 ms; gambar 754×528, 708.825 B                                                                                                                                             | MEASURED | Tidak ada perubahan kode: biaya sekali di kunjungan pertama; konversi format butuh deploy Worker                                                                                |
| B-06 | P2        | Tautan kembali `a.text-button` di Sauh/Suara hanya 17–20 px tinggi (di bawah minimum 24 px)                                                                                          | sebelum: `55x18`, klik 10 px di atas/bawah meleset; sesudah: pseudo `inset-block:-12px` → 71×42 px, `elementFromPoint` kena, baris tetap 17–18 px                                                                                                       | DONE     | — (dijaga e2e `responsive-touch-targets`)                                                                                                                                       |
| B-07 | —         | `span.bible-crossref-inline` 8×25 px ternyata **bukan** cacat (area klik 40×40 via `::before`)                                                                                       | `apps/web/src/ui-hardening.css` aturan `.bible-crossref-inline::before`                                                                                                                                                                                 | CLOSED   | —                                                                                                                                                                               |
| B-08 | —         | Angka "18 px" pada tombol Google ternyata elemen label internal GIS; kontrol provider sebenarnya 363×51 px (1440) dan 97×44 px (390)                                                 | probe `probe-google`: `.egys-google-control` 363×51; rantai elemen dalam 21/20 px; iframe GIS 0×0 karena origin localhost ditolak                                                                                                                       | CLOSED   | Bukan cacat; tombol GIS nyata hanya bisa diukur pada origin yang diizinkan Google                                                                                               |
| B-09 | P3        | Alias route bahasa Indonesia tidak ada: `/alkitab` → 404, hanya `/bible`                                                                                                             | probe awal: `h1=Halaman tidak ditemukan`; sesudah redirect, e2e `navigation-layout` membuktikan `/alkitab` → `/bible` dan Kejadian 1 tampil                                                                                                             | DONE     | —                                                                                                                                                                               |
| B-10 | P2        | Snapshot `offline/sauh.json` berhenti di 2026-09-28 (32 hari)                                                                                                                        | item terbaru `sbj260928` pada `apps/web/public/offline/sauh.json`; `scripts/` tidak punya generator sauh (hanya literature/hymn/manifest)                                                                                                               | WONTFIX  | Snapshot hanya baseline offline kunjungan pertama; setelah online, `fetchSauh` menyegarkan cache. Menyegarkan file butuh data live dan keputusan pemilik — bukan perbaikan kode |
| B-11 | BLOCKED   | Deploy Worker/akun nyata/signing/perangkat fisik                                                                                                                                     | butuh kredensial & perangkat pemilik                                                                                                                                                                                                                    | BLOCKED  | Jangan diklaim; uji hanya yang lokal                                                                                                                                            |
| B-12 | P2        | Label "WhatsApp" terpotong 2 px di layar 320 px (tombol provider overflow)                                                                                                           | e2e `egys-v1` 320 px: `scrollWidth 74 > clientWidth 72`; probe mengukur `overflow: 2`                                                                                                                                                                   | DONE     | — (ikon-saja ≤280 px container, aria-label tetap)                                                                                                                               |
| B-13 | P1        | Dua kontrak e2e e-GYS basi membuat suite merah di HEAD (geometri baris provider & badge akun bergantung env)                                                                         | uji A/B: 7 gagal di HEAD; sesudah perbaikan 0 gagal                                                                                                                                                                                                     | DONE     | —                                                                                                                                                                               |
| B-14 | P1        | Tracking WhatsApp hanya menerima satu bentuk field dan gagal senyap bila payload berbeda                                                                                             | parser lama: `message.refid === reference` + `mobilePhone` + `otp` saja; kini ada unit test 20 kasus                                                                                                                                                    | DONE     | Pantau diagnosa `egys.whatsapp.tracking.event` pada percobaan pemilik                                                                                                           |
| B-15 | P2        | Konfirmasi WhatsApp nyata belum terbukti; kegagalan tidak terlihat di UI                                                                                                             | 2.5: semua langkah sebelum pesan nyata PASS; Diagnostik kini mencatat frame & field yang tidak lengkap                                                                                                                                                  | NEXT     | Minta pemilik mengirim pesan lalu membaca entri `egys.whatsapp.*`                                                                                                               |
| B-16 | P2        | Apple belum diuji sampai kredensial                                                                                                                                                  | popup resmi Apple tampil; langkah kredensial butuh Apple ID                                                                                                                                                                                             | BLOCKED  | Uji di origin terdaftar dengan akun nyata                                                                                                                                       |
| B-17 | P1        | Pencarian global macet "Menyiapkan indeks lokal…" dan hanya mengembalikan ayat Alkitab                                                                                               | `/api/v1/content/suara-sejati` di Worker hosted tidak pernah menjawab (timeout >25 s, 2×); indeks menunggu refresh tanpa batas; sesudah `withRequestDeadline(3 s)` indeks siap ~2 s dan "Pujilah Allah" mengembalikan 4 kidung + ayat                   | DONE     | Host Linux 30 Okt: `200` dalam 2,8 s — ukur ulang dari perangkat pemilik                                                                                                        |
| B-18 | P2        | Tiga asersi smoke basi: eyebrow "Sauh hari ini" (dihapus `6a85347`) dan klik `summary` yang kini membalik grup terbuka default                                                       | `home and more fixed chrome…` gagal di `getByText("Today’s Sauh")` lalu `.appearance-card` hidden; `home uses Sauh…` gagal di `.verse-panel .section-heading`; sesudah perbaikan keduanya lulus                                                         | DONE     | —                                                                                                                                                                               |
| B-19 | P2        | Tes smoke "MIDI queue" juga menutup grup `hymns` dengan klik `summary` (default terbuka), lalu tombol "Antrean MIDI" bergeser di bawah heading `offline`                             | smoke `MIDI queue persists…`: 73 retry + `<div class="more-card-heading">` menutupi pointer; bukan bug overlay produk — sesudah `ensureSettingOpen(page,"hymns")` tes lulus 3,4 s                                                                       | DONE     | —                                                                                                                                                                               |
| B-20 | P1        | Diagnostik direkam tetapi **tidak pernah ditampilkan**: tidak ada UI yang memanggil `getDiagnostics()`                                                                               | `grep getDiagnostics` hanya menemukan definisi + unit test; saran "buka Diagnostik" pada laporan siklus 2 tidak dapat diikuti pengguna                                                                                                                  | DONE     | Panel baca-saja + salin/hapus di bagian Tentang; e2e `more-device-data` menjaga regresi                                                                                         |
| B-21 | P1        | Percobaan WhatsApp yang kedaluwarsa hanya menghapus badge — pengguna tidak tahu apa yang harus dilakukan                                                                             | e2e `WhatsApp timeout…`: badge hilang, tab tetap terbuka, tidak ada pesan apa pun                                                                                                                                                                       | DONE     | Notice `role="status"` di kartu akun + diagnosa `egys.whatsapp.timeout`; hilang saat percobaan baru                                                                             |
| B-22 | P1        | Asersi e2e "tracking subscribes before the message link opens" bertentangan dengan desain dan flaky (gagal 2/3 kali dengan `--workers=2`)                                            | route `api.whatsapp.com` melempar bila socket belum ada; implementasi sengaja membuka tab lebih dulu. Sesudah diperbaiki: `egys-v1` 20/20 dua kali berturut-turut                                                                                       | DONE     | —                                                                                                                                                                               |
| B-23 | P0        | **Kerentanan keamanan**: `zod < 4.6.6` (GHSA-mrhx-c7xc-m3w5, high) di `apps/bff` dan `packages/contracts`                                                                            | `pnpm audit --prod` gagal di CI run 41017133824 dan lokal; sesudah bump `zod` 4.4.3 → 4.6.6 audit bersih, typecheck + 511 tes web + 131 paket lulus                                                                                                     | DONE     | Biaya: initial JS 172,0 → **179,3 KiB** (sisa 0,7 KiB dari batas 180) — pantau sebelum menambah kode di graph awal                                                              |
| B-24 | P1        | Headroom anggaran bundle tipis setelah patch `zod`; fitur berikutnya bisa menembus batas                                                                                             | `pnpm verify:bundle` siklus 11 (host Linux): **179,0/180 KiB** — sisa **1,0 KiB**; chunk `dist-*` (contracts) tetap 27,8 KiB; `index-*.js` 84,4 KiB                                                                                                     | NEXT     | Ukur tiap perubahan graph awal; usulan termurah: pindahkan `installMidiQueueCoordinator`/`music-assets` (≈28 KiB chunk `dist-`) ke impor dinamis setelah paint pertama          |
| B-25 | P1        | CI `e2e-shard (2)` gagal pada run 41027417626 — akar masalah ditemukan dan diperbaiki di siklus 11                                                                                   | Tiga klaster: (a) tujuh grup More `open` vs kontrak collapsed, (b) kontrak dock/tempo basi (`:scope > .media-transport-controls`, teks "88 BPM", input tempo kedua), (c) grid Kidung 44 vs 36 px. Plus bug reveal deep link ≥768 px dan tiga cacat a11y | DONE     | — (sisa suite penuh: B-30)                                                                                                                                                      |
| B-26 | P1        | Tujuh grup More tertinggal `open` setelah rework collapsible: tujuh baris tidak lagi muat satu viewport ponsel dan setiap kontrak "klik untuk membuka" justru menutup grup           | Sebelum: `[open]` 7/7 di `/lainnya`; sesudah: 0/7, dan `?section=account                                                                                                                                                                                | data     | help` membuka baris yang benar di 390/768/1440 (`account-menu`4/4,`more-section-deeplink` 5/5)                                                                                  | DONE | —   |
| B-27 | P1        | Tautan "Akun e-GYS" tidak membuka baris akun di 768/1440 px karena installer DOM membuka elemen yang sudah diganti React saat navigasi                                               | probe 390/768/1440: `open=""` hanya di 390; sesudah reveal lewat `useEffect(location.search)` di `MorePage`: 3/3 lulus                                                                                                                                  | DONE     | —                                                                                                                                                                               |
| B-28 | P1        | Tiga cacat a11y baru terlihat saat grup tertutup: landmark `landmark-unique` duplikat di kartu Diagnostik, kontras label akun 4,26:1, live region pencarian hilang saat indeks cepat | axe 4.13: dua region bernama "Diagnostik perangkat"; `.account-button-label` #0079a8 pada #e3f2fa = 4,26:1 (13 px); `role=status` kosong saat indeks siap                                                                                               | DONE     | —                                                                                                                                                                               |
| B-29 | P2        | Grid kontrol Kidung mereservasi 44 px untuk tombol 36 px sehingga menyisakan 12 px sel mati di semua lebar ≤1100 px                                                                  | `unused` 12 px di 320/390/430/600/601/768/820/1024/1100; sesudah kolom `max-content` menjadi 4 px; tes coarse-pointer baru menjaga target 44 px                                                                                                         | DONE     | —                                                                                                                                                                               |

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
Screenshot/log/commit/PR: commit 2d0b226; log di D:\GYSApp-audit\*.log.
Risiko/regresi, blocker, rollback: perubahan konfigurasi saja; rollback =
  kembalikan 4 berkas.
Status: DONE
NEXT: audit login e-GYS (permintaan pemilik) + perbaiki kontrak e2e e-GYS.
```

```text
Cycle: 2 | 2026-10-30 10:05–10:20 WIB | codex/autonomous-hardening-20261030
Issue & priority: login WhatsApp dilaporkan masih gagal (P1, permintaan
  pemilik) dan Apple belum terbukti; suite e2e e-GYS merah di HEAD (P1).
Reproduction / baseline:
  - Klik WhatsApp di preview produksi: start 200, popup wa.me, WS track
    terbuka dan menerima `connected` + `info`; badge hitung mundur berjalan.
  - `egys-v1.spec.ts` di HEAD: 8 gagal / 20 (6 viewport geometri baris
    provider, 1 badge akun, 1 alur WhatsApp). Uji A/B dengan komponen HEAD
    membuktikan kegagalan bukan berasal dari perubahan sesi ini.
  - 320 px: tombol "WhatsApp" overflow 2 px (scrollWidth 74 vs clientWidth 72).
  - Badge akun gagal karena tes tidak menyatakan precondition sesi: aplikasi
    menerima 401 dari Worker lokal lalu (benar) menghapus profil cache.
  - Geometri baris provider: kartu `.egys-login-box` kini punya padding 14 px
    + border, jadi asersi lama (border box) tidak lagi menggambarkan desain.
Root cause: (a) parser tracking hanya menerima satu varian nama field dan tidak
  meninggalkan jejak saat payload tidak lengkap; (b) dua asersi e2e mengunci
  geometri/env lama; (c) label provider tidak muat di 320 px.
File dan perubahan:
  apps/web/src/egys-whatsapp-tracking.ts (+ .test.ts) — normalisasi refid
    string/angka, alias otp/sender, validasi tetap ketat, 20 unit test.
  apps/web/src/egys-whatsapp.tsx — pakai parser; diagnosa
    egys.whatsapp.start/tracking/tracking.error/tracking.event/tracking.confirm;
    kode dan alasan penutupan socket dicatat.
  apps/web/e2e/egys-v1.spec.ts — bandingkan lebar content-box kartu; nyatakan
    precondition profil lewat route /api/v1/account/profile.
  apps/web/src/styles/02-bible-and-settings.css — @container ≤280px: label
    provider ikon-saja agar tidak terpotong (aria-label tetap).
Verifikasi: PASS — `pnpm typecheck`; `npx vitest run` untuk
  `egys-whatsapp-tracking` + `egys` (22 tes); `pnpm build`;
  `pnpm verify:bundle` 172,0 KiB / 180 KiB; `GYS_E2E_PREBUILT=1
  pnpm test:e2e egys-v1.spec.ts --workers=2 --retries=0` → 20/20 lulus.
UX dan performa sebelum -> sesudah: label provider tidak lagi terpotong di
  320 px; tidak ada perubahan ukuran bundle; tidak ada perubahan alur sukses.
Screenshot/log/commit/PR: D:\GYSApp-audit\e2e-egys3.log,
  out9/wa-click.png, out11/provider-320.png, out12/apple-popup.png.
Risiko/regresi, blocker, rollback: parser hanya menerima lebih banyak bentuk
  field, validasi referensi/kode/nomor tetap; konfirmasi nyata tetap BLOCKED.
  Rollback = kembalikan 5 berkas.
Status: DONE (dengan B-15/B-16 tetap terbuka)
NEXT: B-05 (hero Beranda) atau B-06 (target sentuh tautan kembali), lalu
  jalankan `pnpm test:e2e:smoke` pada build final.
```

```text
Cycle: 3 | 2026-10-30 10:20–10:35 WIB | codex/autonomous-hardening-20261030
Issue & priority: B-06 tautan kembali 17–20 px (P2 aksesibilitas); B-05 hero
  Beranda butuh keputusan berbasis ukuran (P1); B-08 kecurigaan tinggi tombol
  Google (P2) perlu diverifikasi, bukan diasumsikan.
Reproduction / baseline:
  - `elementFromPoint` 10 px di atas/bawah tautan "← Beranda" pada /sauh,
    /suara, dan detail Suara tidak mengenai tautan (painted 55×18 / 107×17).
  - Hero Beranda (preview produksi, service worker aktif): cold boot 581 ms,
    hero ter-paint 5.318 ms; warm boot 260 ms, hero 485 ms; warmer 510 ms.
    Gambar 754×528 px, 708.825 B (PNG penerbit) lewat proxy BFF.
  - `.egys-google-control` ternyata 363×51 px (1440) / 97×44 px (390); angka
    18 px berasal dari elemen label internal GIS, bukan target klik.
Root cause / keputusan:
  (a) tautan kembali hanya setinggi teks 12 px → area klik diperluas dengan
      pseudo-element, sama seperti pola crossref yang sudah ada;
  (b) biaya hero adalah sekali-per-kunjungan dan didominasi respons Worker
      (2 s) + PNG penerbit (692 KB); konversi format memerlukan deploy Worker
      yang tidak diizinkan → tidak ada perubahan kode, dicatat sebagai MEASURED;
  (c) tinggi tombol Google bukan cacat pada cakupan kita.
File dan perubahan:
  apps/web/src/ui-hardening.css — `.detail-back .text-button::before` dengan
    inset -12px/-8px dan `position: relative` pada tautan.
  apps/web/e2e/responsive-touch-targets.spec.ts — regresi baru: area klik
    harus kena 11 px di atas dan di bawah teks pada tiga route.
Verifikasi: PASS — `pnpm build`; `GYS_E2E_PREBUILT=1 pnpm test:e2e
  responsive-touch-targets.spec.ts --workers=1 --retries=0` → 4/4 lulus
  (termasuk tes baru). Probe: hit atas/bawah/kanan mengenai tautan, baris
  breadcrumb tetap 17–18 px (tidak ada pergeseran layout).
UX dan performa sebelum -> sesudah: target efektif 71×42 px dari 55×18 px tanpa
  memindahkan isi halaman; bundle tidak berubah.
Screenshot/log/commit/PR: D:\GYSApp-audit\e2e-touch.log,
  out13/home-cold.png, out13/home-warm.png.
Risiko/regresi, blocker, rollback: pseudo-element hanya memperluas hit area,
  tidak menutupi kontrol lain (tetangga adalah teks non-interaktif). Rollback =
  kembalikan 2 berkas.
Status: DONE
NEXT: B-10 (snapshot Sauh basi) dan B-09 (alias /alkitab) setelah memastikan
  tidak ada P1 lain; lalu `pnpm test:e2e:smoke` pada build final.
```

```text
Cycle: 4 | 2026-10-30 10:35–10:50 WIB | codex/autonomous-hardening-20261030
Issue & priority: Pencarian global hanya mengembalikan ayat Alkitab dan macet
  pada status "Menyiapkan indeks lokal…" (P1: fitur yang dijanjikan tidak
  tersambung). Ditemukan saat menjalankan `pnpm test:e2e:smoke`.
Reproduction / baseline:
  - Buka Cari (Ctrl+K): status tetap "Menyiapkan indeks lokal…" >12 s; kueri
    "Pujilah Allah" dan "kidung" hanya mengembalikan ayat Alkitab.
  - Kelima sumber statis mengembalikan 200 (hymn-catalog 917.610 B, literature,
    faith, sauh, suara-sejati), jadi beban ada di refresh online.
  - `GET /api/v1/content/suara-sejati` pada Worker hosted tidak pernah menjawab
    (timeout >25 s, dua kali). `literature` 652 ms dan `sauh` 1.462 ms normal.
Root cause: `loadSearchIndex()` menunggu `Promise.allSettled` atas tiga refresh
  BFF tanpa batas waktu; satu endpoint yang menggantung menahan seluruh indeks,
  sehingga entri kurasi (kidung/literatur/iman/sauh/suara) tidak pernah terisi.
File dan perubahan:
  apps/web/src/global-search.tsx — `readJson` menerima `AbortSignal`; refresh
    online dibungkus `withRequestDeadline(…, 3_000)` dan memakai baseline
    bundel bila lewat tenggat.
Verifikasi: PASS — `pnpm typecheck`; `pnpm build`; probe: status siap ~2 s,
  "10 hasil ditemukan untuk “Pujilah Allah”" dengan 001/002/003/008 kidung di
  depan ayat; `GYS_E2E_PREBUILT=1 pnpm test:e2e smoke.spec.ts -g "global search"`
  → 2/2 lulus (sebelumnya keduanya gagal).
UX dan performa sebelum -> sesudah: pencarian lintas aplikasi kembali berfungsi
  dalam ~2 s dan tetap offline-first; tidak ada perubahan bundle yang berarti.
Screenshot/log/commit/PR: D:\GYSApp-audit\e2e-smoke2.log.
Risiko/regresi, blocker, rollback: tenggat 3 s hanya membatasi refresh opsional;
  baseline bundel tetap dipakai. Endpoint `suara-sejati` yang menggantung adalah
  cacat deployment Worker → BLOCKED untuk agent. Rollback = 1 berkas.
Sisa smoke (di luar cakupan siklus ini):
  - `home and more fixed chrome follows English and Chinese locales` → B-18.
  - `home uses Sauh for the daily verse and keeps one continue surface` → B-18.
  - `MIDI queue persists from a hymn detail into the utility surface` → B-19.
Status: DONE
NEXT: B-18 (asersi smoke Beranda yang basi) dan B-19 (kartu MIDI terhalang),
  lalu B-15 (bukti WhatsApp dari pemilik).
```

```text
Cycle: 5 | 2026-10-30 10:50–11:05 WIB | codex/autonomous-hardening-20261030
Issue & priority: tiga tes smoke yang tersisa (P2) semuanya menuntut perilaku
  UI sebelum rework: eyebrow Sauh yang dihapus dan klik `summary` yang kini
  menutup grup karena grup terbuka secara default.
Reproduction / baseline:
  - `home and more fixed chrome…`: `getByText("Today’s Sauh")` tidak ada;
    setelah diganti h1 EN, `.appearance-card` "hidden" karena klik `summary`
    menutup grup.
  - `home uses Sauh…`: `.verse-panel .section-heading` sudah tidak dirender.
  - `MIDI queue persists…`: 73 retry; tombol bergeser ke bawah heading
    `offline` setelah grup `hymns` tertutup — bukan bug overlay produk.
Root cause: asersi mengunci markup lama dan mengasumsikan grup tertutup,
  padahal commit `5809602` membuat grup terbuka pada paint pertama.
File dan perubahan:
  apps/web/e2e/smoke.spec.ts — helper `ensureSettingOpen(page, id)` yang hanya
    mengeklik `summary` bila grup belum `open`; tiga asersi Beranda diganti ke
    kontrak sekarang (h1 EN "Readings & hymns", `.sauh-reference` = "Yohanes 3:16").
Verifikasi: PASS — `home and more fixed chrome` 1/1, `home uses Sauh` 1/1,
  `MIDI queue persists` 1/1, lalu suite smoke penuh pada build final.
UX dan performa sebelum -> sesudah: tidak ada perubahan produk; hanya
  determinisme tes.
Risiko/regresi, blocker, rollback: asersi tetap memeriksa label terlokalisasi,
  konten Sauh hari ini, jumlah item playlist, dan persistensi setelah reload.
  Rollback = 1 berkas.
Status: DONE
NEXT: B-15 (bukti WhatsApp dari pemilik), B-10 (snapshot Sauh), B-09 (alias
  /alkitab), dan perbaikan endpoint `suara-sejati` di Worker oleh pemilik.
```

```text
Cycle: 6 | 2026-10-30 11:05–11:25 WIB | codex/autonomous-hardening-20261030
Issue & priority: lanjutan Fase 1/Fase 3 pada sumbu yang belum pernah diukur
  (tema, skala teks, keyboard, offline, media) untuk menemukan P1 baru; tidak
  ada bug produk yang muncul, sehingga hasilnya dicatat sebagai bukti PASS dan
  satu penjaga regresi ditambahkan untuk perbaikan siklus 4.
Reproduction / baseline:
  - Tema gelap/AMOLED × 8 route × skala 100/200% = 32 render.
  - Keyboard: 22 Tab per route pada 7 route.
  - Offline: preview 4173, SW mengontrol, `setOffline(true)`, reload + 4 route.
  - Gambar katalog: /suara (165 <img>) dan /literatur (307 <img>).
  - PDF Literatur: item `?read=1`, tunggu canvas pertama.
  - MIDI Kidung: chip MIDI pada hymn-001, klik "Putar".
Hasil: lihat tabel 2.4. Semua sumbu PASS; tidak ada overflow, teks terpotong,
  pelanggaran kontras, fokus hilang, atau aset yang gagal dimuat.
False positive yang diverifikasi ulang: indikator fokus per-elemen tidak ada,
  padahal pembungkus `:focus-within` (`.faith-search-bar`, `.search-field`)
  memberi ring 3px + border biru; `button.faith-row-summary` berubah warna.
  Panel pencarian Alkitab yang tertutup memang `pointer-events: none` sampai
  dibuka — bukan bug.
File dan perubahan:
  apps/web/e2e/smoke.spec.ts — tes baru "global search stays usable when a
    content refresh never answers": route `suara-sejati` sengaja digantung,
    indeks harus tetap siap ≤10 s dan tanpa teks "Menyiapkan indeks lokal…".
Verifikasi: PASS — `GYS_E2E_PREBUILT=1 pnpm test:e2e smoke.spec.ts -g
  "global search stays usable"` → 1/1 lulus (5,6 s, termasuk tenggat 3 s).
UX dan performa sebelum -> sesudah: tidak ada perubahan produk pada siklus ini;
  bukti untuk matriks dan satu penjaga regresi baru.
Screenshot/log/commit/PR: D:\GYSApp-audit\out15..out25,
  D:\GYSApp-audit\e2e-search-hang.log.
Risiko/regresi, blocker, rollback: tes hanya menambah cakupan; rollback = 1 berkas.
Status: DONE
NEXT: B-15 (bukti WhatsApp dari pemilik) dan perbaikan endpoint `suara-sejati`
  di Worker; tanpa itu, lanjutkan ke B-09/B-10.
```

```text
Cycle: 7 | 2026-10-30 11:25–11:45 WIB | codex/autonomous-hardening-20261030
Issue & priority: saat memverifikasi saran pemantauan WhatsApp, ditemukan bahwa
  `getDiagnostics()` tidak pernah dipanggil UI mana pun (P1: bukti kegagalan
  direkam tetapi tidak bisa dibaca pengguna). Saran pada siklus 2 karena itu
  tidak dapat diikuti.
Reproduction / baseline:
  - `grep -r getDiagnostics apps/web/src` → hanya definisi + unit test.
  - Tidak ada kunci i18n "diagnostik" dan tidak ada elemen UI yang membaca
    `localStorage["gys-diagnostics-v1"]`.
  - Probe: menyemai dua entri lalu membuka /lainnya?section=about → tidak ada
    panel apa pun.
Root cause: diagnostics dibangun sebagai saluran internal (record + redact)
  tanpa permukaan baca; tidak ada rencana UI-nya.
File dan perubahan:
  apps/web/src/diagnostics.ts — ekspor `clearDiagnostics()`.
  apps/web/src/more.tsx — panel baca-saja di bagian "Tentang & Bantuan":
    langganan `subscribeDiagnostics`, 20 entri terbaru (waktu, scope, pesan),
    tombol "Salin catatan" (clipboard) dan "Hapus catatan".
  apps/web/src/i18n.ts — 7 kunci baru di id/en/zh.
  apps/web/src/styles/02-bible-and-settings.css — kartu log; baris ditumpuk
    (bukan grid 3 kolom) karena grid menyempitkan pesan pada 390 px.
  apps/web/e2e/more-device-data.spec.ts — tes panel + `ensureSettingOpen`
    untuk tes reset yang juga menutup grup `offline` (kontrak basi yang sama).
Verifikasi: PASS — `pnpm typecheck`; unit `i18n` + `diagnostics` (6 tes);
  `pnpm build`; `pnpm verify:bundle` **172,4 KiB** (batas 180);
  `GYS_E2E_PREBUILT=1 pnpm test:e2e more-device-data.spec.ts` → 2/2 lulus;
  `egys-v1.spec.ts` 20/20 dan `smoke` 44/44 pada build yang sama. Uji hidup:
  menekan "Login dengan WhatsApp" di 5173 merekam
  `egys.whatsapp.start — Prepared reference …` dan entri itu tampil di panel
  (`out32/diagnostics-live.png`), sehingga jalur rekam → pengguna terbukti.
UX dan performa sebelum -> sesudah: kegagalan login/unduhan kini dapat dibaca
  dan disalin dari Pengaturan (sebelumnya hanya di localStorage); +0,4 KiB gzip.
Screenshot/log/commit/PR: D:\GYSApp-audit\out32\diagnostics-card.png,
  D:\GYSApp-audit\e2e-diag2.log.
Risiko/regresi, blocker, rollback: data yang ditampilkan sudah diredaksi
  (`recordDiagnostic` menulis `[redacted]` untuk token/authorization) dan
  dibatasi 20 baris; tombol hapus hanya mengosongkan log lokal. Rollback = 5 berkas.
Status: DONE
NEXT: minta pemilik mengulang login WhatsApp lalu membuka Pengaturan → Tentang
  & Bantuan → Diagnostik perangkat, dan menyalin entri `egys.whatsapp.*`.
```

```text
Cycle: 8 | 2026-10-30 11:55–12:15 WIB | codex/autonomous-hardening-20261030
Issue & priority: percobaan login WhatsApp yang melewati tenggat 120 detik hanya
  menghapus badge tanpa menjelaskan apa pun (P1 untuk alur yang dilaporkan
  pemilik); sekaligus asersi e2e "tracking subscribes before the message link
  opens" terbukti flaky dan bertentangan dengan desain (P1 pada gerbang tes).
Reproduction / baseline:
  - e2e `WhatsApp timeout…`: setelah `fastForward(120_000)` badge hilang, tab
    pesan tetap terbuka, dan tidak ada teks apa pun di kartu akun.
  - `egys-v1` dengan `--workers=2` gagal 2 dari 3 kali pada asersi
    `expect(tracking).toBeDefined()` di dalam route `api.whatsapp.com`.
Root cause: (a) status percobaan hanya hidup di dalam badge yang dilepas saat
  tenggat; (b) implementasi sengaja membuka tab lebih dulu (komentar di
  `egys-whatsapp.tsx` menjelaskan alasan UX-nya), sehingga asersi lama hanya
  lulus bila socket kebetulan lebih cepat.
File dan perubahan:
  apps/web/src/egys-whatsapp.tsx — prop `onExpire` disimpan di ref (agar
    closure baru tidak merestart effect dan mengulang tenggat), dipanggil
    sebelum `onCancel`; diagnosa `egys.whatsapp.timeout`.
  apps/web/src/more.tsx — state `whatsAppNotice`, dibersihkan saat percobaan
    baru atau login selesai, dirender sebagai `role="status"` di kartu akun.
  apps/web/src/i18n.ts — `more.whatsappExpired` (id/en/zh).
  apps/web/src/styles/02-bible-and-settings.css — kartu notice.
  apps/web/e2e/egys-v1.spec.ts — timeout test memeriksa notice muncul lalu
    hilang saat percobaan baru; asersi socket diubah menjadi
    `expect.poll(tracking !== undefined)` setelah tab terbuka.
Verifikasi: PASS — `pnpm typecheck`; `pnpm build`; unit web 511; `egys-v1`
  **20/20 dua kali berturut-turut** (`--workers=2 --retries=0`); `smoke` 44/44.
UX dan performa sebelum -> sesudah: kegagalan WhatsApp kini memberi langkah
  berikutnya yang konkret alih-alih diam; tidak ada perubahan bundle material.
Screenshot/log/commit/PR: D:\GYSApp-audit\out33\notice.png,
  D:\GYSApp-audit\e2e-wa-timeout3.log, e2e-egys8-1/2.log.
Risiko/regresi, blocker, rollback: notice murni informatif; tenggat, socket,
  dan tab tidak berubah perilakunya. Rollback = 5 berkas. Konfirmasi pesan
  nyata tetap BLOCKED sampai pemilik mengirim pesan dan menyalin Diagnostik.
Status: DONE
NEXT: B-15 (bukti WhatsApp dari pemilik), B-09 (/alkitab), B-10 (snapshot Sauh).
```

```text
Cycle: 9 | 2026-10-30 12:15–12:30 WIB | codex/autonomous-hardening-20261030
Issue & priority: gate `pnpm verify:prepush` belum pernah dijalankan pada branch
  (P1 rilis); `/alkitab` masih 404 meski antarmuka berbahasa Indonesia (P3,
  dikerjakan karena tidak ada P0/P1/P2 lain yang actionable).
Reproduction / baseline:
  - `pnpm verify:prepush` → PASS (format, docs, provenance, tipe, unit, policy,
    62 tes skrip root) pada commit 3624b5c.
  - `/alkitab` → halaman "Halaman tidak ditemukan"; hanya `/bible` dan `/more`
    (alias Inggris) yang punya redirect (`App.tsx`).
File dan perubahan:
  apps/web/src/App.tsx — `<Route path="/alkitab" element={<Navigate to="/bible" replace />} />`
    mengikuti pola `/more` → `/lainnya`.
  apps/web/e2e/navigation-layout.spec.ts — tes baru: `/alkitab` berakhir di
    `/bible` dan judul "Kejadian 1" tampil.
Verifikasi: PASS — `pnpm build`; `GYS_E2E_PREBUILT=1 pnpm test:e2e
  navigation-layout.spec.ts -g "Indonesian Bible alias"` → 1/1 lulus.
UX dan performa sebelum -> sesudah: URL berbahasa Indonesia tidak lagi menjadi
  jalan buntu; tidak ada biaya bundle yang berarti (satu rute redirect).
Screenshot/log/commit/PR: D:\GYSApp-audit\e2e-alias.log,
  D:\GYSApp-audit\prepush.log.
Risiko/regresi, blocker, rollback: rute tambahan bersifat `replace`, tanpa
  riwayat ganda. Rollback = 2 berkas.
Status: DONE
NEXT: B-15 (bukti WhatsApp dari pemilik) dan perbaikan endpoint `suara-sejati`
  di Worker; B-10 (snapshot Sauh) perlu keputusan pemilik karena tidak ada
  generator di repo.
```

```text
Cycle: 10 | 2026-10-30 13:50�14:05 WIB | codex/autonomous-hardening-20261030
Issue & priority: beban uji penuh di mesin lokal (permintaan pemilik) dan
  sinkronisasi ke GitHub Actions; CI kemudian menemukan kerentanan high pada
  dependensi (P0 keamanan).
Reproduction / baseline:
  - `pnpm test:e2e` penuh dihentikan setelah 272 tes (67 gagal) karena memakan
    CPU/jaringan mesin ini; `ci.yml` hanya jalan pada `pull_request` atau push
    ke `main`.
  - Push branch + draft PR #11 ? CI run 41017133824; job `verify` gagal di
    langkah `pnpm audit --prod`.
  - `pnpm audit --prod` lokal: `zod <4.6.6`, GHSA-mrhx-c7xc-m3w5 (high), jalur
    `apps/bff>zod` dan `packages/contracts>zod` (terpasang 4.4.3).
Root cause: dependensi produksi tertinggal dari versi perbaikan; beban verifikasi
  penuh belum didelegasikan ke CI.
File dan perubahan:
  apps/bff/package.json, packages/contracts/package.json � `zod` 4.4.3 ? 4.6.6.
  pnpm-lock.yaml � lockfile diperbarui lewat `pnpm install`.
  docs/plans/... � kebijakan delegasi CI, status bundle, backlog B-23.
Verifikasi: PASS � `pnpm audit --prod` bersih; `pnpm typecheck`; `pnpm test`
  (511 web + 131 workspace + 62 skrip); `pnpm build`; `pnpm verify:bundle`
  179,3 KiB / 180.
UX dan performa sebelum -> sesudah: tidak ada perubahan UX; initial JS naik
  6,8 KiB karena zod lebih besar � dicatat sebagai trade-off keamanan.
Screenshot/log/commit/PR: PR #11 https://github.com/gyspnk/GYSApp-Tauri/pull/11,
  CI run 41017133824, D:\GYSApp-audit\test-zod.log, bundle-zod.log.
Risiko/regresi, blocker, rollback: sisa headroom bundle 0,7 KiB; rollback =
  kembalikan 3 berkas bila CI menemukan regresi zod.
Status: DONE (menunggu CI ulang setelah push)
NEXT: pantau CI run berikutnya; triase kegagalan browser shard yang tersisa
  (banyak di antaranya membutuhkan fixture jaringan atau kontrak basi).
```

```text
Cycle: 11 | 2026-10-30 21:28–22:45 WIB | codex/autonomous-hardening-20261030
Issue & priority: suite e2e penuh ternyata merah karena satu regresi produk
  (P1) dan sekumpulan kontrak basi (P2); tiga cacat a11y (P1) baru terlihat
  setelah regresi itu diperbaiki.
Reproduction / baseline:
  - Clone bersih di host Linux aarch64; typecheck/unit/build/bundle/docs/format
    PASS sebelum perubahan (lihat 2.6). Browser harness belum ada: Chromium 151
    + lib Arch ARM harus dipasang lebih dulu.
  - `--shard=2/3 --workers=2` (B-25): 19 kegagalan sebelum dihentikan pada
    86/342 karena lambat di ARM. Klaster: menu-motion 3, more-section-deeplink 1,
    mobile-scroll-kidung 5, midi-scrub 3, kidung-usability 2, navigation-layout 1.
  - Akar klaster terbesar: `/lainnya` merender **tujuh** grup `open` (enam atribut
    statis + state `hymnSettingsOpen=true`), padahal CF-066 dan ui-audit
    mendokumentasikan "collapsed until requested"; setiap tes yang mengeklik
    `summary` untuk membuka justru menutup grup.
  - Probe 390/768/1440: tautan "Akun e-GYS" hanya membuka baris akun di 390.
Root cause: (a) sisa `open` dari rework 5809602 setelah 023a0e5 membuat grup
  collapsible; (b) reveal deep link menulis ke node DOM yang sudah diganti React
  pada lebar ≥768; (c) grid Kidung 96px/1fr/44px sementara kontrol 36px;
  (d) kontrak e2e mengunci markup lama (dock, tempo, split view, chord,
  literatur); (e) `landmark-unique` + kontras label akun + live region pencarian.
File dan perubahan:
  apps/web/src/more.tsx — semua `open` dihapus; `hymnSettingsOpen` false;
    reveal `?section=` lewat `useEffect(location.search)`; label landmark log.
  apps/web/src/route-section-deeplink.ts — hanya alignment; target `kidung`.
  apps/web/src/kidung-responsive.css — kolom ketiga `max-content`.
  apps/web/src/app-design.css — `.account-button-label` memakai `--navy`.
  apps/web/src/global-search.tsx + i18n.ts — `search.hint`, live region stabil.
  apps/web/e2e/*.spec.ts — 8 berkas kontrak (account-menu, kidung-usability,
    mobile-scroll-kidung, kidung-section-navigation, accessibility, midi-scrub).
Verifikasi: PASS — typecheck; `pnpm test` (20/45/2/74/511 + 62 skrip); build;
  `verify:bundle` 179,0/180; `verify:generated`; `verify:docs`; `format:check`;
  e2e terarah `--retries=0`: deeplink 5/5, universal-usability 10/10,
  menu-motion 12/12, account-menu 4/4, kidung-section-navigation 6/6,
  accessibility+editorial-ui 35/35, mobile-scroll-kidung 10/10, midi-scrub 3/3,
  kidung-loading 2/2, kidung-usability dock 2/2.
  Suite penuh (823 tes) dijalankan ulang pada build final setelah seluruh
  perbaikan dengan `--workers=3 --retries=0`; angka akhirnya dicatat pada
  siklus berikutnya agar tidak ada klaim sebelum selesai.
UX dan performa sebelum -> sesudah: tujuh baris kategori kembali muat satu
  viewport ponsel; deep link akun/data/help/kidung bekerja di semua lebar;
  target sentuh coarse pointer tetap 44 px; kontras label akun naik ke ±9:1;
  bundle 179,0 KiB (tidak berubah material; +2 string i18n).
Screenshot/log/commit/PR: commit b9a6e6c (produk) dan e83b588 (kontrak e2e);
  log di /tmp/e2e-batch{1..7}.log, /tmp/e2e-full2.log; PR #11 tetap terbuka.
Risiko/regresi, blocker, rollback: reveal dipindah ke React sehingga tidak ada
  lagi tulisan DOM lintas commit; rollback = kembalikan 8 berkas sumber.
Status: DONE (sisa triase suite penuh: B-30)
NEXT: selesaikan run suite penuh dan triase sisa kegagalan; lalu B-24 (headroom
  1,0 KiB) dan B-15 (bukti WhatsApp dari pemilik).
```

## 5. Risiko dan batasan bukti

- **Kebijakan uji terbaru (permintaan pemilik, 30 Oktober 2026): uji penuh dijalankan
  LOKAL di perangkat pemilik yang lebih kuat; GitHub Actions bukan lagi gate.**
  Mesin ini hanya untuk iterasi cepat (dev 5173, `typecheck`, unit test,
  `verify:bundle`, e2e terarah). Bukti CI yang sempat didapat tetap dicatat di §1,
  tetapi kegagalan/pending shard tidak boleh memblokir pekerjaan; lihat B-25 untuk
  reproduksi lokalnya. `main` tetap tidak disentuh dan tidak ada merge.
- Angka latensi berasal dari satu jaringan rumah, bukan CI. Jangan membandingkannya
  dengan audit 2026-10-11 tanpa metode identik.
- Probe UI umumnya memblokir service worker. Siklus 6 menguji cache offline secara
  khusus dengan SW aktif (reload offline 91 ms, 4 route penuh) — lihat 2.4. Klaim
  offline lain di luar itu (misalnya unduhan aset terdistribusi) tetap perlu tes
  tersendiri (`runtime-health.spec.ts`, `service-worker-upgrade.spec.ts`).
- Pelajaran harness: di 390 px kontrol "CARI ALKITAB" versi desktop ada di DOM tapi
  tersembunyi 1 px; kontrol sebenarnya adalah ikon "Buka pencarian ayat di Alkitab".
  Mengklik elemen tersembunyi dengan `force` membuat pemeriksaan tampak gagal
  padahal bukan bug produk. Verifikasi dulu bahwa titik klik benar-benar mengenai
  target (`elementFromPoint`) sebelum menyimpulkan cacat.
- Worker hosted adalah artefak terpisah: hasil 2.5 adalah performa dan perilaku
  deployment saat ini, bukan kode repo ini. Perubahan `apps/bff` **belum** dideploy.
- `apps/web/.env.local` adalah konfigurasi lokal pemilik (2026-08-18). Perbaikan
  B-01 menyesuaikan tes, bukan menghapus konfigurasi tersebut.
- Konfirmasi WhatsApp dan langkah kredensial Apple tidak dapat dijalankan tanpa
  ponsel/akun pemilik. Jangan menandainya selesai.
- e2e terarah sudah dijalankan (`egys-v1` 20/20, `smoke` 44/44,
  `responsive-touch-targets` 4/4, `more-device-data` 2/2, `navigation-layout`
  alias + Escape). Di mesin Windows, suite penuh **dihentikan** (272 tes, 67
  gagal sebelum dihentikan) karena beban lokal.
- **Siklus 11 pindah host** ke container Linux aarch64 (Node 26, Chromium 151).
  Hasil browser di sana **bukan** hasil mesin pemilik: jangan membandingkan
  angka waktu, dan jangan menganggap suite hijau di sini berarti hijau di
  perangkat pemilik. Yang dapat dipindahkan adalah nama tes, akar masalah, dan
  perbaikan kontraknya.
- Spesifikasi axe yang berat (`accessibility`, `editorial-ui`) membutuhkan
  `--workers≤2` di host ARM ini; pada empat worker keduanya timeout 40 dtk
  tanpa kegagalan asersi. Perlakukan sebagai batas host, bukan flake produk.
- Preview pemilik memakai dev server 5173 dengan `VITE_BFF_BASE_URL` sebagai env
  proses. Jangan menulis nilai itu ke `apps/web/.env.local`: `pnpm build` akan
  membakukannya ke `dist` dan mengubah perilaku e2e (yang mengandalkan origin
  lokal tanpa Worker).

## 6. NEXT yang dapat langsung dikerjakan

1. **B-30 — selesaikan suite penuh** `pnpm test:e2e --workers=3 --retries=0`
   pada build final (823 tes) dan triase sisanya. Jalankan sendirian: proses
   browser lain, termasuk `pnpm test:e2e -g`, membuat tes berbasis waktu gagal
   palsu (terbukti pada `account-menu` dan 200% text di siklus 11).
2. **B-15** — Minta pemilik menekan WhatsApp, mengirim pesan yang disiapkan, lalu
   membuka Diagnostik: entri `egys.whatsapp.*` menunjukkan apakah frame tracking
   datang dan field mana yang kurang. Tanpa data ini, penyebab tidak boleh diklaim.
3. **B-24** — Headroom bundle tinggal **1,0 KiB** (179,0/180) di host Linux.
   Setiap penambahan kode di graph awal akan menembus anggaran; ukur dulu. Kandidat
   termurah: impor dinamis `midi-queue`/`music-assets` setelah paint pertama
   (chunk `dist-` 27,8 KiB keluar dari graph awal), diuji dengan `smoke` MIDI
   queue dan `kidung-usability` dock.
4. **B-05** — Keputusan ditunda dengan bukti (cold 5,3 s / warm 0,49 s). Jika suatu
   saat Worker boleh dideploy, konversi format adalah tuas utamanya.
5. **B-10** — Snapshot Sauh ditutup sebagai keputusan data pemilik (tidak ada
   generator; cache disegarkan otomatis saat online).

## 7. Prompt handoff untuk sesi berikutnya

Tempelkan blok berikut sebagai pesan pertama di sesi baru. Isinya lengkap dan tidak
bergantung pada riwayat percakapan sebelumnya.

```text
Kamu adalah coding agent untuk repo GYSApp-Tauri. Lanjutkan pekerjaan dari titik
handoff 30 Oktober 2026. Baca dokumen hidup ini lebih dulu:
docs/plans/2026-10-30-autonomous-development-handoff.md — itu satu-satunya
sumber status, keputusan, backlog, dan NEXT. Jangan membuat rencana induk baru.

## Keadaan repo saat handoff
- Remote: https://github.com/gyspnk/GYSApp-Tauri (branch default `main`, dilindungi).
- Branch kerja: `codex/autonomous-hardening-20261030` (sudah di-push; HEAD = commit
  dokumen ini, worktree bersih, lokal == remote). Commit kode terakhir: `b9a6e6c`
  (produk) dan `e83b588` (kontrak e2e).
- PR: #11 "Autonomous hardening: local gates, WhatsApp diagnostics, search index,
  a11y" (status ready-for-review; JANGAN merge sendiri).
- 19 commit sejak 37ffbd0: gate tes lokal, watcher Windows, format gate, kunci i18n
  mati; toleransi+diagnostik tracking WhatsApp; notice kedaluwarsa WhatsApp; indeks
  pencarian tidak lagi menunggu Worker; target sentuh tautan kembali; panel
  Diagnostik; Escape/focus sheet Iman; `/alkitab` → `/bible`; patch zod 4.6.6;
  perbaikan kontrak e2e yang basi; catatan CI; **siklus 11**: grup More kembali
  collapsed + reveal deep link dari React, grid kontrol Kidung, kontras label akun,
  landmark Diagnostik unik, live region pencarian, delapan kontrak e2e.

## Lingkungan
- Sesi 30 Okt pertama: Windows, Node v24.18.0, pnpm 11.21.0, Chromium terpasang.
- Sesi lanjutan (siklus 11): container **Linux aarch64**, Node v26.12.1, pnpm
  11.21.0 (npm -g; corepack tidak ada), Chromium 151 diunduh + lib Arch ARM
  dipasang manual. `apps/web/.env.local` tidak ada di clone ini.
- `pnpm dev` → http://127.0.0.1:5173/ (WAJIB hidup dan HTTP 200). Untuk preview
  pemilik, jalankan dengan `VITE_BFF_BASE_URL=<Worker>` sebagai env proses; jangan
  menulisnya ke `.env.local` karena `pnpm build` akan membakukannya ke `dist`.
- `pnpm preview` → http://127.0.0.1:4173/GYSApp-Tauri/ untuk e2e produksi (tanpa
  env BFF; asersi "Worker absen" bergantung pada itu).
- `cargo`/Java TIDAK terpasang; native check/packaging butuh mesin lain.

## Kebijakan pemilik (berlaku)
1. Uji penuh dan build berat dijalankan LOKAL di perangkat pemilik yang lebih kuat.
   GitHub Actions tidak lagi menjadi gate; jangan menghabiskan waktu mengejar CI.
2. Setiap perubahan harus ter-commit dan ter-push ke branch kerja; `main` tidak
   disentuh, tidak ada merge/force-push.
3. Jangan pernah `reset --hard`, `clean -fd`, atau menghapus pekerjaan pengguna.
4. Iterasi kecil dan terukur; pertahankan semua fitur lama dan kontrak offline/PDF.
5. Kejujuran bukti: bedakan unit, mocked, browser lokal, hosted Worker, native,
   dan perangkat fisik. Tulis PASS/FAIL/NOT RUN, bukan "semua aman".

## Yang sudah terbukti (jangan diulang tanpa alasan)
- `pnpm typecheck`, `pnpm test` (511 web + contracts 20 + domain 45 + testkit 2 +
  bff 74 + 62 skrip root), `pnpm build`, `pnpm verify:generated`, `pnpm verify:docs`,
  `pnpm format:check`, `pnpm verify:prepush`.
- `pnpm audit --prod` bersih setelah zod 4.6.6.
- e2e terarah lokal: `egys-v1` 20/20 (dua kali), `smoke` 44/44,
  `responsive-touch-targets` 4/4, `more-device-data` 2/2, alias `/alkitab` 1/1.
- e2e terarah siklus 11 (Linux, `--retries=0`): `more-section-deeplink` 5/5,
  `universal-usability` 10/10, `menu-motion` 12/12, `account-menu` 4/4 (390/768/
  1440), `kidung-section-navigation` 6/6, `accessibility`+`editorial-ui` 35/35,
  `mobile-scroll-kidung` 10/10 (termasuk coarse pointer 44 px), `midi-scrub` 3/3,
  `kidung-loading` 2/2, `kidung-usability` dock 2/2.
- Audit lintas-sumbu (lihat §2.4): tema gelap/AMOLED + teks 200% tanpa overflow
  maupun pelanggaran kontras; keyboard tanpa fokus hilang; offline (SW) reload
  91 ms dengan 4 route penuh; gambar katalog lazy (14–17 request); PDF Literatur
  halaman pertama 5,0 s; MIDI Kidung benar-benar berjalan (seek 0→5 dtk).
- Login WhatsApp: `start` 200 + cookie HttpOnly, tab wa.me terbuka dengan referensi,
  WS tracking tersambung, rute `confirm` sehat — semua terhadap Worker hosted nyata.

## Yang belum terbukti / terbuka
- **Klaim pesan WhatsApp nyata**: butuh pemilik mengirim pesan lalu menyalin
  Pengaturan → Tentang & Bantuan → Diagnostik perangkat (entri `egys.whatsapp.*`).
- **Apple**: popup resmi + client_id + state terbukti; langkah kredensial butuh
  Apple ID nyata.
- **Worker hosted `/api/v1/content/suara-sejati`** menggantung (>25 s) → perlu
  deploy/perbaikan Worker oleh pemilik. Kode BFF sudah membatasi 15 s.
- **Suite penuh 823 tes** dijalankan ulang di host Linux pada build final
  (`--workers=3 --retries=0`); angka akhir dicatat di §4/B-30 pada siklus
  berikutnya. Jalankan **sendirian**: proses browser paralel membuat tes berbasis
  waktu gagal palsu. Reproduksi kegagalan shard 2 yang lama sudah diklasifikasi:
  B-25 DONE.
- **Headroom bundle 1,0 KiB** (179,0/180 gzip). Ukur sebelum menambah kode di
  graph awal; modul berat harus tetap lazy.
- Native (Rust/Android/Windows installer), signing, perangkat fisik: NOT RUN.

## Urutan kerja yang disarankan
1. Jalankan dev server (5173) dan preview (4173), verifikasi HTTP 200, pastikan UI
   sehat sebelum menyentuh kode.
2. **B-30**: jalankan suite penuh sendirian dan triase sisa kegagalan (klasifikasikan
   bug produk vs kontrak basi vs batas host); tambahkan tes yang gagal lebih dulu.
3. Lanjut ke item P1/P2 di backlog §3 (B-24 headroom 1,0 KiB, B-15 bukti WhatsApp).
4. Setiap siklus: perbarui §1 Status, §3 Backlog, §4 Log siklus, §5 Risiko, §6 NEXT
   di dokumen hidup; commit + push.

## Perintah yang tersedia
pnpm dev | pnpm preview | pnpm typecheck | pnpm test | pnpm build |
pnpm verify:bundle | pnpm verify:generated | pnpm verify:docs | pnpm format:check |
pnpm verify:prepush | pnpm test:e2e --shard=2/3 | pnpm test:e2e:smoke |
GYS_E2E_PREBUILT=1 pnpm test:e2e <spec>

Aturan e2e: jangan rebuild `dist` saat tes browser terhadap aset ber-hash berjalan;
gunakan `GYS_E2E_PREBUILT=1` bila build sudah final. Jangan mengubah snapshot atau
retry demi tes hijau.
```
